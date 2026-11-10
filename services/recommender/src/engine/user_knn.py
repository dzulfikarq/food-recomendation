from schemas import Neighbor, RatingsByUser, SimilarityStrategy, require_positive_int

from .similarity import cosine_similarity


def select_neighbors(
    user_id: int,
    ratings_by_user: RatingsByUser,
    k_neighbors: int,
    *,
    min_common_ratings: int = 1,
    similarity_strategy: SimilarityStrategy | str = SimilarityStrategy.OVERLAP,
) -> tuple[Neighbor, ...]:
    require_positive_int(k_neighbors, "k_neighbors")
    require_positive_int(min_common_ratings, "min_common_ratings")
    target_ratings = ratings_by_user.get(user_id, {})
    if not target_ratings:
        return ()

    neighbors = []
    for other_user_id, other_ratings in ratings_by_user.items():
        if other_user_id == user_id:
            continue
        common_ratings = len(target_ratings.keys() & other_ratings.keys())
        if common_ratings < min_common_ratings:
            continue
        similarity = cosine_similarity(
            target_ratings,
            other_ratings,
            strategy=similarity_strategy,
            min_common_ratings=min_common_ratings,
        )
        if similarity is not None and similarity > 0:
            neighbors.append(Neighbor(other_user_id, similarity, common_ratings))

    neighbors.sort(key=lambda neighbor: (-neighbor.similarity, neighbor.user_id))
    return tuple(neighbors[:k_neighbors])
