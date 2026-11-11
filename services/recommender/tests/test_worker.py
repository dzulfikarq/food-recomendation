import hashlib
import sys
import threading
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from worker import WorkerError, _run_in_child, compute_result, parse_snapshot, validate_parameters


class WorkerSnapshotTests(unittest.TestCase):
    def test_snapshot_checksum_and_rating_rows_are_verified(self):
        snapshot = b"user_id,food_id,rating\r\n1,101,5\r\n2,101,4\r\n"
        ratings = parse_snapshot(snapshot, hashlib.sha256(snapshot).hexdigest(), 2)
        self.assertEqual(ratings, {1: {101: 5}, 2: {101: 4}})
        with self.assertRaisesRegex(WorkerError, "SNAPSHOT_CHECKSUM_MISMATCH"):
            parse_snapshot(snapshot, "0" * 64, 2)
        with self.assertRaisesRegex(WorkerError, "SNAPSHOT_INVALID"):
            parse_snapshot(snapshot, hashlib.sha256(snapshot).hexdigest(), 3)

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


if __name__ == "__main__":
    unittest.main()
