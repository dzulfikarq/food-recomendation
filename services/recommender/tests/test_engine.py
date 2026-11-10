import csv
import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from engine import cosine_similarity, predict_rating, recommend_for_user, select_neighbors
from schemas import Neighbor, RecommendationStatus, SimilarityStrategy


def load_fixture():
    fixture = Path(__file__).parent / "fixtures" / "synthetic_ratings.csv"
    ratings = {}
    with fixture.open(encoding="utf-8", newline="") as source:
        for row in csv.DictReader(source):
            ratings.setdefault(int(row["user_id"]), {})[int(row["food_id"])] = int(row["rating"])
    return ratings


class SimilarityTests(unittest.TestCase):
    def test_overlap_cosine_and_minimum_common_ratings(self):
        self.assertEqual(cosine_similarity({1: 5, 2: 1}, {1: 5, 2: 1}), 1.0)
        self.assertAlmostEqual(cosine_similarity({1: 5, 2: 1}, {1: 1, 2: 5}), 10 / 26)
        self.assertIsNone(cosine_similarity({1: 5}, {2: 5}))
        self.assertIsNone(cosine_similarity({1: 5, 2: 1}, {1: 5}, min_common_ratings=2))

    def test_zero_filled_strategy_differs_on_sparse_vectors(self):
        left, right = {1: 5, 2: 1}, {1: 5, 3: 5}
        overlap = cosine_similarity(left, right, strategy=SimilarityStrategy.OVERLAP)
        zero_filled = cosine_similarity(left, right, strategy="zero_filled")
        self.assertEqual(overlap, 1.0)
        self.assertAlmostEqual(zero_filled, 25 / (math.sqrt(26) * math.sqrt(50)))

    def test_invalid_strategy_and_overlap_parameter_are_rejected(self):
        with self.assertRaises(ValueError):
            cosine_similarity({1: 5}, {1: 4}, strategy="unknown")
        with self.assertRaises(ValueError):
            cosine_similarity({1: 5}, {1: 4}, min_common_ratings=0)


class NeighborAndPredictionTests(unittest.TestCase):
    def test_neighbor_selection_excludes_target_and_breaks_ties_by_user_id(self):
        ratings = {1: {10: 5}, 4: {10: 1}, 2: {10: 3}, 3: {11: 5}}
        self.assertEqual([item.user_id for item in select_neighbors(1, ratings, 2)], [2, 4])

    def test_neighbor_selection_enforces_overlap_and_k(self):
        ratings = {1: {10: 5, 11: 1}, 2: {10: 5, 11: 1}, 3: {10: 5}}
        selected = select_neighbors(1, ratings, 5, min_common_ratings=2)
        self.assertEqual([item.user_id for item in selected], [2])
        self.assertEqual(selected[0].common_ratings, 2)

    def test_rating_prediction_uses_positive_similarity_weighted_average(self):
        ratings = {2: {20: 4}, 3: {20: 5}}
        neighbors = (Neighbor(2, 1.0, 2), Neighbor(3, 0.5, 2), Neighbor(4, 0.0, 2))
        self.assertAlmostEqual(predict_rating(20, neighbors, ratings), 13 / 3)
        self.assertIsNone(predict_rating(21, neighbors, ratings))

    def test_weighted_prediction_stays_within_observed_rating_bounds(self):
        neighbors = (Neighbor(2, 1.0, 1), Neighbor(3, 0.982, 1), Neighbor(4, 0.9701, 1))
        ratings = {neighbor.user_id: {20: 5} for neighbor in neighbors}
        self.assertEqual(predict_rating(20, neighbors, ratings), 5.0)


class RecommendationTests(unittest.TestCase):
    def test_fixture_produces_deterministic_top_n_and_hand_calculated_scores(self):
        result = recommend_for_user(
            1,
            load_fixture(),
            [101, 102, 103, 104, 105, 106],
            k_neighbors=2,
            top_n=3,
            min_common_ratings=2,
        )
        self.assertEqual(result.status, RecommendationStatus.READY)
        self.assertEqual([item.user_id for item in result.neighbors], [2, 3])
        self.assertAlmostEqual(result.neighbors[1].similarity, 5 / 13)
        self.assertEqual([item.food_id for item in result.recommendations], [105, 104, 103])
        for actual, expected in zip(
            [item.predicted_rating for item in result.recommendations], [5.0, 77 / 18, 35 / 9]
        ):
            self.assertAlmostEqual(actual, expected)

    def test_candidates_are_active_unrated_and_unique(self):
        result = recommend_for_user(
            1,
            load_fixture(),
            [101, 102, 103, 104, 105, 105, 106],
            k_neighbors=2,
            top_n=10,
            min_common_ratings=2,
        )
        food_ids = [item.food_id for item in result.recommendations]
        self.assertEqual(len(food_ids), len(set(food_ids)))
        self.assertTrue(set(food_ids).isdisjoint({101, 102, 106}))

    def test_top_n_ties_break_by_food_id(self):
        ratings = {1: {1: 5}, 2: {1: 5, 20: 4, 10: 4}, 3: {1: 5, 10: 4, 20: 4}}
        result = recommend_for_user(1, ratings, [1, 20, 10], k_neighbors=2, top_n=2)
        self.assertEqual([item.food_id for item in result.recommendations], [10, 20])

    def test_cold_start_has_no_collaborative_filtering_fallback(self):
        result = recommend_for_user(9, {1: {10: 5}}, [10, 11], k_neighbors=3, top_n=5)
        self.assertEqual(result.status, RecommendationStatus.COLD_START)
        self.assertEqual(result.recommendations, ())

    def test_no_candidates_has_explicit_status(self):
        result = recommend_for_user(1, {1: {10: 5}}, [10], k_neighbors=3, top_n=5)
        self.assertEqual(result.status, RecommendationStatus.NO_CANDIDATES)

    def test_no_neighbors_and_no_neighbor_predictions_are_distinct(self):
        no_neighbors = recommend_for_user(
            1, {1: {10: 5}, 2: {10: 4}}, [10, 11], k_neighbors=3, top_n=5, min_common_ratings=2
        )
        no_predictions = recommend_for_user(
            1, {1: {10: 5}, 2: {10: 4}}, [10, 11], k_neighbors=3, top_n=5
        )
        self.assertEqual(no_neighbors.status, RecommendationStatus.NO_NEIGHBORS)
        self.assertEqual(no_predictions.status, RecommendationStatus.NO_PREDICTIONS)

    def test_dense_dataset_and_top_n_limit(self):
        ratings = {1: {10: 5}, 2: {10: 5, 11: 4, 12: 3}, 3: {10: 5, 11: 5, 12: 2}}
        result = recommend_for_user(1, ratings, [10, 11, 12], k_neighbors=2, top_n=1)
        self.assertEqual(result.status, RecommendationStatus.READY)
        self.assertEqual(len(result.recommendations), 1)
        self.assertEqual(result.recommendations[0].food_id, 11)

    def test_neighbor_and_top_n_parameters_must_be_positive(self):
        with self.assertRaises(ValueError):
            select_neighbors(1, {1: {10: 5}}, 0)
        with self.assertRaises(ValueError):
            recommend_for_user(1, {1: {10: 5}}, [11], k_neighbors=1, top_n=0)


if __name__ == "__main__":
    unittest.main()
