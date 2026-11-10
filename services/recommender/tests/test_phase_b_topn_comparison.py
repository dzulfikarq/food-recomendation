import csv
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from engine import recommend_for_user
from schemas import RecommendationStatus


FIXTURES = Path(__file__).parent / "fixtures" / "phase_b_altair"
PYTHON_TOP1_264 = [
    (2, 13, 1), (3, 10, 1), (4, 6, 1), (5, 2, 1), (6, 31, 1), (7, 8, 1),
    (8, 19, 1), (9, 6, 1), (10, 1, 1), (11, 2, 1), (12, 1, 1), (13, 4, 1),
    (14, 10, 1), (15, 11, 1), (16, 2, 1), (17, 1, 1), (18, 39, 1), (19, 6, 1),
    (20, 1, 1), (21, 2, 1), (22, 13, 1), (23, 4, 1),
]


def read_ratings(path):
    with path.open(encoding="utf-8-sig", newline="") as source:
        rows = list(csv.DictReader(source))
    ratings = {}
    for row in rows:
        ratings.setdefault(int(row["user_id"]), {})[int(row["food_id"])] = int(row["rating"])
    return rows, ratings


def read_reference(path):
    with path.open(encoding="utf-8-sig", newline="") as source:
        return [
            (int(row["user_id"]), int(row["item_id"]), int(row["rank"]))
            for row in csv.DictReader(source)
        ]


def run_top_n(ratings_by_user, active_food_ids, top_n):
    output = []
    results = {}
    for user_id in sorted(ratings_by_user):
        result = recommend_for_user(
            user_id,
            ratings_by_user,
            active_food_ids,
            k_neighbors=3,
            top_n=top_n,
        )
        results[user_id] = result
        output.extend(
            (user_id, item.food_id, rank)
            for rank, item in enumerate(result.recommendations, start=1)
        )
    return output, results


class PhaseBTopNComparisonTests(unittest.TestCase):
    def test_43_rating_transcription_matches_order_and_candidate_exclusions(self):
        input_rows, ratings = read_ratings(
            FIXTURES / "datasets" / "ratings_uji_collaborative_filtering_43.csv"
        )
        reference = read_reference(
            FIXTURES / "references" / "altair_reference_top2_43_SCREENSHOT_TRANSCRIPTION.csv"
        )
        actual, results = run_top_n(ratings, range(101, 107), top_n=2)

        self.assertEqual(len(input_rows), 43)
        self.assertEqual(len(reference), 5)
        self.assertEqual(actual, reference)
        self.assertEqual(
            {user_id: len(set(range(101, 107)) - set(user_ratings)) for user_id, user_ratings in ratings.items()},
            {1: 2, 2: 1, 3: 1, 4: 0, 5: 1, 6: 0, 7: 0, 8: 0},
        )
        for user_id, food_id, _ in actual:
            self.assertNotIn(food_id, ratings[user_id])
        for user_id in (4, 6, 7, 8):
            self.assertEqual(results[user_id].status, RecommendationStatus.NO_CANDIDATES)

    def test_train264_top1_records_known_mismatch_without_forcing_parity(self):
        input_rows, ratings = read_ratings(
            FIXTURES / "datasets" / "foodrec_offline_train_264.csv"
        )
        reference = read_reference(
            FIXTURES / "references" / "altair_reference_top1_train264_SCREENSHOT_TRANSCRIPTION.csv"
        )
        actual, _ = run_top_n(ratings, range(1, 41), top_n=1)

        self.assertEqual(len(input_rows), 264)
        self.assertEqual(len(reference), 22)
        self.assertEqual([row[0] for row in actual], [row[0] for row in reference])
        self.assertEqual([row[2] for row in actual], [row[2] for row in reference])
        self.assertEqual(actual, PYTHON_TOP1_264)
        self.assertEqual(len(set(actual) & set(reference)), 0)
        self.assertEqual(len(actual), len(reference))
        for user_id, food_id, _ in actual:
            self.assertNotIn(food_id, ratings[user_id])
        for user_id, food_id, _ in reference:
            self.assertNotIn(food_id, ratings[user_id])

    def test_train264_reference_items_are_candidates_but_not_all_are_predictable(self):
        _, ratings = read_ratings(FIXTURES / "datasets" / "foodrec_offline_train_264.csv")
        reference = read_reference(
            FIXTURES / "references" / "altair_reference_top1_train264_SCREENSHOT_TRANSCRIPTION.csv"
        )
        scored_reference_items = 0
        for user_id, food_id, _ in reference:
            result = recommend_for_user(
                user_id, ratings, range(1, 41), k_neighbors=3, top_n=40
            )
            self.assertEqual(len(set(range(1, 41)) - set(ratings[user_id])), 28)
            if food_id in {item.food_id for item in result.recommendations}:
                scored_reference_items += 1
                rank = next(
                    index
                    for index, item in enumerate(result.recommendations, start=1)
                    if item.food_id == food_id
                )
                self.assertGreater(rank, 1)
        self.assertEqual(scored_reference_items, 19)


if __name__ == "__main__":
    unittest.main()
