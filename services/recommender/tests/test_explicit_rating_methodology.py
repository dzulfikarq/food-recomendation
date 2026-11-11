import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from engine import cosine_similarity, predict_rating, recommend_for_user, select_neighbors  # noqa: E402


class ExplicitRatingMethodologyTests(unittest.TestCase):
    def test_manual_explicit_rating_oracle_and_deterministic_rank(self):
        ratings = {
            1: {1: 5, 2: 1},
            2: {1: 5, 2: 1, 10: 4, 20: 4},
            3: {1: 1, 2: 5, 10: 5, 20: 5},
        }

        self.assertEqual(cosine_similarity(ratings[1], ratings[2]), 1.0)
        self.assertAlmostEqual(cosine_similarity(ratings[1], ratings[3]), 5 / 13)
        neighbors = select_neighbors(1, ratings, 2, min_common_ratings=2)
        self.assertEqual([neighbor.user_id for neighbor in neighbors], [2, 3])
        self.assertAlmostEqual(predict_rating(10, neighbors, ratings), 77 / 18)

        changed_rating = {user_id: dict(user_ratings) for user_id, user_ratings in ratings.items()}
        changed_rating[3][10] = 1
        self.assertAlmostEqual(predict_rating(10, neighbors, changed_rating), 19 / 6)

        result = recommend_for_user(
            1, ratings, [20, 10], k_neighbors=2, top_n=2, min_common_ratings=2
        )
        self.assertEqual([item.food_id for item in result.recommendations], [10, 20])
        self.assertTrue(all(1 <= item.predicted_rating <= 5 for item in result.recommendations))


if __name__ == "__main__":
    unittest.main()
