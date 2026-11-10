from collections.abc import Mapping
from math import fsum, sqrt

from schemas import SimilarityStrategy, require_positive_int


def cosine_similarity(
    left: Mapping[int, int],
    right: Mapping[int, int],
    *,
    strategy: SimilarityStrategy | str = SimilarityStrategy.OVERLAP,
    min_common_ratings: int = 1,
) -> float | None:
    """Return cosine similarity, or None when overlap/norm cannot support it."""
    require_positive_int(min_common_ratings, "min_common_ratings")
    try:
        strategy = SimilarityStrategy(strategy)
    except ValueError as error:
        raise ValueError(f"Unsupported similarity strategy: {strategy}") from error

    common_food_ids = left.keys() & right.keys()
    if len(common_food_ids) < min_common_ratings:
        return None

    if strategy is SimilarityStrategy.OVERLAP:
        food_ids = common_food_ids
    else:
        food_ids = left.keys() | right.keys()

    left_vector = [left.get(food_id, 0) for food_id in food_ids]
    right_vector = [right.get(food_id, 0) for food_id in food_ids]
    dot = fsum(a * b for a, b in zip(left_vector, right_vector))
    left_norm = sqrt(fsum(value * value for value in left_vector))
    right_norm = sqrt(fsum(value * value for value in right_vector))
    denominator = left_norm * right_norm
    if denominator == 0:
        return None
    return max(-1.0, min(1.0, dot / denominator))
