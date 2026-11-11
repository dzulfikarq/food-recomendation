import argparse
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from engine import recommend_for_user


def positive_int(value):
    parsed = int(value)
    if parsed < 1:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return parsed


def read_csv(path, required):
    with path.open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if not reader.fieldnames or not set(required).issubset(reader.fieldnames):
            raise ValueError(f"{path} must include columns: {', '.join(required)}")
        return list(reader)


def python_rankings(dataset, *, k, top_n, min_common_ratings, similarity_strategy):
    ratings = {}
    food_ids = set()
    for row in read_csv(dataset, ("user_id", "food_id", "rating")):
        user_id, food_id, rating = (int(row[key]) for key in ("user_id", "food_id", "rating"))
        if food_id in ratings.setdefault(user_id, {}):
            raise ValueError(f"duplicate rating for user_id={user_id}, food_id={food_id}")
        ratings[user_id][food_id] = rating
        food_ids.add(food_id)

    rankings = set()
    for user_id in sorted(ratings):
        result = recommend_for_user(
            user_id,
            ratings,
            food_ids,
            k_neighbors=k,
            top_n=top_n,
            min_common_ratings=min_common_ratings,
            similarity_strategy=similarity_strategy,
        )
        for rank, recommendation in enumerate(result.recommendations, start=1):
            rankings.add((user_id, recommendation.food_id, rank))
    return rankings


def read_altair_rankings(path):
    rankings = set()
    for row in read_csv(path, ("user_id", "item_id", "rank")):
        user_id, item_id, rank = (int(row[key]) for key in ("user_id", "item_id", "rank"))
        entry = (user_id, item_id, rank)
        if rank < 1 or entry in rankings:
            raise ValueError(f"invalid or duplicate Altair row for user_id={user_id}, item_id={item_id}")
        rankings.add(entry)
    return rankings


def write_rankings(path, rankings):
    with path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.writer(output)
        writer.writerow(("user_id", "item_id", "rank"))
        for user_id, item_id, rank in sorted(rankings):
            writer.writerow((user_id, item_id, rank))


def main():
    parser = argparse.ArgumentParser(description="Compare Altair Top-N CSV with current Python engine output.")
    parser.add_argument("--dataset", type=Path, required=True, help="Ratings CSV with user_id,food_id,rating")
    parser.add_argument("--altair", type=Path, required=True, help="Native Altair CSV with user_id,item_id,rank")
    parser.add_argument("--k", type=positive_int, default=3)
    parser.add_argument("--top-n", type=positive_int, required=True)
    parser.add_argument("--min-common-ratings", type=positive_int, default=1)
    parser.add_argument("--similarity-strategy", choices=("overlap", "zero_filled"), default="overlap")
    parser.add_argument("--python-output", type=Path, help="Also write Python rankings CSV")
    args = parser.parse_args()

    try:
        python = python_rankings(
            args.dataset,
            k=args.k,
            top_n=args.top_n,
            min_common_ratings=args.min_common_ratings,
            similarity_strategy=args.similarity_strategy,
        )
        altair = read_altair_rankings(args.altair)
    except (OSError, TypeError, ValueError) as error:
        parser.error(str(error))
    if not python or not altair:
        parser.error("Both inputs must contain at least one ranked recommendation.")
    if args.python_output:
        try:
            write_rankings(args.python_output, python)
        except OSError as error:
            parser.error(str(error))

    python_by_pair = {}
    altair_by_pair = {}
    for user_id, item_id, rank in python:
        python_by_pair.setdefault((user_id, item_id), set()).add(rank)
    for user_id, item_id, rank in altair:
        altair_by_pair.setdefault((user_id, item_id), set()).add(rank)
    report = []
    for pair in sorted(python_by_pair.keys() | altair_by_pair.keys()):
        python_ranks = python_by_pair.get(pair, set())
        altair_ranks = altair_by_pair.get(pair, set())
        for rank in sorted(python_ranks & altair_ranks):
            report.append((*pair, rank, rank, "MATCH"))
        python_only = sorted(python_ranks - altair_ranks)
        altair_only = sorted(altair_ranks - python_ranks)
        while python_only and altair_only:
            report.append((*pair, python_only.pop(0), altair_only.pop(0), "RANK_MISMATCH"))
        report.extend((*pair, rank, "", "PYTHON_ONLY") for rank in python_only)
        report.extend((*pair, "", rank, "ALTAIR_ONLY") for rank in altair_only)
    report.sort(key=lambda row: (row[0], min(row[2] or sys.maxsize, row[3] or sys.maxsize), row[1]))
    writer = csv.writer(sys.stdout, lineterminator="\n")
    writer.writerow(("user_id", "item_id", "python_rank", "altair_rank", "status"))
    writer.writerows(report)

    matches = len(python & altair)
    differing_users = len({row[0] for row in python ^ altair})
    print(
        f"Python rows={len(python)}; Altair rows={len(altair)}; exact rows={matches}; "
        f"differing rows={len(python ^ altair)}; differing users={differing_users}",
        file=sys.stderr,
    )
    print(
        f"Python config: k={args.k}, top_n={args.top_n}, min_common_ratings={args.min_common_ratings}, "
        f"similarity_strategy={args.similarity_strategy}",
        file=sys.stderr,
    )
    return 0 if python == altair else 1


if __name__ == "__main__":
    raise SystemExit(main())
