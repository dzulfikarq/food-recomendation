import csv
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from export_foodcom_catalog import export_catalog


class FoodComCatalogExportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.prepared = self.root / "prepared"
        self.prepared.mkdir()
        self.raw = self.root / "RAW_recipes.csv"
        self.output = self.root / "export"
        self._write("user_id_map.csv", "user_id,foodcom_user_id\n1,7001\n2,7002\n")
        self._write("item_id_map.csv", "item_id,foodcom_recipe_id\n1,8001\n2,8002\n3,8003\n4,8004\n5,8005\n6,8006\n")
        self._write("train.csv", "user_id,item_id,rating\n1,1,5\n1,2,4\n1,3,4\n1,4,3\n1,5,5\n2,1,4\n2,2,4\n2,3,3\n2,4,5\n2,5,4\n")
        with self.raw.open("w", encoding="utf-8", newline="") as file:
            writer = csv.writer(file)
            writer.writerow(("id", "name", "description", "minutes", "submitted", "tags", "nutrition", "n_steps", "steps", "ingredients", "n_ingredients"))
            for recipe_id in range(8001, 8006):
                writer.writerow((recipe_id, "source recipe" if recipe_id == 8001 else f"source {recipe_id}", "source description", 30, "2019-01-02", "['easy']", "[1, 2, 3, 4, 5, 6, 7]", 2, "['step one', 'step two']", "['water']", 1))
            writer.writerow((8006, "validation-only recipe", "", 1, "2019-01-02", "[]", "[0, 0, 0, 0, 0, 0, 0]", 0, "[]", "[]", 0))
        (self.prepared / "manifest.json").write_text(json.dumps({
            "source": {
                "release_label": "Food.com v2",
                "rights_review_reference": "local-review",
                "files": {"RAW_recipes.csv": {"sha256": hashlib.sha256(self.raw.read_bytes()).hexdigest()}},
            },
            "preprocessing": {"subset_policy": {"strategy": "user_history", "seed": 20261113, "user_limit": 500, "min_user_train": 5}},
            "artifacts": {
                name: {"sha256": hashlib.sha256((self.prepared / name).read_bytes()).hexdigest()}
                for name in ("train.csv", "user_id_map.csv", "item_id_map.csv")
            },
        }), encoding="utf-8")

    def tearDown(self):
        self.temp.cleanup()

    def _write(self, name, content):
        (self.prepared / name).write_text(content, encoding="utf-8", newline="")

    def test_export_uses_only_train_ratings_and_source_recipe_metadata(self):
        export_catalog(self.prepared, self.raw, self.output)
        manifest = json.loads((self.output / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["counts"], {"users": 2, "recipes": 5, "ratings": 10})
        recipes = [json.loads(line) for line in (self.output / "recipes.jsonl").read_text(encoding="utf-8").splitlines()]
        self.assertEqual(recipes[0]["sourceId"], "8001")
        self.assertEqual(recipes[0]["name"], "source recipe")
        self.assertNotIn("validation-only recipe", (self.output / "recipes.jsonl").read_text(encoding="utf-8"))
        self.assertIsNone(recipes[0]["category"])
        self.assertIsNone(recipes[0]["imageUrl"])
        with (self.output / "historical_ratings.csv").open(encoding="utf-8", newline="") as file:
            ratings = list(csv.DictReader(file))
        self.assertEqual(len(ratings), 10)
        self.assertEqual(ratings[0], {"source_user_id": "7001", "source_recipe_id": "8001", "rating": "5"})
        self.assertEqual(ratings[-1], {"source_user_id": "7002", "source_recipe_id": "8005", "rating": "4"})

    def test_export_refuses_tampered_training_artifact(self):
        self._write("train.csv", "user_id,item_id,rating\n1,1,0\n")
        with self.assertRaisesRegex(ValueError, "checksum mismatch"):
            export_catalog(self.prepared, self.raw, self.output)

    def test_export_refuses_raw_file_from_different_release(self):
        with self.raw.open("a", encoding="utf-8") as source:
            source.write("\n")
        with self.assertRaisesRegex(ValueError, "RAW_recipes.csv checksum"):
            export_catalog(self.prepared, self.raw, self.output)

    def test_export_requires_prespecified_seed_and_five_rating_minimum(self):
        manifest_path = self.prepared / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["preprocessing"]["subset_policy"]["min_user_train"] = 4
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "prespecified user_history cohort"):
            export_catalog(self.prepared, self.raw, self.output)


if __name__ == "__main__":
    unittest.main()
