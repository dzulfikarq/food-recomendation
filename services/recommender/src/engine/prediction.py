from math import fsum

from schemas import Neighbor, RatingsByUser


def predict_rating(
    food_id: int,
    neighbors: tuple[Neighbor, ...],
    ratings_by_user: RatingsByUser,
) -> float | None:
    weighted_ratings = [
        (neighbor.similarity, ratings_by_user.get(neighbor.user_id, {}).get(food_id))
        for neighbor in neighbors
    ]
    usable = [(similarity, rating) for similarity, rating in weighted_ratings if rating is not None and similarity > 0]
    weight_sum = fsum(similarity for similarity, _ in usable)
    if weight_sum == 0:
        return None
    return fsum(similarity * rating for similarity, rating in usable) / weight_sum
