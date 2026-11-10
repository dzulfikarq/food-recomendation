import csv
import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from engine import predict_rating, select_neighbors


FIXTURES = Path(__file__).parent / "fixtures" / "phase_b_altair" / "datasets"


def read_ratings(path):
    with path.open(encoding="utf-8-sig", newline="") as source:
        rows = list(csv.DictReader(source))
    ratings = {}
    for row in rows:
        ratings.setdefault(int(row["user_id"]), {})[int(row["food_id"])] = int(row["rating"])
    return rows, ratings


class PhaseBRatingPredictionHoldoutTests(unittest.TestCase):
    def test_264_66_holdout_is_disjoint_and_evaluated_as_rating_prediction(self):
        train_rows, train = read_ratings(FIXTURES / "foodrec_offline_train_264.csv")
        test_rows, test = read_ratings(FIXTURES / "foodrec_offline_test_66.csv")
        train_pairs = {(int(row["user_id"]), int(row["food_id"])) for row in train_rows}
        test_pairs = {(int(row["user_id"]), int(row["food_id"])) for row in test_rows}
        self.assertEqual(len(train_rows), 264)
        self.assertEqual(len(test_rows), 66)
        self.assertTrue(train_pairs.isdisjoint(test_pairs))

        absolute_errors = []
        squared_errors = []
        missing_predictions = 0
        for user_id, held_out_ratings in test.items():
            neighbors = select_neighbors(user_id, train, k_neighbors=3)
            for food_id, actual_rating in held_out_ratings.items():
                predicted_rating = predict_rating(food_id, neighbors, train)
                if predicted_rating is None:
                    missing_predictions += 1
                    continue
                error = predicted_rating - actual_rating
                absolute_errors.append(abs(error))
                squared_errors.append(error * error)

        self.assertEqual(len(absolute_errors), 42)
        self.assertEqual(missing_predictions, 24)
        self.assertAlmostEqual(sum(absolute_errors) / len(absolute_errors), 0.5716092123274483)
        self.assertAlmostEqual(math.sqrt(sum(squared_errors) / len(squared_errors)), 1.0860034510806849)


if __name__ == "__main__":
    unittest.main()
