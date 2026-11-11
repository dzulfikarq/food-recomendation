import csv
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPT_DIR))

from foodcom_research import evaluate_dataset, prepare_dataset  # noqa: E402


class FoodComResearchPipelineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.interactions = self.root / "RAW_interactions.csv"
        self.recipes = self.root / "RAW_recipes.csv"
        with self.recipes.open("w", encoding="utf-8", newline="") as file:
            writer = csv.writer(file)
            writer.writerow(("name", "id", "description"))
            writer.writerows((f"recipe {item}", item, "" if item == 106 else "details") for item in range(101, 107))
        with self.interactions.open("w", encoding="utf-8", newline="") as file:
            writer = csv.writer(file)
            writer.writerow(("user_id", "recipe_id", "date", "rating", "review"))
            for user in range(1, 9):
                for item in range(101, 107):
                    rating = (user + item) % 5 + 1
                    writer.writerow((user, item, "2020-01-01", rating, "rated"))
            writer.writerow((1, 101, "2021-01-01", 4, "latest explicit rating"))
            writer.writerow((1, 102, "2022-01-01", 0, "will not rate"))

    def tearDown(self):
        self.temp.cleanup()

    def _prepare(self, name):
        return prepare_dataset(
            self.interactions,
            self.recipes,
            self.root / name,
            source_version="test-release",
            seed=20261112,
            user_limit=8,
            rights_review="test fixture only",
        )

    def test_prepare_is_deterministic_and_keeps_source_mapping(self):
        first = self._prepare("first")
        second = self._prepare("second")
        names = (
            "canonical.csv", "user_id_map.csv", "item_id_map.csv",
            "train.csv", "validation.csv", "test.csv", "manifest.json",
        )
        for name in names:
            self.assertEqual((first / name).read_bytes(), (second / name).read_bytes())

        manifest = json.loads((first / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["audit"]["rating_zero_rows_excluded"], 1)
        self.assertEqual(manifest["audit"]["duplicate_explicit_rows_removed"], 1)
        self.assertEqual(manifest["audit"]["full_explicit_data"]["explicit_rating_pairs"], 48)
        self.assertEqual(manifest["audit"]["subset"]["explicit_rating_pairs"], 48)
        self.assertEqual(manifest["audit"]["missing_values"]["RAW_recipes.csv"]["cells_by_column"]["description"], 1)
        self.assertEqual(manifest["audit"]["split_rows"]["train"] + manifest["audit"]["split_rows"]["validation"] + manifest["audit"]["split_rows"]["test"], 48)
        self.assertTrue(all(len(details["sha256"]) == 64 for details in manifest["artifacts"].values()))
        self.assertEqual(hashlib.sha256((first / "canonical.csv").read_bytes()).hexdigest(), manifest["artifacts"]["canonical.csv"]["sha256"])

        with (first / "canonical.csv").open(encoding="utf-8", newline="") as file:
            rows = list(csv.DictReader(file))
        self.assertEqual(len(rows), 48)
        self.assertEqual(next(row["rating"] for row in rows if row["user_id"] == "1" and row["item_id"] == "1"), "4")
        self.assertNotIn("0", {row["rating"] for row in rows})

        splits = []
        for split in ("train", "validation", "test"):
            with (first / f"{split}.csv").open(encoding="utf-8", newline="") as file:
                splits.append({(row["user_id"], row["item_id"]) for row in csv.DictReader(file)})
        self.assertFalse(splits[0] & splits[1] or splits[0] & splits[2] or splits[1] & splits[2])
        self.assertEqual(set.union(*splits), {(row["user_id"], row["item_id"]) for row in rows})

    def test_evaluator_selects_k_from_validation_then_reports_test_coverage(self):
        data = self._prepare("dataset")
        result = evaluate_dataset(data, self.root / "evaluation", ks=(1, 3), min_common=1)
        report = json.loads((result / "evaluation.json").read_text(encoding="utf-8"))
        self.assertIn(report["validation"]["selected_k"], (1, 3))
        self.assertEqual(report["protocol"]["final_fit"], "train plus validation; test used once after k selection")
        self.assertEqual(report["test"]["ubcf"]["n_total"], 8)
        self.assertEqual(report["test"]["ubcf"]["n_predicted"] + report["test"]["ubcf"]["n_missing"], 8)
        self.assertIn("coverage", report["test"]["baselines"]["global_mean"]["all_test"])
        self.assertEqual(report["artifacts"]["test_predictions.csv"]["rows"], 8)

    def test_test_rating_changes_do_not_change_validation_selected_k(self):
        original = self._prepare("original-data")
        changed = self._prepare("changed-data")
        with (changed / "test.csv").open(encoding="utf-8", newline="") as file:
            rows = list(csv.DictReader(file))
        with (changed / "test.csv").open("w", encoding="utf-8", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=("user_id", "item_id", "rating"))
            writer.writeheader()
            for row in rows:
                row["rating"] = str(6 - int(row["rating"]))
                writer.writerow(row)
        manifest_path = changed / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["artifacts"]["test.csv"]["sha256"] = hashlib.sha256((changed / "test.csv").read_bytes()).hexdigest()
        manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")

        original_report = evaluate_dataset(original, self.root / "original-result", ks=(1, 3))
        changed_report = evaluate_dataset(changed, self.root / "changed-result", ks=(1, 3))
        original_k = json.loads((original_report / "evaluation.json").read_text(encoding="utf-8"))["validation"]["selected_k"]
        changed_k = json.loads((changed_report / "evaluation.json").read_text(encoding="utf-8"))["validation"]["selected_k"]
        self.assertEqual(original_k, changed_k)

    def test_invalid_rating_and_missing_recipe_are_rejected(self):
        invalid = self.root / "invalid.csv"
        invalid.write_text(
            "user_id,recipe_id,date,rating,review\n1,101,2020-01-01,6,bad\n",
            encoding="utf-8",
        )
        with self.assertRaisesRegex(ValueError, "rating must be an integer"):
            prepare_dataset(invalid, self.recipes, self.root / "invalid-out", source_version="v1", seed=1, user_limit=1, rights_review="review")

        unknown = self.root / "unknown.csv"
        unknown.write_text(
            "user_id,recipe_id,date,rating,review\n1,999,2020-01-01,4,unknown\n",
            encoding="utf-8",
        )
        with self.assertRaisesRegex(ValueError, "missing from RAW_recipes.csv"):
            prepare_dataset(unknown, self.recipes, self.root / "unknown-out", source_version="v1", seed=1, user_limit=1, rights_review="review")

    def test_modified_split_fails_checksum_before_evaluation(self):
        data = self._prepare("dataset")
        with (data / "test.csv").open("a", encoding="utf-8") as file:
            file.write("\n")
        with self.assertRaisesRegex(ValueError, "artifact checksum mismatch"):
            evaluate_dataset(data, self.root / "evaluation", ks=(1,))


if __name__ == "__main__":
    unittest.main()
