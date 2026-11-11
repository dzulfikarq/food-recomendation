"""Compare data against public Recommender-extension binary UserKnn semantics."""

from __future__ import annotations

import argparse
import csv
from dataclasses import dataclass
from math import sqrt
from pathlib import Path
from typing import Iterable, Mapping


Interactions = Mapping[int, set[int]]


@dataclass(frozen=True)
class Neighbor:
    user_id: int
    overlap: int
    similarity: float


def binary_cosine(left: set[int], right: set[int]) -> float:
    """Cosine for positive-only user-item vectors, as in BinaryCosine.java."""
    denominator = sqrt(len(left) * len(right))
    return len(left & right) / denominator if denominator else 0.0


def select_binary_neighbors(
    user_id: int,
    interactions: Interactions,
    user_order: Iterable[int],
    k: int,
) -> tuple[Neighbor, ...]:
    """Rank every other user; stable ties preserve first-seen internal-ID order."""
    if k < 1:
        raise ValueError("k must be positive")
    neighbors = [
        Neighbor(
            other_id,
            len(interactions[user_id] & interactions[other_id]),
            binary_cosine(interactions[user_id], interactions[other_id]),
        )
        for other_id in user_order
        if other_id != user_id
    ]
    neighbors.sort(key=lambda neighbor: -neighbor.similarity)
    return tuple(neighbors[:k])


def interaction_score(
    item_id: int,
    neighbors: Iterable[Neighbor],
    interactions: Interactions,
    k: int,
) -> float:
    """Source score is neighbor interaction count divided by configured k."""
    if k < 1:
        raise ValueError("k must be positive")
    count = sum(item_id in interactions[n.user_id] for n in neighbors)
    return count / k


def read_training(path: Path) -> tuple[dict[int, set[int]], list[int], list[int], int]:
    """Read IDs only; rating values are deliberately ignored by source model."""
    interactions: dict[int, set[int]] = {}
    user_order: list[int] = []
    item_order: list[int] = []
    row_count = 0
    with path.open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if not {"user_id", "food_id", "rating"}.issubset(reader.fieldnames or ()):
            raise ValueError("training CSV needs user_id, food_id, rating headers")
        for row in reader:
            user_id, item_id = int(row["user_id"]), int(row["food_id"])
            if user_id not in interactions:
                interactions[user_id] = set()
                user_order.append(user_id)
            if item_id not in item_order:
                item_order.append(item_id)
            interactions[user_id].add(item_id)
            row_count += 1
    return interactions, user_order, item_order, row_count


def read_reference(path: Path) -> dict[int, list[tuple[int, int]]]:
    references: dict[int, list[tuple[int, int]]] = {}
    with path.open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if not {"user_id", "item_id", "rank"}.issubset(reader.fieldnames or ()):
            raise ValueError("reference CSV needs user_id, item_id, rank headers")
        for row in reader:
            references.setdefault(int(row["user_id"]), []).append(
                (int(row["rank"]), int(row["item_id"]))
            )
    return {
        user_id: [item_id for _, item_id in sorted(rows)]
        for user_id, rows in references.items()
    }


def score_rank_compatible(
    reference_items: list[int],
    candidates: list[int],
    scores: Mapping[int, float],
    top_n: int,
) -> bool:
    """Whether output could be top-N under scores with arbitrary equal-score ties."""
    expected_count = min(top_n, len(candidates))
    if len(reference_items) != expected_count or len(set(reference_items)) != len(reference_items):
        return False
    if any(item_id not in scores for item_id in reference_items):
        return False
    reference_scores = [scores[item_id] for item_id in reference_items]
    if any(left < right for left, right in zip(reference_scores, reference_scores[1:])):
        return False
    if not reference_items:
        return True
    boundary_score = reference_scores[-1]
    return not any(
        item_id not in reference_items and scores[item_id] > boundary_score
        for item_id in candidates
    )


def diagnose(
    interactions: Interactions,
    user_order: list[int],
    item_order: list[int],
    references: Mapping[int, list[int]],
    *,
    k: int,
    top_n: int,
) -> list[dict[str, object]]:
    if top_n < 1:
        raise ValueError("top_n must be positive")
    rows = []
    for user_id in user_order:
        neighbors = select_binary_neighbors(user_id, interactions, user_order, k)
        candidates = [item_id for item_id in item_order if item_id not in interactions[user_id]]
        scores = {
            item_id: interaction_score(item_id, neighbors, interactions, k)
            for item_id in candidates
        }
        deterministic_top_n = sorted(candidates, key=lambda item: (-scores[item], item))[:top_n]
        top_score = max(scores.values(), default=None)
        top_score_items = (
            sorted(item for item, score in scores.items() if score == top_score)
            if top_score is not None
            else []
        )
        reference_items = references.get(user_id, [])
        rows.append(
            {
                "user_id": user_id,
                "candidate_ids": ";".join(map(str, candidates)),
                "neighbors": ";".join(
                    f"{n.user_id}:{n.overlap}:{n.similarity:.12g}" for n in neighbors
                ),
                "candidate_scores": ";".join(
                    f"{item_id}:{scores[item_id]:.12g}" for item_id in candidates
                ),
                "top_score": "" if top_score is None else f"{top_score:.12g}",
                "top_score_items": ";".join(map(str, top_score_items)),
                "reference_items": ";".join(map(str, reference_items)),
                "reference_scores": ";".join(
                    f"{item_id}:{scores[item_id]:.12g}"
                    for item_id in reference_items
                    if item_id in scores
                ),
                "reference_score_compatible": score_rank_compatible(
                    reference_items, candidates, scores, top_n
                ),
                "deterministic_id_ascending_top_n": ";".join(map(str, deterministic_top_n)),
                "deterministic_id_ascending_match": reference_items == deterministic_top_n,
                "matching_reference_rows_id_ascending": sum(
                    expected == actual
                    for expected, actual in zip(reference_items, deterministic_top_n)
                ),
                "reference_top1_is_unique_max": (
                    top_n == 1
                    and len(reference_items) == 1
                    and reference_items[0] in top_score_items
                    and len(top_score_items) == 1
                ),
            }
        )
    return rows


def write_report(path: Path, rows: list[dict[str, object]]) -> None:
    if not rows:
        raise ValueError("no users to report")
    with path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", required=True, type=Path)
    parser.add_argument("--reference", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--k", type=int, default=3)
    parser.add_argument("--top-n", type=int, default=1)
    args = parser.parse_args()

    interactions, users, items, row_count = read_training(args.dataset)
    references = read_reference(args.reference)
    rows = diagnose(interactions, users, items, references, k=args.k, top_n=args.top_n)
    write_report(args.output, rows)

    compared = [row for row in rows if row["reference_items"]]
    compatible = sum(bool(row["reference_score_compatible"]) for row in compared)
    deterministic = sum(bool(row["deterministic_id_ascending_match"]) for row in compared)
    reference_row_count = sum(len(references.get(int(row["user_id"]), [])) for row in compared)
    deterministic_row_matches = sum(
        int(row["matching_reference_rows_id_ascending"]) for row in compared
    )
    strict = sum(bool(row["reference_top1_is_unique_max"]) for row in compared)
    strict_summary = (
        f"unique-score Top-1={strict}/{len(compared)}"
        if args.top_n == 1
        else "unique-score Top-1=n/a for Top-N>1"
    )
    print(
        f"rows={row_count}; users={len(users)}; items={len(items)}; "
        f"reference_users={len(compared)}; score-compatible={compatible}/{len(compared)}; "
        f"ID-ascending diagnostic exact users={deterministic}/{len(compared)}; "
        f"matching reference rows={deterministic_row_matches}/{reference_row_count}; "
        f"{strict_summary}; report={args.output}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
