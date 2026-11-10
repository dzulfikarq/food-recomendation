from collections.abc import Iterable

from schemas import (
    RatingsByUser,
    Recommendation,
    RecommendationResult,
    RecommendationStatus,
    SimilarityStrategy,
    require_positive_int,
)

from .prediction import predict_rating
from .user_knn import select_neighbors


def recommend_for_user(
    user_id: int,
    ratings_by_user: RatingsByUser,
    active_food_ids: Iterable[int],
    *,
    k_neighbors: int,
    top_n: int,
    min_common_ratings: int = 1,
    similarity_strategy: SimilarityStrategy | str = SimilarityStrategy.OVERLAP,
) -> RecommendationResult:
    require_positive_int(k_neighbors, "k_neighbors")
    require_positive_int(top_n, "top_n")
    require_positive_int(min_common_ratings, "min_common_ratings")

    target_ratings = ratings_by_user.get(user_id, {})
    if not target_ratings:
        return RecommendationResult(user_id, RecommendationStatus.COLD_START)

    candidates = set(active_food_ids).difference(target_ratings)
    if not candidates:
        return RecommendationResult(user_id, RecommendationStatus.NO_CANDIDATES)

    neighbors = select_neighbors(
        user_id,
        ratings_by_user,
        k_neighbors,
        min_common_ratings=min_common_ratings,
        similarity_strategy=similarity_strategy,
    )
    if not neighbors:
        return RecommendationResult(user_id, RecommendationStatus.NO_NEIGHBORS)

    recommendations = []
    for food_id in candidates:
        prediction = predict_rating(food_id, neighbors, ratings_by_user)
        if prediction is not None:
            recommendations.append(Recommendation(food_id, prediction))
    if not recommendations:
        return RecommendationResult(user_id, RecommendationStatus.NO_PREDICTIONS, neighbors)

    recommendations.sort(key=lambda item: (-item.predicted_rating, item.food_id))
    return RecommendationResult(
        user_id,
        RecommendationStatus.READY,
        neighbors,
        tuple(recommendations[:top_n]),
    )
