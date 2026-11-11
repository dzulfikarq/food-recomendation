"""Reproducible, local-only Food.com research data pipeline."""

from __future__ import annotations

import argparse
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
) -> Path:
    if output_dir.exists():
        raise ValueError(f"output path already exists: {output_dir}")
    if not interactions_path.is_file() or not recipes_path.is_file():
        raise ValueError("both RAW source files must exist")
    if not source_version.strip() or not rights_review.strip():
        raise ValueError("source version and rights review reference are required")
    if user_limit < 1:
        raise ValueError("user limit must be positive")

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
            source_users = [row[0] for row in connection.execute(
                "SELECT DISTINCT user_id FROM interactions"
            )]
            selected_sources = [
                source_user
                for source_user, _ in sorted(
                    ((source_user, _rank(seed, "user-sample", source_user)) for source_user in source_users),
                    key=lambda row: (row[1], _source_key(row[0])),
                )[:user_limit]
            ]
            if not selected_sources:
                raise ValueError("no users have at least three explicit user-recipe ratings")

            connection.execute("CREATE TEMP TABLE selected_users(source_id TEXT PRIMARY KEY, user_id INTEGER NOT NULL)")
            connection.executemany(
                "INSERT INTO selected_users VALUES(?,?)",
                [(source_id, index) for index, source_id in enumerate(sorted(selected_sources, key=_source_key), 1)],
            )
            selected_items = [row[0] for row in connection.execute(
                "SELECT DISTINCT i.item_id FROM interactions i JOIN selected_users u ON u.source_id=i.user_id"
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

                current_user = None
                user_rows = []

                def flush_user(source_user: str, rows: list[tuple[int, int, int, str]]) -> None:
                    nonlocal split_rows
                    count = len(rows)
                    if count < 3:
                        assignment = {row[1]: "train" for row in rows}
                    else:
                        train_count = max(1, count * 8 // 10)
                        validation_count = max(1, count // 10)
                        if count - train_count - validation_count < 1:
                            train_count -= 1
                        ranked = sorted(rows, key=lambda row: (_rank(seed, "split", source_user, row[3]), row[1]))
                        assignment = {
                            row[1]: (
                                "train" if index < train_count else
                                "validation" if index < train_count + validation_count else "test"
                            )
                            for index, row in enumerate(ranked)
                        }
                    for canonical_user, canonical_item, rating, _ in rows:
                        record = (canonical_user, canonical_item, rating)
                        split = assignment[canonical_item]
                        canonical_writer.writerow(record)
                        split_writers[split].writerow(record)
                        split_counts[split] += 1
                        split_users[split].add(canonical_user)
                        rating_counts[rating] += 1
                        split_rows += 1

                query = connection.execute(
                    """SELECT u.source_id,u.user_id,i.item_id,p.item_id,i.rating
                       FROM interactions i
                       JOIN selected_users u ON u.source_id=i.user_id
                       JOIN selected_items p ON p.source_id=i.item_id
                       ORDER BY u.user_id,p.item_id"""
                )
                for source_user, canonical_user, source_item, canonical_item, rating in query:
                    if current_user is not None and source_user != current_user:
                        flush_user(current_user, user_rows)
                        user_rows = []
                    current_user = source_user
                    user_rows.append((canonical_user, canonical_item, rating, source_item))
                if current_user is not None:
                    flush_user(current_user, user_rows)

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
            manifest = {
                "schema_version": 1,
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
                        "user_limit": user_limit,
                        "selection": "SHA-256 rank over source user IDs with at least one explicit rating; no activity-count eligibility filter.",
                        "bias": "Item coverage follows selected users. Users with fewer than three pairs remain train-only; validation/test estimates cover users with enough history for all splits.",
                    },
                    "split_policy": {
                        "algorithm": "Per user, SHA-256 rank of source user/recipe IDs; users with fewer than three pairs are train-only, others have at least one row in each split.",
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


def _model_predictions(
    training: dict[int, dict[int, int]],
    evaluation: list[tuple[int, int, int]],
    k: int,
    min_common: int,
) -> tuple[list[float | None], list[str | None]]:
    neighbors_by_user = {
        user_id: select_neighbors(
            user_id, training, k,
            min_common_ratings=min_common,
            similarity_strategy=SimilarityStrategy.OVERLAP,
        )
        for user_id in sorted({user_id for user_id, _, _ in evaluation})
    }
    predictions = []
    reasons = []
    for user_id, item_id, _ in evaluation:
        neighbors = neighbors_by_user[user_id]
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

    validation_baselines = _baseline_predictions(train, validation_rows)
    validation_actuals = [rating for _, _, rating in validation_rows]
    validation_candidates = []
    for k in sorted(ks):
        predictions, reasons = _model_predictions(train, validation_rows, k, min_common)
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
    test_predictions, test_reasons = _model_predictions(refit, test_rows, selected_k, min_common)
    test_metrics = _metric(test_actuals, test_predictions, test_reasons)
    test_baselines = _baseline_predictions(refit, test_rows)
    baseline_report = {
        name: {
            "all_test": _metric(test_actuals, predictions, reasons),
            "on_ubcf_covered": _paired_metric(test_actuals, predictions, test_predictions),
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
            "protocol": {
                "similarity": "explicit-rating cosine on co-rated items (existing Python engine, overlap strategy)",
                "prediction": "positive-similarity-weighted average; no prediction when no selected neighbor rated item",
                "min_common_ratings": min_common,
                "k_candidates": sorted(ks),
                "parameter_selection": "lowest validation MAE among candidates with at least one prediction; ties choose smaller k",
                "final_fit": "train plus validation; test used once after k selection",
            },
            "validation": {"candidates": validation_candidates, "selected_k": selected_k},
            "test": {"ubcf": test_metrics, "baselines": baseline_report},
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
            )
        else:
            result = evaluate_dataset(args.data_dir, args.output_dir, ks=tuple(args.ks), min_common=args.min_common)
    except (OSError, ValueError, sqlite3.Error, csv.Error) as error:
        parser.exit(2, f"error: {error}\n")
    print(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
