from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum


RatingsByUser = Mapping[int, Mapping[int, int]]


class SimilarityStrategy(StrEnum):
    OVERLAP = "overlap"
    ZERO_FILLED = "zero_filled"


class RecommendationStatus(StrEnum):
    READY = "READY"
    COLD_START = "COLD_START"
    NO_CANDIDATES = "NO_CANDIDATES"
    NO_NEIGHBORS = "NO_NEIGHBORS"
    NO_PREDICTIONS = "NO_PREDICTIONS"


@dataclass(frozen=True, slots=True)
class Neighbor:
    user_id: int
    similarity: float
    common_ratings: int


@dataclass(frozen=True, slots=True)
class Recommendation:
    food_id: int
    predicted_rating: float


@dataclass(frozen=True, slots=True)
class RecommendationResult:
    user_id: int
    status: RecommendationStatus
    neighbors: tuple[Neighbor, ...] = ()
    recommendations: tuple[Recommendation, ...] = ()


def require_positive_int(value: int, name: str) -> None:
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise ValueError(f"{name} must be a positive integer")
