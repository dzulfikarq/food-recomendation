import csv
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from engine import cosine_similarity, predict_rating, recommend_for_user, select_neighbors  # noqa: E402
from worker import compute_result  # noqa: E402


def load_manual_fixture():
    fixture = Path(__file__).parent / "fixtures" / "synthetic_ratings.csv"
    ratings = {}
    with fixture.open(encoding="utf-8", newline="") as source:
        for row in csv.DictReader(source):
            ratings.setdefault(int(row["user_id"]), {})[int(row["food_id"])] = int(row["rating"])
    return ratings


class ExplicitRatingMethodologyTests(unittest.TestCase):
    def test_manual_explicit_rating_oracle_and_deterministic_rank(self):
        ratings = load_manual_fixture()

        self.assertEqual(cosine_similarity(ratings[1], ratings[2], min_common_ratings=2), 1.0)
        self.assertAlmostEqual(cosine_similarity(ratings[1], ratings[3], min_common_ratings=2), 5 / 13)
        neighbors = select_neighbors(1, ratings, 2, min_common_ratings=2)
        self.assertEqual([neighbor.user_id for neighbor in neighbors], [2, 3])
        self.assertEqual([neighbor.common_ratings for neighbor in neighbors], [2, 2])
        self.assertAlmostEqual(predict_rating(103, neighbors, ratings), 35 / 9)
        self.assertAlmostEqual(predict_rating(104, neighbors, ratings), 77 / 18)
        self.assertEqual(predict_rating(105, neighbors, ratings), 5.0)
        self.assertIsNone(predict_rating(106, neighbors, ratings))

        changed_rating = {user_id: dict(user_ratings) for user_id, user_ratings in ratings.items()}
        changed_rating[3][104] = 1
        self.assertAlmostEqual(predict_rating(104, neighbors, changed_rating), 19 / 6)

        result = recommend_for_user(
            1, ratings, [101, 102, 103, 104, 105, 106], k_neighbors=2, top_n=3, min_common_ratings=2
        )
        self.assertEqual([item.food_id for item in result.recommendations], [105, 104, 103])
        for item, expected in zip(result.recommendations, [5.0, 77 / 18, 35 / 9]):
            self.assertAlmostEqual(item.predicted_rating, expected)

        worker_result = compute_result(ratings, {
            "kNeighbors": 2,
            "topN": 3,
            "minCommonRatings": 2,
            "similarityStrategy": "overlap",
            "activeFoodIds": [101, 102, 103, 104, 105, 106],
            "targetUserIds": [1],
        })
        self.assertEqual(
            [(row["foodId"], row["rank"]) for row in worker_result["recommendations"]],
            [(105, 1), (104, 2), (103, 3)],
        )
        for row, expected in zip(worker_result["recommendations"], [5.0, 77 / 18, 35 / 9]):
            self.assertAlmostEqual(row["predictedRating"], expected)
        self.assertTrue(all(row["foodId"] not in {101, 102} for row in worker_result["recommendations"]))


if __name__ == "__main__":
    unittest.main()
