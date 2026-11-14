import hashlib
import sys
import threading
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from worker import WorkerError, _run_in_child, compute_result, parse_snapshot, process_job, validate_parameters


class WorkerSnapshotTests(unittest.TestCase):
    def test_snapshot_checksum_and_rating_rows_are_verified(self):
        snapshot = b"user_id,food_id,rating\r\n1,101,5\r\n2,101,4\r\n"
        ratings = parse_snapshot(snapshot, hashlib.sha256(snapshot).hexdigest(), 2)
        self.assertEqual(ratings, {1: {101: 5}, 2: {101: 4}})
        with self.assertRaisesRegex(WorkerError, "SNAPSHOT_CHECKSUM_MISMATCH"):
            parse_snapshot(snapshot, "0" * 64, 2)
        with self.assertRaisesRegex(WorkerError, "SNAPSHOT_INVALID"):
            parse_snapshot(snapshot, hashlib.sha256(snapshot).hexdigest(), 3)

    def test_snapshot_accepts_negative_historical_namespace_without_merging_accounts(self):
        snapshot = b"user_id,food_id,rating\r\n1,101,5\r\n-7001,101,5\r\n-7001,102,4\r\n"
        ratings = parse_snapshot(snapshot, hashlib.sha256(snapshot).hexdigest(), 3)
        self.assertIn(1, ratings)
        self.assertIn(-7001, ratings)
        self.assertNotIn(7001, ratings)

    def test_snapshot_rejects_noncanonical_or_unsafe_user_ids(self):
        for user_id in ("0", "-0", "01", "-01", "9007199254740992", "-9007199254740992", "+1"):
            snapshot = f"user_id,food_id,rating\n{user_id},101,5\n".encode()
            with self.subTest(user_id=user_id), self.assertRaisesRegex(WorkerError, "SNAPSHOT_INVALID"):
                parse_snapshot(snapshot, hashlib.sha256(snapshot).hexdigest(), 1)

    def test_snapshot_rejects_duplicate_pairs_and_invalid_rating(self):
        duplicate = b"user_id,food_id,rating\n1,101,5\n1,101,4\n"
        invalid_rating = b"user_id,food_id,rating\n1,101,6\n"
        for snapshot in (duplicate, invalid_rating):
            with self.subTest(snapshot=snapshot), self.assertRaisesRegex(WorkerError, "SNAPSHOT_INVALID"):
                parse_snapshot(snapshot, hashlib.sha256(snapshot).hexdigest(), 2 if snapshot == duplicate else 1)


class WorkerEngineTests(unittest.TestCase):
    def test_job_parameters_are_strict_and_output_excludes_rated_foods(self):
        ratings = {1: {101: 5}, 2: {101: 5, 102: 4}, 3: {101: 4, 103: 5}}
        parameters = {
            "kNeighbors": 2,
            "topN": 2,
            "minCommonRatings": 1,
            "similarityStrategy": "overlap",
            "activeFoodIds": [101, 102, 103, 104],
        }
        result = compute_result(ratings, parameters)
        self.assertTrue(result["recommendations"])
        for row in result["recommendations"]:
            self.assertNotIn(row["foodId"], ratings[row["userId"]])
            self.assertIn(row["foodId"], parameters["activeFoodIds"])
        with self.assertRaisesRegex(WorkerError, "INVALID_JOB_PARAMETERS"):
            validate_parameters({**parameters, "similarityStrategy": "zero_filled"})

    def test_historical_users_are_neighbors_but_never_recommendation_targets(self):
        ratings = {1: {101: 5}, -7001: {101: 5, 102: 4}}
        parameters = {
            "kNeighbors": 1,
            "topN": 1,
            "minCommonRatings": 1,
            "similarityStrategy": "overlap",
            "activeFoodIds": [101, 102],
            "targetUserIds": [1],
        }
        result = compute_result(ratings, parameters)
        self.assertEqual(result["recommendations"], [{"userId": 1, "foodId": 102, "rank": 1, "predictedRating": 4.0}])
        self.assertEqual(result["userStatuses"], [{"userId": 1, "status": "READY"}])
        with self.assertRaisesRegex(WorkerError, "INVALID_JOB_PARAMETERS"):
            validate_parameters({**parameters, "targetUserIds": [-7001]})

    def test_legacy_job_without_target_list_still_excludes_historical_users(self):
        ratings = {1: {101: 5}, -7001: {101: 5, 102: 4}}
        parameters = {
            "kNeighbors": 1,
            "topN": 1,
            "minCommonRatings": 1,
            "similarityStrategy": "overlap",
            "activeFoodIds": [101, 102],
        }
        result = compute_result(ratings, parameters)
        self.assertEqual(result["recommendations"], [{"userId": 1, "foodId": 102, "rank": 1, "predictedRating": 4.0}])
        self.assertEqual(result["userStatuses"], [{"userId": 1, "status": "READY"}])

    def test_worker_reports_distinct_empty_outcomes_for_each_target(self):
        cases = [
            ({1: {101: 5}, 2: {102: 4}}, [101, 102], 1, [1], "NO_NEIGHBORS"),
            ({1: {101: 5}, 2: {101: 4}}, [101, 102], 1, [1], "NO_PREDICTIONS"),
            ({1: {101: 5}}, [101], 1, [1], "NO_CANDIDATES"),
            ({1: {101: 5}}, [101, 102], 1, [9], "COLD_START"),
        ]
        for ratings, active_food_ids, k_neighbors, target_user_ids, expected_status in cases:
            with self.subTest(status=expected_status):
                result = compute_result(ratings, {
                    "kNeighbors": k_neighbors,
                    "topN": 2,
                    "minCommonRatings": 1,
                    "similarityStrategy": "overlap",
                    "activeFoodIds": active_food_ids,
                    "targetUserIds": target_user_ids,
                })
                self.assertEqual(result["recommendations"], [])
                self.assertEqual(result["userStatuses"], [{"userId": target_user_ids[0], "status": expected_status}])

    def test_engine_runs_in_terminable_child_process(self):
        ratings = {1: {101: 5}, 2: {101: 5, 102: 4}}
        parameters = {
            "kNeighbors": 1,
            "topN": 1,
            "minCommonRatings": 1,
            "similarityStrategy": "overlap",
            "activeFoodIds": [101, 102],
        }

        class Api:
            def heartbeat(self, _job_id, _identity):
                return None

            def report_failure(self, *_args):
                raise AssertionError("Unexpected worker failure")

        api = Api()
        job = {"id": "test-job", "attemptCount": 1, "leaseDurationSeconds": 60}
        result = _run_in_child(ratings, parameters, 10, api, job, {"workerId": "test-worker", "leaseToken": "test-token"}, threading.Event())
        self.assertEqual(result["recommendations"], [{"userId": 1, "foodId": 102, "rank": 1, "predictedRating": 4.0}])
        self.assertEqual(result["userStatuses"], [
            {"userId": 1, "status": "READY"},
            {"userId": 2, "status": "NO_CANDIDATES"},
        ])

    def test_explicitly_claimed_manual_job_runs_and_submits_unverified_candidate_rows(self):
        snapshot = b"user_id,food_id,rating\r\n1,101,5\r\n2,101,5\r\n2,102,4\r\n"
        parameters = {
            "kNeighbors": 2,
            "topN": 1,
            "minCommonRatings": 1,
            "similarityStrategy": "overlap",
            "activeFoodIds": [101, 102],
        }

        class Api:
            submitted = None

            def snapshot(self, _job, _identity):
                return snapshot

            def heartbeat(self, _job_id, _identity):
                return None

            def submit_result(self, _job_id, _identity, payload):
                self.submitted = payload
                return 201, {}, b"{}"

            def report_failure(self, *_args):
                raise AssertionError("Unexpected worker failure")

        api = Api()
        worker_id = "manual-worker"
        job = {
            "id": "manual-test-job",
            "leaseToken": "test-token",
            "datasetChecksum": hashlib.sha256(snapshot).hexdigest(),
            "datasetRowCount": 3,
            "parameters": parameters,
            "timeoutSeconds": 10,
            "attemptCount": 1,
            "leaseDurationSeconds": 60,
        }
        process_job(api, job, worker_id, threading.Event())
        self.assertEqual(api.submitted, {
            "recommendations": [{"userId": 1, "foodId": 102, "rank": 1, "predictedRating": 4.0}],
            "userStatuses": [
                {"userId": 1, "status": "READY"},
                {"userId": 2, "status": "NO_CANDIDATES"},
            ],
        })


if __name__ == "__main__":
    unittest.main()
