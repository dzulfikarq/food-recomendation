"""Export a verified, training-only Food.com subset for local FoodRec import."""

from __future__ import annotations

import argparse
import ast
import csv
import hashlib
import json
import math
import tempfile
from datetime import date
from pathlib import Path


SOURCE_DATASET = "FOODCOM"
REQUIRED_ARTIFACTS = ("train.csv", "user_id_map.csv", "item_id_map.csv")
MAX_APP_USERS = 500
MAX_APP_RECIPES = 10_000
MAX_APP_RATINGS = 100_000
MAX_SNAPSHOT_BYTES = 20 * 1024 * 1024


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _read_map(path: Path, canonical_field: str, source_field: str) -> dict[int, str]:
    result: dict[int, str] = {}
    sources: set[str] = set()
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source, strict=True)
        if reader.fieldnames != [canonical_field, source_field]:
            raise ValueError(f"{path.name}: unexpected mapping header")
        for line, row in enumerate(reader, start=2):
            try:
                canonical_id = int(row[canonical_field] or "")
                source_id = row[source_field] or ""
            except (TypeError, ValueError) as error:
                raise ValueError(f"{path.name}:{line}: invalid mapping row") from error
            if canonical_id < 1 or not source_id.isascii() or not source_id.isdigit() or int(source_id) < 1:
                raise ValueError(f"{path.name}:{line}: IDs must be positive integers")
            normalized_source_id = str(int(source_id))
            if canonical_id in result or normalized_source_id in sources:
                raise ValueError(f"{path.name}:{line}: duplicate mapping")
            if canonical_field == "user_id" and int(source_id) > 9_007_199_254_740_991:
                raise ValueError(f"{path.name}:{line}: source user ID exceeds worker integer range")
            result[canonical_id] = normalized_source_id
            sources.add(normalized_source_id)
    if not result:
        raise ValueError(f"{path.name}: mapping is empty")
    return result


def _python_list(value: str, field: str, recipe_id: str) -> list:
    try:
        result = ast.literal_eval(value)
    except (SyntaxError, ValueError) as error:
        raise ValueError(f"recipe {recipe_id}: malformed {field}") from error
    if not isinstance(result, list):
        raise ValueError(f"recipe {recipe_id}: {field} must be a list")
    return result


def _text_list(value: str, field: str, recipe_id: str) -> list[str]:
    values = _python_list(value, field, recipe_id)
    if any(not isinstance(item, str) for item in values):
        raise ValueError(f"recipe {recipe_id}: {field} must contain strings")
    return [item.strip() for item in values]


def _integer(value: str, field: str, recipe_id: str) -> int | None:
    raw = value.strip()
    if not raw:
        return None
    try:
        result = int(raw)
    except ValueError as error:
        raise ValueError(f"recipe {recipe_id}: invalid {field}") from error
    if result < 0:
        raise ValueError(f"recipe {recipe_id}: {field} cannot be negative")
    return result


def _recipe(row: dict[str, str], source_version: str) -> dict:
    source_id = row.get("id", "").strip()
    if not source_id.isascii() or not source_id.isdigit() or int(source_id) < 1:
        raise ValueError(f"invalid Food.com recipe ID {source_id!r}")
    if len(source_id) > 55:
        raise ValueError(f"recipe {source_id}: ID exceeds FoodRec source-code limit")
    name = row.get("name", "").strip()
    if not name:
        raise ValueError(f"recipe {source_id}: source name is missing; refusing to invent one")
    description = row.get("description", "").strip() or None
    submitted = row.get("submitted", "").strip() or None
    if submitted:
        try:
            if date.fromisoformat(submitted).isoformat() != submitted:
                raise ValueError
        except ValueError as error:
            raise ValueError(f"recipe {source_id}: invalid submitted date") from error
    nutrition = _python_list(row.get("nutrition", ""), "nutrition", source_id)
    if len(nutrition) != 7 or any(
        isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value)
        for value in nutrition
    ):
        raise ValueError(f"recipe {source_id}: nutrition must contain seven finite numbers")
    return {
        "foodCode": f"FOODCOM-{source_id}",
        "sourceDataset": SOURCE_DATASET,
        "sourceId": str(int(source_id)),
        "sourceVersion": source_version,
        "name": name,
        "description": description,
        "category": None,
        "taste": None,
        "origin": None,
        "imageUrl": None,
        "minutes": _integer(row.get("minutes", ""), "minutes", source_id),
        "submittedAt": submitted,
        "nSteps": _integer(row.get("n_steps", ""), "n_steps", source_id),
        "nIngredients": _integer(row.get("n_ingredients", ""), "n_ingredients", source_id),
        "tags": _text_list(row.get("tags", ""), "tags", source_id),
        "nutrition": nutrition,
        "steps": _text_list(row.get("steps", ""), "steps", source_id),
        "ingredients": _text_list(row.get("ingredients", ""), "ingredients", source_id),
    }


def export_catalog(prepared_dir: Path, raw_recipes: Path, output_dir: Path) -> Path:
    if output_dir.exists():
        raise ValueError(f"output path already exists: {output_dir}")
    if not raw_recipes.is_file():
        raise ValueError("RAW_recipes.csv does not exist")
    prepared_manifest_path = prepared_dir / "manifest.json"
    prepared_manifest = json.loads(prepared_manifest_path.read_text(encoding="utf-8"))
    artifacts = prepared_manifest.get("artifacts", {})
    if any(name not in artifacts for name in REQUIRED_ARTIFACTS):
        raise ValueError("prepared manifest is missing train or source-ID mapping artifacts")
    for name in REQUIRED_ARTIFACTS:
        path = prepared_dir / name
        if not path.is_file() or _sha256(path) != artifacts[name].get("sha256"):
            raise ValueError(f"prepared artifact checksum mismatch: {name}")

    source_version = prepared_manifest.get("source", {}).get("release_label")
    subset = prepared_manifest.get("preprocessing", {}).get("subset_policy", {})
    strategy = subset.get("strategy")
    seed = subset.get("seed")
    min_user_train = subset.get("min_user_train")
    user_limit = subset.get("user_limit")
    expected_raw_hash = prepared_manifest.get("source", {}).get("files", {}).get("RAW_recipes.csv", {}).get("sha256")
    if (
        not isinstance(source_version, str) or not source_version or strategy != "user_history"
        or type(seed) is not int or seed != 20261113
        or type(min_user_train) is not int or min_user_train < 5
        or type(user_limit) is not int or not 1 <= user_limit <= MAX_APP_USERS
        or not isinstance(expected_raw_hash, str) or len(expected_raw_hash) != 64
        or any(character not in "0123456789abcdef" for character in expected_raw_hash)
    ):
        raise ValueError("prepared manifest does not match the prespecified user_history cohort")
    if _sha256(raw_recipes) != expected_raw_hash:
        raise ValueError("RAW_recipes.csv checksum does not match prepared manifest")

    users = _read_map(prepared_dir / "user_id_map.csv", "user_id", "foodcom_user_id")
    items = _read_map(prepared_dir / "item_id_map.csv", "item_id", "foodcom_recipe_id")
    ratings: list[tuple[str, str, int]] = []
    seen_pairs: set[tuple[int, int]] = set()
    training_user_counts: dict[int, int] = {}
    with (prepared_dir / "train.csv").open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source, strict=True)
        if reader.fieldnames != ["user_id", "item_id", "rating"]:
            raise ValueError("train.csv: unexpected header")
        for line, row in enumerate(reader, start=2):
            try:
                user_id, item_id, rating = (int(row[field] or "") for field in reader.fieldnames)
            except (TypeError, ValueError) as error:
                raise ValueError(f"train.csv:{line}: invalid rating row") from error
            if user_id not in users or item_id not in items or rating not in range(1, 6):
                raise ValueError(f"train.csv:{line}: IDs or rating outside verified subset")
            pair = (user_id, item_id)
            if pair in seen_pairs:
                raise ValueError(f"train.csv:{line}: duplicate user-recipe rating")
            seen_pairs.add(pair)
            training_user_counts[user_id] = training_user_counts.get(user_id, 0) + 1
            ratings.append((users[user_id], items[item_id], rating))
    if not ratings:
        raise ValueError("training subset has no explicit ratings")
    if (
        len(users) > user_limit or set(users) != set(training_user_counts)
        or any(count < min_user_train for count in training_user_counts.values())
    ):
        raise ValueError("user_history cohort does not meet its training-only threshold or 500-user cap")
    if len(ratings) > MAX_APP_RATINGS:
        raise ValueError("training rating count exceeds the 100,000-row worker cap")
    training_recipe_ids = {recipe_id for _, recipe_id, _ in ratings}
    items = {canonical_id: source_id for canonical_id, source_id in items.items() if source_id in training_recipe_ids}
    if set(items.values()) != training_recipe_ids:
        raise ValueError("train.csv recipe IDs do not match the verified item mapping")
    if len(items) > MAX_APP_RECIPES:
        raise ValueError("training-rated recipe count exceeds the 10,000-item worker cap")

    recipes_by_id: dict[str, dict] = {}
    selected_recipe_ids = set(items.values())
    with raw_recipes.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source, strict=True)
        required = {"id", "name", "description", "minutes", "submitted", "tags", "nutrition", "n_steps", "steps", "ingredients", "n_ingredients"}
        if not required.issubset(set(reader.fieldnames or ())):
            raise ValueError("RAW_recipes.csv is missing required recipe metadata columns")
        for row in reader:
            source_id = row.get("id", "").strip()
            if source_id in selected_recipe_ids:
                if source_id in recipes_by_id:
                    raise ValueError(f"RAW_recipes.csv contains duplicate recipe ID {source_id}")
                recipes_by_id[source_id] = _recipe(row, source_version)
    missing = set(items.values()) - recipes_by_id.keys()
    if missing:
        raise ValueError(f"RAW_recipes.csv is missing selected recipe IDs: {sorted(missing)[:5]}")
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=f"{output_dir.name}-", dir=output_dir.parent) as temp_dir:
        staged = Path(temp_dir) / "catalog"
        staged.mkdir()
        with (staged / "recipes.jsonl").open("w", encoding="utf-8", newline="\n") as target:
            for source_id in sorted(recipes_by_id, key=int):
                target.write(json.dumps(recipes_by_id[source_id], ensure_ascii=False, separators=(",", ":")) + "\n")
        if (staged / "recipes.jsonl").stat().st_size > 100 * 1024 * 1024:
            raise ValueError("recipe metadata export exceeds 100 MiB safety limit")
        with (staged / "historical_ratings.csv").open("w", encoding="utf-8", newline="") as target:
            writer = csv.writer(target)
            writer.writerow(("source_user_id", "source_recipe_id", "rating"))
            writer.writerows(sorted(ratings, key=lambda row: (int(row[0]), int(row[1]))))
        names = ("recipes.jsonl", "historical_ratings.csv")
        export_manifest = {
            "schemaVersion": 1,
            "source": {
                "dataset": "Food.com Recipes and User Interactions",
                "url": "https://www.kaggle.com/datasets/shuyangli94/food-com-recipes-and-user-interactions",
                "releaseLabel": source_version,
                "rightsReviewReference": prepared_manifest["source"].get("rights_review_reference"),
                "rawRecipesSha256": _sha256(raw_recipes),
                "preparedManifestSha256": _sha256(prepared_manifest_path),
            },
            "sampling": {
                "strategy": strategy,
                "seed": seed,
                "userLimit": user_limit,
                "minUserTrain": min_user_train,
            },
            "ratingPolicy": "train.csv only; explicit integer ratings 1-5; rating 0 excluded upstream",
            "catalogPolicy": "Include only recipes with at least one selected training rating; validation/test rows never add recipes or ratings.",
            "counts": {
                "users": len({user_id for user_id, _, _ in ratings}),
                "recipes": len(recipes_by_id),
                "ratings": len(ratings),
            },
            "artifacts": {name: {"sha256": _sha256(staged / name)} for name in names},
        }
        (staged / "manifest.json").write_text(
            json.dumps(export_manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        if (staged / "historical_ratings.csv").stat().st_size > MAX_SNAPSHOT_BYTES:
            raise ValueError("training rating export exceeds the 20 MiB worker snapshot limit")
        staged.replace(output_dir)
    return output_dir


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prepared-dir", type=Path, required=True)
    parser.add_argument("--raw-recipes", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        result = export_catalog(args.prepared_dir, args.raw_recipes, args.output_dir)
    except (OSError, ValueError, KeyError, json.JSONDecodeError, csv.Error) as error:
        parser.error(str(error))
    print(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
