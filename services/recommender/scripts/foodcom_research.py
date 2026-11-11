"""Reproducible, local-only Food.com research data pipeline."""

from __future__ import annotations

import argparse
from array import array
import csv
import hashlib
import json
import math
import platform
import sqlite3
import statistics
import sys
import tempfile
from collections import Counter, defaultdict
from contextlib import ExitStack
from datetime import date
from pathlib import Path
from typing import Iterable

RECOMMENDER_SRC = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(RECOMMENDER_SRC))
from engine import predict_rating, select_neighbors  # noqa: E402
from schemas import SimilarityStrategy  # noqa: E402

SOURCE_URL = "https://www.kaggle.com/datasets/shuyangli94/food-com-recipes-and-user-interactions"
PAPER_URL = "https://aclanthology.org/D19-1613/"
CANONICAL_HEADER = ("user_id", "item_id", "rating")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _rank(seed: int, scope: str, *values: str) -> bytes:
    text = "\0".join((str(seed), scope, *values))
    return hashlib.sha256(text.encode("utf-8")).digest()


def _source_key(value: str) -> tuple[int, str]:
    return int(value), value


def _split_items(seed: int, source_user: str, source_items: list[str]) -> dict[str, str]:
    count = len(source_items)
    if count < 3:
        return dict.fromkeys(source_items, "train")
    train_count = max(1, count * 8 // 10)
    validation_count = max(1, count // 10)
    if count - train_count - validation_count < 1:
        train_count -= 1
    ranked = sorted(source_items, key=lambda item: (_rank(seed, "split", source_user, item), _source_key(item)))
    return {
        item: "train" if index < train_count else "validation" if index < train_count + validation_count else "test"
        for index, item in enumerate(ranked)
    }


def _read_csv(path: Path, required: Iterable[str]):
    source = path.open("r", encoding="utf-8-sig", newline="")
    reader = csv.DictReader(source)
    if reader.fieldnames and len(reader.fieldnames) != len(set(reader.fieldnames)):
        source.close()
        raise ValueError(f"{path.name}: duplicate column names")
    fields = set(reader.fieldnames or ())
    missing = set(required) - fields
    if missing:
        source.close()
        raise ValueError(f"{path.name}: missing columns {', '.join(sorted(missing))}")
    return source, reader


def _record_missing(row: dict, cell_counts: Counter, row_counts: Counter) -> None:
    for field, value in row.items():
        if field is not None and (value is None or not value.strip()):
            cell_counts[field] += 1
            row_counts[field] += 1


def _source_id(value: str | None, field: str, row_number: int, row_type: str) -> str:
    raw = (value or "").strip()
    if not raw.isascii() or not raw.isdigit() or int(raw) < 1 or str(int(raw)) != raw:
        raise ValueError(f"{row_type} row {row_number}: invalid {field} {value!r}")
    return raw


def _rating(value: str | None, row_number: int) -> int:
    raw = (value or "").strip()
    if raw not in {"0", "1", "2", "3", "4", "5"}:
        raise ValueError(f"interaction row {row_number}: rating must be an integer from 0 to 5, got {value!r}")
    return int(raw)


def _date(value: str | None, row_number: int) -> str:
    raw = (value or "").strip()
    try:
        parsed = date.fromisoformat(raw)
    except ValueError as error:
        raise ValueError(f"interaction row {row_number}: invalid ISO date {value!r}") from error
    if parsed.isoformat() != raw:
        raise ValueError(f"interaction row {row_number}: date must use YYYY-MM-DD, got {value!r}")
    return raw


def _density_stats(users: int, items: int, pairs: int, ratings: Counter) -> dict:
    possible = users * items
    return {
        "users": users,
        "items": items,
        "explicit_rating_pairs": pairs,
        "rating_distribution": {str(rating): ratings[rating] for rating in range(1, 6)},
        "density": pairs / possible if possible else 0.0,
        "sparsity": 1 - pairs / possible if possible else 0.0,
    }


def prepare_dataset(
    interactions_path: Path,
    recipes_path: Path,
    output_dir: Path,
    *,
    source_version: str,
    seed: int,
    user_limit: int,
    rights_review: str,
    sampling_strategy: str = "hash_id",
    min_user_train: int = 5,
    min_popular_user_train: int = 3,
    min_item_train: int = 25,
    core_k: int = 3,
) -> Path:
    if output_dir.exists():
        raise ValueError(f"output path already exists: {output_dir}")
    if not interactions_path.is_file() or not recipes_path.is_file():
        raise ValueError("both RAW source files must exist")
    if not source_version.strip() or not rights_review.strip():
        raise ValueError("source version and rights review reference are required")
    if user_limit < 1:
        raise ValueError("user limit must be positive")
    if sampling_strategy not in {"hash_id", "user_history", "popular_recipes", "k_core", "largest_component"}:
        raise ValueError("unknown sampling strategy")
    if min_user_train < 1 or min_popular_user_train < 1 or min_item_train < 1 or core_k < 2:
        raise ValueError("sampling thresholds must be positive; core k must be at least 2")

    interaction_hash = _sha256(interactions_path)
    recipe_hash = _sha256(recipes_path)
    recipe_ids: set[str] = set()
    recipe_count = 0
    source, reader = _read_csv(recipes_path, ("id",))
    recipe_headers = tuple(reader.fieldnames or ())
    recipe_missing_cells = Counter(dict.fromkeys(recipe_headers, 0))
    recipe_missing_rows = Counter(dict.fromkeys(recipe_headers, 0))
    with source:
        for row_number, row in enumerate(reader, start=2):
            if None in row:
                raise ValueError(f"recipe row {row_number}: malformed CSV row")
            _record_missing(row, recipe_missing_cells, recipe_missing_rows)
            recipe_id = _source_id(row.get("id"), "recipe id", row_number, "recipe")
            if recipe_id in recipe_ids:
                raise ValueError(f"recipe row {row_number}: duplicate recipe id {recipe_id}")
            recipe_ids.add(recipe_id)
            recipe_count += 1

    output_dir.parent.mkdir(parents=True, exist_ok=True)
    raw_rows = zero_ratings = 0
    with tempfile.TemporaryDirectory(prefix=f"{output_dir.name}-", dir=output_dir.parent) as temp_dir:
        connection = sqlite3.connect(Path(temp_dir) / "interactions.sqlite")
        try:
            connection.execute("PRAGMA journal_mode = OFF")
            connection.execute("PRAGMA synchronous = OFF")
            connection.execute(
                """CREATE TABLE interactions (
                    user_id TEXT NOT NULL,
                    item_id TEXT NOT NULL,
                    rating INTEGER NOT NULL,
                    rated_on TEXT NOT NULL,
                    source_row INTEGER NOT NULL,
                    seen_count INTEGER NOT NULL DEFAULT 1,
                    PRIMARY KEY (user_id, item_id)
                )"""
            )
            source, reader = _read_csv(interactions_path, ("user_id", "recipe_id", "date", "rating"))
            interaction_headers = tuple(reader.fieldnames or ())
            interaction_missing_cells = Counter(dict.fromkeys(interaction_headers, 0))
            interaction_missing_rows = Counter(dict.fromkeys(interaction_headers, 0))
            with source:
                for raw_rows, row in enumerate(reader, start=1):
                    row_number = raw_rows + 1
                    if None in row:
                        raise ValueError(f"interaction row {row_number}: malformed CSV row")
                    _record_missing(row, interaction_missing_cells, interaction_missing_rows)
                    user_id = _source_id(row.get("user_id"), "user id", row_number, "interaction")
                    item_id = _source_id(row.get("recipe_id"), "recipe id", row_number, "interaction")
                    if item_id not in recipe_ids:
                        raise ValueError(f"interaction row {row_number}: recipe id {item_id} missing from RAW_recipes.csv")
                    rated_on = _date(row.get("date"), row_number)
                    rating = _rating(row.get("rating"), row_number)
                    if rating == 0:
                        zero_ratings += 1
                        continue
                    connection.execute(
                        """INSERT INTO interactions(user_id,item_id,rating,rated_on,source_row)
                           VALUES(?,?,?,?,?)
                           ON CONFLICT(user_id,item_id) DO UPDATE SET
                             seen_count=interactions.seen_count+1,
                             rating=CASE WHEN excluded.rated_on > interactions.rated_on
                               OR (excluded.rated_on = interactions.rated_on AND excluded.source_row > interactions.source_row)
                               THEN excluded.rating ELSE interactions.rating END,
                             rated_on=CASE WHEN excluded.rated_on > interactions.rated_on
                               OR (excluded.rated_on = interactions.rated_on AND excluded.source_row > interactions.source_row)
                               THEN excluded.rated_on ELSE interactions.rated_on END,
                             source_row=CASE WHEN excluded.rated_on > interactions.rated_on
                               OR (excluded.rated_on = interactions.rated_on AND excluded.source_row > interactions.source_row)
                               THEN excluded.source_row ELSE interactions.source_row END""",
                        (user_id, item_id, rating, rated_on, raw_rows),
                    )
            connection.commit()

            full_pairs, duplicate_rows = connection.execute(
                "SELECT COUNT(*), COALESCE(SUM(seen_count-1),0) FROM interactions"
            ).fetchone()
            full_users, full_items = connection.execute(
                "SELECT COUNT(DISTINCT user_id), COUNT(DISTINCT item_id) FROM interactions"
            ).fetchone()
            full_rating_counts = Counter(dict(connection.execute(
                "SELECT rating, COUNT(*) FROM interactions GROUP BY rating"
            ).fetchall()))

            connection.execute("""CREATE TEMP TABLE pair_splits (
                user_id TEXT NOT NULL, item_id TEXT NOT NULL, split TEXT NOT NULL,
                PRIMARY KEY(user_id,item_id))""")

            def all_split_assignments():
                current_user = None
                source_items = []
                for source_user, source_item in connection.execute(
                    "SELECT user_id,item_id FROM interactions ORDER BY user_id,item_id"
                ):
                    if current_user is not None and source_user != current_user:
                        assignments = _split_items(seed, current_user, source_items)
                        yield from ((current_user, item, split) for item, split in assignments.items())
                        source_items = []
                    current_user = source_user
                    source_items.append(source_item)
                if current_user is not None:
                    assignments = _split_items(seed, current_user, source_items)
                    yield from ((current_user, item, split) for item, split in assignments.items())

            connection.executemany("INSERT INTO pair_splits VALUES(?,?,?)", all_split_assignments())
            connection.execute("CREATE INDEX pair_splits_split_user ON pair_splits(split,user_id)")
            connection.execute("CREATE INDEX pair_splits_split_item ON pair_splits(split,item_id)")
            connection.execute("""CREATE TEMP TABLE user_nodes AS
                SELECT user_id,ROW_NUMBER() OVER (ORDER BY CAST(user_id AS INTEGER)) AS node_id
                FROM (SELECT DISTINCT user_id FROM interactions)""")
            connection.execute("""CREATE TEMP TABLE item_nodes AS
                SELECT item_id,ROW_NUMBER() OVER (ORDER BY CAST(item_id AS INTEGER)) AS node_id
                FROM (SELECT DISTINCT item_id FROM interactions)""")
            population_graph = _graph_stats(
                (tuple(row) for row in connection.execute(
                    """SELECT u.node_id,i.node_id,x.rating FROM interactions x
                       JOIN user_nodes u ON u.user_id=x.user_id JOIN item_nodes i ON i.item_id=x.item_id"""
                )), full_users, full_items,
            )
            training_graph, largest_user_nodes, largest_item_nodes = _graph_stats(
                (tuple(row) for row in connection.execute(
                    """SELECT u.node_id,i.node_id,x.rating FROM pair_splits s
                       JOIN interactions x ON x.user_id=s.user_id AND x.item_id=s.item_id
                       JOIN user_nodes u ON u.user_id=x.user_id JOIN item_nodes i ON i.item_id=x.item_id
                       WHERE s.split='train'"""
                )), full_users, full_items, include_largest_members=True,
            )

            if sampling_strategy in {"k_core", "largest_component"}:
                connection.execute("CREATE TEMP TABLE eligible_items(source_id TEXT PRIMARY KEY)")
                connection.execute("CREATE TEMP TABLE eligible_users(source_id TEXT PRIMARY KEY)")
            if sampling_strategy == "popular_recipes":
                connection.execute("""CREATE TEMP TABLE eligible_items AS
                    SELECT item_id AS source_id FROM pair_splits WHERE split='train'
                    GROUP BY item_id HAVING COUNT(*)>=?""", (min_item_train,))
                connection.execute("CREATE UNIQUE INDEX eligible_items_id ON eligible_items(source_id)")
                connection.execute("""CREATE TEMP TABLE eligible_users AS
                    SELECT s.user_id AS source_id FROM pair_splits s JOIN eligible_items i ON i.source_id=s.item_id
                    WHERE s.split='train' GROUP BY s.user_id HAVING COUNT(*)>=?""", (min_popular_user_train,))
                connection.execute("CREATE UNIQUE INDEX eligible_users_id ON eligible_users(source_id)")
            elif sampling_strategy == "user_history":
                connection.execute("CREATE TEMP TABLE eligible_users AS SELECT user_id AS source_id FROM pair_splits WHERE split='train' GROUP BY user_id HAVING COUNT(*)>=?", (min_user_train,))
                connection.execute("CREATE UNIQUE INDEX eligible_users_id ON eligible_users(source_id)")
            elif sampling_strategy == "k_core":
                connection.execute("CREATE TEMP TABLE core_users AS SELECT user_id FROM pair_splits WHERE split='train' GROUP BY user_id")
                connection.execute("CREATE TEMP TABLE core_items AS SELECT item_id FROM pair_splits WHERE split='train' GROUP BY item_id")
                while True:
                    before = connection.execute("SELECT (SELECT COUNT(*) FROM core_users)+(SELECT COUNT(*) FROM core_items)").fetchone()[0]
                    connection.execute("""DELETE FROM core_users WHERE user_id IN (
                        SELECT u.user_id FROM core_users u LEFT JOIN
                          (pair_splits s JOIN core_items i ON i.item_id=s.item_id AND s.split='train')
                          ON s.user_id=u.user_id GROUP BY u.user_id HAVING COUNT(s.item_id)<?)""", (core_k,))
                    connection.execute("""DELETE FROM core_items WHERE item_id IN (
                        SELECT i.item_id FROM core_items i LEFT JOIN
                          (pair_splits s JOIN core_users u ON u.user_id=s.user_id AND s.split='train')
                          ON s.item_id=i.item_id GROUP BY i.item_id HAVING COUNT(s.user_id)<?)""", (core_k,))
                    after = connection.execute("SELECT (SELECT COUNT(*) FROM core_users)+(SELECT COUNT(*) FROM core_items)").fetchone()[0]
                    if after == before:
                        break
                connection.execute("INSERT INTO eligible_users SELECT user_id FROM core_users")
                connection.execute("INSERT INTO eligible_items SELECT item_id FROM core_items")
                connection.execute("CREATE UNIQUE INDEX eligible_users_id ON eligible_users(source_id)")
            elif sampling_strategy == "largest_component":
                connection.execute("CREATE TEMP TABLE largest_user_nodes(node_id INTEGER PRIMARY KEY)")
                connection.execute("CREATE TEMP TABLE largest_item_nodes(node_id INTEGER PRIMARY KEY)")
                connection.executemany("INSERT INTO largest_user_nodes VALUES(?)", ((node,) for node in largest_user_nodes))
                connection.executemany("INSERT INTO largest_item_nodes VALUES(?)", ((node,) for node in largest_item_nodes))
                connection.execute("INSERT INTO eligible_users SELECT u.user_id FROM user_nodes u JOIN largest_user_nodes n ON n.node_id=u.node_id")
                connection.execute("INSERT INTO eligible_items SELECT i.item_id FROM item_nodes i JOIN largest_item_nodes n ON n.node_id=i.node_id")
                connection.execute("CREATE UNIQUE INDEX eligible_users_id ON eligible_users(source_id)")

            eligible_query = (
                "SELECT source_id FROM eligible_users" if sampling_strategy != "hash_id"
                else "SELECT DISTINCT user_id FROM interactions"
            )
            eligible_sources = [row[0] for row in connection.execute(eligible_query)]
            selected_sources = sorted(
                eligible_sources,
                key=lambda source_user: (_rank(seed, "user-sample", source_user), _source_key(source_user)),
            )[:user_limit]
            if not selected_sources:
                raise ValueError(f"sampling strategy {sampling_strategy!r} selected no users")

            if sampling_strategy not in {"popular_recipes", "k_core", "largest_component"}:
                connection.execute("CREATE TEMP TABLE eligible_items AS SELECT DISTINCT item_id AS source_id FROM interactions")
                connection.execute("CREATE UNIQUE INDEX eligible_items_id ON eligible_items(source_id)")

            connection.execute("CREATE TEMP TABLE selected_users(source_id TEXT PRIMARY KEY, user_id INTEGER NOT NULL)")
            connection.executemany(
                "INSERT INTO selected_users VALUES(?,?)",
                [(source_id, index) for index, source_id in enumerate(sorted(selected_sources, key=_source_key), 1)],
            )
            selected_items = [row[0] for row in connection.execute(
                "SELECT DISTINCT i.item_id FROM interactions i JOIN selected_users u ON u.source_id=i.user_id JOIN eligible_items e ON e.source_id=i.item_id"
            )]
            selected_items.sort(key=_source_key)
            connection.execute("CREATE TEMP TABLE selected_items(source_id TEXT PRIMARY KEY, item_id INTEGER NOT NULL)")
            connection.executemany(
                "INSERT INTO selected_items VALUES(?,?)",
                [(source_id, index) for index, source_id in enumerate(selected_items, 1)],
            )

            staged = Path(temp_dir) / "dataset"
            staged.mkdir()
            with (staged / "user_id_map.csv").open("w", encoding="utf-8", newline="") as file:
                writer = csv.writer(file)
                writer.writerow(("user_id", "foodcom_user_id"))
                writer.writerows(connection.execute(
                    "SELECT user_id,source_id FROM selected_users ORDER BY user_id"
                ))
            with (staged / "item_id_map.csv").open("w", encoding="utf-8", newline="") as file:
                writer = csv.writer(file)
                writer.writerow(("item_id", "foodcom_recipe_id"))
                writer.writerows(connection.execute(
                    "SELECT item_id,source_id FROM selected_items ORDER BY item_id"
                ))

            rating_counts: Counter = Counter()
            split_counts: Counter = Counter()
            split_users: dict[str, set[int]] = {name: set() for name in ("train", "validation", "test")}
            split_rows = 0
            with ExitStack() as stack:
                canonical_writer = csv.writer(stack.enter_context(
                    (staged / "canonical.csv").open("w", encoding="utf-8", newline="")
                ))
                canonical_writer.writerow(CANONICAL_HEADER)
                split_writers = {}
                for split in ("train", "validation", "test"):
                    writer = csv.writer(stack.enter_context(
                        (staged / f"{split}.csv").open("w", encoding="utf-8", newline="")
                    ))
                    writer.writerow(CANONICAL_HEADER)
                    split_writers[split] = writer

                query = connection.execute(
                    """SELECT u.user_id,p.item_id,i.rating,s.split
                       FROM interactions i
                       JOIN selected_users u ON u.source_id=i.user_id
                       JOIN selected_items p ON p.source_id=i.item_id
                       JOIN pair_splits s ON s.user_id=i.user_id AND s.item_id=i.item_id
                       ORDER BY u.user_id,p.item_id"""
                )
                for canonical_user, canonical_item, rating, split in query:
                    record = (canonical_user, canonical_item, rating)
                    canonical_writer.writerow(record)
                    split_writers[split].writerow(record)
                    split_counts[split] += 1
                    split_users[split].add(canonical_user)
                    rating_counts[rating] += 1
                    split_rows += 1

            subset_users = len(selected_sources)
            subset_items = len(selected_items)
            artifact_names = (
                "canonical.csv", "user_id_map.csv", "item_id_map.csv",
                "train.csv", "validation.csv", "test.csv",
            )
            artifacts = {
                name: {"sha256": _sha256(staged / name), "rows": (
                    split_rows if name == "canonical.csv" else
                    subset_users if name == "user_id_map.csv" else
                    subset_items if name == "item_id_map.csv" else split_counts[name[:-4]]
                )}
                for name in artifact_names
            }
            canonical_rows, _ = _load_ratings(staged / "canonical.csv")
            subset_graph = _graph_stats(canonical_rows, subset_users, subset_items)
            source_training_rows, _ = _load_ratings(staged / "train.csv")
            subset_training_graph = _graph_stats(source_training_rows, subset_users, subset_items)
            strategy_parameters = {
                "strategy": sampling_strategy,
                "user_limit": user_limit,
                "min_user_train": min_user_train if sampling_strategy == "user_history" else None,
                "min_popular_user_train": min_popular_user_train if sampling_strategy == "popular_recipes" else None,
                "min_item_train": min_item_train if sampling_strategy == "popular_recipes" else None,
                "core_k": core_k if sampling_strategy == "k_core" else None,
                "eligible_users_before_cap": len(eligible_sources),
                "selection_rank": "SHA-256(seed, user-sample, source_user_id), shared across strategies",
            }
            manifest = {
                "schema_version": 2,
                "source": {
                    "dataset": "Food.com Recipes and Interactions",
                    "url": SOURCE_URL,
                    "paper_url": PAPER_URL,
                    "release_label": source_version,
                    "rights_review_reference": rights_review,
                    "files": {
                        "RAW_interactions.csv": {"name": interactions_path.name, "sha256": interaction_hash, "source_rows": raw_rows},
                        "RAW_recipes.csv": {"name": recipes_path.name, "sha256": recipe_hash, "source_rows": recipe_count},
                    },
                    "columns": {
                        "RAW_interactions.csv": interaction_headers,
                        "RAW_recipes.csv": recipe_headers,
                    },
                },
                "runtime": {
                    "python_version": platform.python_version(),
                    "sqlite_version": sqlite3.sqlite_version,
                    "pipeline_sha256": _sha256(Path(__file__)),
                },
                "preprocessing": {
                    "rating_policy": "Retain explicit integer ratings 1-5. Exclude rating 0 as non-rating interaction per source sample review text.",
                    "invalid_policy": "Reject missing/malformed IDs, dates, ratings, duplicate recipe IDs, and interaction recipe IDs absent from RAW_recipes.csv.",
                    "duplicate_policy": "Ignore rating-0 rows; for duplicate explicit user-recipe pairs retain latest date, then last source row on date ties.",
                    "subset_policy": {
                        "seed": seed,
                        **strategy_parameters,
                        "selection": "Cohort eligibility is computed only from deterministic training edges before sample cap; subset items follow strategy-defined eligibility. Test ratings and validation/model outcomes never select users or items.",
                        "component_tie_break": "Largest-component ties choose component with smallest dense user/item node ID.",
                        "bias": "Activity thresholds, popular-item filters, k-core, and largest-component selection condition on the training graph and favor active users/items. Hash-ID baseline avoids count-based selection but validation/test cover only users with enough pairs to split.",
                    },
                    "split_policy": {
                        "algorithm": "Split each full-source user history by SHA-256 rank before cohort selection; users with fewer than three pairs are train-only; others have at least one row in each split.",
                        "target_fractions": {"train": 0.8, "validation": 0.1, "test": 0.1},
                        "seed": seed,
                    },
                },
                "audit": {
                    "raw_interaction_rows": raw_rows,
                    "missing_values": {
                        "RAW_interactions.csv": {
                            "cells_by_column": dict(sorted(interaction_missing_cells.items())),
                            "rows_by_column": dict(sorted(interaction_missing_rows.items())),
                        },
                        "RAW_recipes.csv": {
                            "cells_by_column": dict(sorted(recipe_missing_cells.items())),
                            "rows_by_column": dict(sorted(recipe_missing_rows.items())),
                        },
                    },
                    "rating_zero_rows_excluded": zero_ratings,
                    "duplicate_explicit_rows_removed": duplicate_rows,
                    "full_explicit_data": _density_stats(full_users, full_items, full_pairs, full_rating_counts),
                    "subset": _density_stats(subset_users, subset_items, split_rows, rating_counts),
                    "connectivity": {
                        "population_full": population_graph,
                        "population_training": training_graph,
                        "subset_full": subset_graph,
                        "subset_training": subset_training_graph,
                    },
                    "split_rows": dict(split_counts),
                    "split_users": {split: len(users) for split, users in split_users.items()},
                },
                "artifacts": artifacts,
            }
            (staged / "manifest.json").write_text(
                json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
            )
            output_dir.parent.mkdir(parents=True, exist_ok=True)
            staged.replace(output_dir)
        finally:
            connection.close()
    return output_dir


def _load_ratings(path: Path) -> tuple[list[tuple[int, int, int]], dict[int, dict[int, int]]]:
    source, reader = _read_csv(path, CANONICAL_HEADER)
    rows = []
    by_user: dict[int, dict[int, int]] = defaultdict(dict)
    with source:
        for row_number, row in enumerate(reader, start=2):
            try:
                user_id, item_id, rating = (int(row[key]) for key in CANONICAL_HEADER)
            except (TypeError, ValueError) as error:
                raise ValueError(f"{path.name} row {row_number}: malformed canonical record") from error
            if user_id < 1 or item_id < 1 or rating not in range(1, 6):
                raise ValueError(f"{path.name} row {row_number}: invalid canonical record")
            if item_id in by_user[user_id]:
                raise ValueError(f"{path.name} row {row_number}: duplicate user-item pair")
            by_user[user_id][item_id] = rating
            rows.append((user_id, item_id, rating))
    return rows, by_user


def _metric(actuals: list[int], predictions: list[float | None], reasons: list[str | None]) -> dict:
    available = [(actual, prediction) for actual, prediction in zip(actuals, predictions) if prediction is not None]
    count = len(actuals)
    errors = [prediction - actual for actual, prediction in available]
    missing = Counter(reason or "unavailable" for prediction, reason in zip(predictions, reasons) if prediction is None)
    return {
        "n_total": count,
        "n_predicted": len(available),
        "n_missing": count - len(available),
        "coverage": len(available) / count if count else 0.0,
        "mae": statistics.fmean(abs(error) for error in errors) if errors else None,
        "rmse": math.sqrt(statistics.fmean(error * error for error in errors)) if errors else None,
        "missing_reasons": dict(sorted(missing.items())),
    }


def _distribution(values: list[int], *, zero_count: int = 0) -> dict:
    if not values and not zero_count:
        return {"count": 0, "min": None, "median": None, "p90": None, "p95": None, "max": None, "histogram": {}}
    ordered = sorted(values)
    def quantile(fraction: float) -> int:
        rank = math.ceil(fraction * (len(ordered) + zero_count))
        return 0 if rank <= zero_count else ordered[min(len(ordered) - 1, rank - zero_count - 1)]
    buckets = Counter(
        "0" if value == 0 else
        "1" if value == 1 else
        "2-4" if value <= 4 else
        "5-9" if value <= 9 else
        "10-19" if value <= 19 else
        "20-49" if value <= 49 else "50+"
        for value in values
    )
    if zero_count:
        buckets["0"] += zero_count
    return {
        "count": len(ordered) + zero_count, "min": 0 if zero_count else ordered[0], "median": quantile(0.5),
        "p90": quantile(0.9), "p95": quantile(0.95), "max": ordered[-1] if ordered else 0,
        "histogram": dict(sorted(buckets.items())),
    }


def _graph_stats(
    rows: Iterable[tuple[int, int, int]], user_bound: int, item_bound: int, *, include_largest_members: bool = False
) -> dict | tuple[dict, list[int], list[int]]:
    parent = array("I", range(user_bound + item_bound))
    size = array("I", [1]) * (user_bound + item_bound)
    minimum = array("I", range(user_bound + item_bound))
    user_degrees: Counter = Counter()
    item_degrees: Counter = Counter()

    def find(node: int) -> int:
        while parent[node] != node:
            parent[node] = parent[parent[node]]
            node = parent[node]
        return node

    def union(left: int, right: int) -> None:
        root_left, root_right = find(left), find(right)
        if root_left == root_right:
            return
        if size[root_left] < size[root_right]:
            root_left, root_right = root_right, root_left
        parent[root_right] = root_left
        size[root_left] += size[root_right]
        minimum[root_left] = min(minimum[root_left], minimum[root_right])

    for user_id, item_id, _ in rows:
        user_degrees[user_id] += 1
        item_degrees[item_id] += 1
        union(user_id - 1, user_bound + item_id - 1)

    component_sizes: Counter = Counter()
    component_users: Counter = Counter()
    component_items: Counter = Counter()
    users_by_component: dict[int, list[int]] = defaultdict(list)
    items_by_component: dict[int, list[int]] = defaultdict(list)
    for user_id in user_degrees:
        root = find(user_id - 1)
        component_sizes[root] += 1
        component_users[root] += 1
        users_by_component[root].append(user_id)
    for item_id in item_degrees:
        root = find(user_bound + item_id - 1)
        component_sizes[root] += 1
        component_items[root] += 1
        items_by_component[root].append(item_id)
    largest = min(component_sizes, key=lambda root: (-component_sizes[root], minimum[root])) if component_sizes else None
    stats = {
        "users": len(user_degrees),
        "items": len(item_degrees),
        "edges": sum(user_degrees.values()),
        "user_degree": _distribution(list(user_degrees.values())),
        "item_degree": _distribution(list(item_degrees.values())),
        "components": len(component_sizes),
        "largest_component": {
            "nodes": component_sizes[largest],
            "users": component_users[largest],
            "items": component_items[largest],
        } if largest is not None else {"nodes": 0, "users": 0, "items": 0},
    }
    if include_largest_members:
        return stats, users_by_component[largest] if largest is not None else [], items_by_component[largest] if largest is not None else []
    return stats


def _neighbor_support(
    training: dict[int, dict[int, int]], evaluation: list[tuple[int, int, int]], min_common: int
) -> tuple[dict[int, tuple], dict]:
    neighbor_cache = {}
    neighbor_counts = []
    common_counts = []
    for user_id in sorted({user_id for user_id, _, _ in evaluation}):
        neighbors = select_neighbors(
            user_id, training, len(training),
            min_common_ratings=min_common,
            similarity_strategy=SimilarityStrategy.OVERLAP,
        )
        neighbor_counts.append(len(neighbors))
        common_counts.extend(neighbor.common_ratings for neighbor in neighbors)
        neighbor_cache[user_id] = neighbors
    possible_pairs = len(neighbor_counts) * max(0, len(training) - 1)
    pairs_below_min_common = possible_pairs - len(common_counts)
    return neighbor_cache, {
        "target_users": len(neighbor_counts),
        "training_user_pairs_compared": possible_pairs,
        "pairs_below_min_common": pairs_below_min_common,
        "zero_overlap_pairs": pairs_below_min_common if min_common == 1 else None,
        "users_with_no_valid_neighbors": sum(count == 0 for count in neighbor_counts),
        "valid_neighbors_per_user": _distribution(neighbor_counts),
        "common_ratings_per_valid_user_pair": _distribution(common_counts),
        "common_ratings_per_candidate_user_pair": _distribution(
            common_counts, zero_count=pairs_below_min_common,
        ) if min_common == 1 else None,
    }


def _model_predictions(
    training: dict[int, dict[int, int]],
    evaluation: list[tuple[int, int, int]],
    k: int,
    min_common: int,
    neighbor_cache: dict[int, tuple] | None = None,
) -> tuple[list[float | None], list[str | None]]:
    if neighbor_cache is None:
        neighbor_cache, _ = _neighbor_support(training, evaluation, min_common)
    predictions = []
    reasons = []
    for user_id, item_id, _ in evaluation:
        neighbors = neighbor_cache[user_id][:k]
        prediction = predict_rating(item_id, neighbors, training)
        predictions.append(prediction)
        reasons.append(None if prediction is not None else (
            "no_eligible_neighbors" if not neighbors else "neighbors_not_rated_item"
        ))
    return predictions, reasons


def _baseline_predictions(
    training: dict[int, dict[int, int]], evaluation: list[tuple[int, int, int]]
) -> dict[str, tuple[list[float | None], list[str | None]]]:
    values = [rating for user_ratings in training.values() for rating in user_ratings.values()]
    global_mean = statistics.fmean(values) if values else None
    user_means = {user: statistics.fmean(ratings.values()) for user, ratings in training.items() if ratings}
    item_values: dict[int, list[int]] = defaultdict(list)
    for ratings in training.values():
        for item, rating in ratings.items():
            item_values[item].append(rating)
    item_means = {item: statistics.fmean(ratings) for item, ratings in item_values.items()}
    result = {}
    for name, lookup in (
        ("global_mean", lambda user, item: global_mean),
        ("user_mean", lambda user, item: user_means.get(user)),
        ("item_mean", lambda user, item: item_means.get(item)),
    ):
        predictions = [lookup(user, item) for user, item, _ in evaluation]
        reasons = [None if prediction is not None else f"{name.removesuffix('_mean')}_unseen" for prediction in predictions]
        result[name] = predictions, reasons
    return result


def _paired_metric(
    actuals: list[int],
    predictions: list[float | None],
    ubcf_predictions: list[float | None],
) -> dict:
    selected = [(actual, prediction) for actual, prediction, ubcf in zip(actuals, predictions, ubcf_predictions) if ubcf is not None]
    return _metric([actual for actual, _ in selected], [prediction for _, prediction in selected], [None] * len(selected))


def _verify_artifacts(data_dir: Path, manifest: dict) -> None:
    expected = {"canonical.csv", "user_id_map.csv", "item_id_map.csv", "train.csv", "validation.csv", "test.csv"}
    artifacts = manifest.get("artifacts", {})
    if set(artifacts) != expected:
        raise ValueError("manifest artifact list is incomplete or unexpected")
    for name, details in artifacts.items():
        path = data_dir / name
        if not path.is_file() or _sha256(path) != details.get("sha256"):
            raise ValueError(f"artifact checksum mismatch: {name}")


def evaluate_dataset(
    data_dir: Path,
    output_dir: Path,
    *,
    ks: tuple[int, ...] = (1, 3, 5, 10),
    min_common: int = 1,
) -> Path:
    if output_dir.exists():
        raise ValueError(f"output path already exists: {output_dir}")
    if not ks or any(k < 1 for k in ks) or min_common < 1:
        raise ValueError("k candidates and minimum common ratings must be positive")
    if len(set(ks)) != len(ks):
        raise ValueError("k candidates must be unique")
    manifest_path = data_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    _verify_artifacts(data_dir, manifest)
    train_rows, train = _load_ratings(data_dir / "train.csv")
    validation_rows, _ = _load_ratings(data_dir / "validation.csv")
    test_rows, _ = _load_ratings(data_dir / "test.csv")
    train_pairs = {(user, item) for user, item, _ in train_rows}
    validation_pairs = {(user, item) for user, item, _ in validation_rows}
    test_pairs = {(user, item) for user, item, _ in test_rows}
    if train_pairs & validation_pairs or train_pairs & test_pairs or validation_pairs & test_pairs:
        raise ValueError("user-item pair leakage across train, validation, and test")
    if any(user not in train for user, _, _ in validation_rows + test_rows):
        raise ValueError("validation/test user missing from training data")

    validation_neighbor_cache, validation_neighbor_stats = _neighbor_support(train, validation_rows, min_common)
    validation_baselines = _baseline_predictions(train, validation_rows)
    validation_actuals = [rating for _, _, rating in validation_rows]
    validation_candidates = []
    for k in sorted(ks):
        predictions, reasons = _model_predictions(train, validation_rows, k, min_common, validation_neighbor_cache)
        metrics = _metric(validation_actuals, predictions, reasons)
        baselines = {
            name: {
                "all_validation": _metric(validation_actuals, baseline_predictions, baseline_reasons),
                "on_ubcf_covered": _paired_metric(validation_actuals, baseline_predictions, predictions),
            }
            for name, (baseline_predictions, baseline_reasons) in validation_baselines.items()
        }
        validation_candidates.append({"k": k, "ubcf": metrics, "baselines": baselines})
    viable = [candidate for candidate in validation_candidates if candidate["ubcf"]["mae"] is not None]
    if not viable:
        raise ValueError("no UBCF validation predictions; cannot select k")
    selected_k = min(viable, key=lambda candidate: (candidate["ubcf"]["mae"], candidate["k"]))["k"]

    refit_rows = train_rows + validation_rows
    refit: dict[int, dict[int, int]] = defaultdict(dict)
    for user_id, item_id, rating in refit_rows:
        refit[user_id][item_id] = rating
    test_actuals = [rating for _, _, rating in test_rows]
    test_neighbor_cache, test_neighbor_stats = _neighbor_support(refit, test_rows, min_common)
    test_predictions_by_k = {
        k: _model_predictions(refit, test_rows, k, min_common, test_neighbor_cache)
        for k in sorted(ks)
    }
    test_predictions, test_reasons = test_predictions_by_k[selected_k]
    test_metrics_by_k = {
        k: _metric(test_actuals, predictions, reasons)
        for k, (predictions, reasons) in test_predictions_by_k.items()
    }
    test_baselines = _baseline_predictions(refit, test_rows)
    baseline_report = {
        name: {
            "all_test": _metric(test_actuals, predictions, reasons),
            "on_ubcf_covered": _paired_metric(test_actuals, predictions, test_predictions),
            "on_ubcf_covered_by_k": {
                str(k): _paired_metric(test_actuals, predictions, ubcf_predictions)
                for k, (ubcf_predictions, _) in test_predictions_by_k.items()
            },
        }
        for name, (predictions, reasons) in test_baselines.items()
    }

    output_dir.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=f"{output_dir.name}-", dir=output_dir.parent) as temp_dir:
        staged = Path(temp_dir) / "result"
        staged.mkdir()
        predictions_path = staged / "test_predictions.csv"
        with predictions_path.open("w", encoding="utf-8", newline="") as file:
            writer = csv.writer(file)
            writer.writerow(("user_id", "item_id", "actual_rating", "ubcf_prediction", "missing_reason", "global_mean", "user_mean", "item_mean"))
            for index, (user_id, item_id, actual) in enumerate(test_rows):
                writer.writerow((
                    user_id, item_id, actual, test_predictions[index], test_reasons[index],
                    test_baselines["global_mean"][0][index],
                    test_baselines["user_mean"][0][index],
                    test_baselines["item_mean"][0][index],
                ))
        report = {
            "input_manifest_sha256": _sha256(manifest_path),
            "runtime": {"python_version": platform.python_version(), "pipeline_sha256": _sha256(Path(__file__))},
            "sampling": manifest["preprocessing"]["subset_policy"],
            "protocol": {
                "similarity": "explicit-rating cosine on co-rated items (existing Python engine, overlap strategy)",
                "prediction": "positive-similarity-weighted average; no prediction when no selected neighbor rated item",
                "min_common_ratings": min_common,
                "k_candidates": sorted(ks),
                "parameter_selection": "lowest validation MAE among candidates with at least one prediction; ties choose smaller k",
                "final_fit": "train plus validation; test scored once for every preregistered k; selected_k is primary, others descriptive only",
            },
            "validation": {
                "candidates": validation_candidates,
                "selected_k": selected_k,
                "neighbor_support": validation_neighbor_stats,
            },
            "test": {
                "selected_k": selected_k,
                "ubcf": test_metrics_by_k[selected_k],
                "ubcf_by_k": {str(k): test_metrics_by_k[k] for k in sorted(ks)},
                "neighbor_support": test_neighbor_stats,
                "baselines": baseline_report,
            },
            "connectivity": manifest["audit"].get("connectivity", {}),
            "artifacts": {"test_predictions.csv": {"sha256": _sha256(predictions_path), "rows": len(test_rows)}},
        }
        (staged / "evaluation.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        staged.replace(output_dir)
    return output_dir


def _positive_int(value: str) -> int:
    try:
        result = int(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("must be a positive integer") from error
    if result < 1:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    prepare = commands.add_parser("prepare", help="validate RAW files and create canonical data plus splits")
    prepare.add_argument("--interactions", type=Path, required=True)
    prepare.add_argument("--recipes", type=Path, required=True)
    prepare.add_argument("--output-dir", type=Path, required=True)
    prepare.add_argument("--source-version", required=True, help="release/version label verified from source metadata")
    prepare.add_argument("--rights-review", required=True, help="institutional approval or permission reference")
    prepare.add_argument("--seed", type=int, required=True)
    prepare.add_argument("--user-limit", type=_positive_int, required=True)
    prepare.add_argument(
        "--sampling-strategy", choices=("hash_id", "user_history", "popular_recipes", "k_core", "largest_component"),
        default="hash_id",
    )
    prepare.add_argument("--min-user-train", type=_positive_int, default=5)
    prepare.add_argument("--min-popular-user-train", type=_positive_int, default=3)
    prepare.add_argument("--min-item-train", type=_positive_int, default=25)
    prepare.add_argument("--core-k", type=_positive_int, default=3)
    evaluate = commands.add_parser("evaluate", help="tune k on validation and evaluate once on test")
    evaluate.add_argument("--data-dir", type=Path, required=True)
    evaluate.add_argument("--output-dir", type=Path, required=True)
    evaluate.add_argument("--ks", type=_positive_int, nargs="+", default=(1, 3, 5, 10))
    evaluate.add_argument("--min-common", type=_positive_int, default=1)
    args = parser.parse_args(argv)
    try:
        if args.command == "prepare":
            result = prepare_dataset(
                args.interactions, args.recipes, args.output_dir,
                source_version=args.source_version, seed=args.seed,
                user_limit=args.user_limit, rights_review=args.rights_review,
                sampling_strategy=args.sampling_strategy,
                min_user_train=args.min_user_train,
                min_popular_user_train=args.min_popular_user_train,
                min_item_train=args.min_item_train,
                core_k=args.core_k,
            )
        else:
            result = evaluate_dataset(args.data_dir, args.output_dir, ks=tuple(args.ks), min_common=args.min_common)
    except (OSError, ValueError, sqlite3.Error, csv.Error) as error:
        parser.exit(2, f"error: {error}\n")
    print(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
