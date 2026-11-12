import csv
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPT_DIR))

from foodcom_research import (
    _graph_stats,
    _model_predictions,
    _neighbor_support,
    _split_items,
    evaluate_dataset,
    prepare_dataset,
)  # noqa: E402


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
        self.assertEqual(
            report["protocol"]["final_fit"],
            "train plus validation; test scored once for every preregistered k; selected_k is primary, others descriptive only",
        )
        self.assertEqual(report["test"]["ubcf"]["n_total"], 8)
        self.assertEqual(report["test"]["ubcf"]["n_predicted"] + report["test"]["ubcf"]["n_missing"], 8)
        self.assertIn("coverage", report["test"]["baselines"]["global_mean"]["all_test"])
        self.assertEqual(set(report["test"]["ubcf_by_k"]), {"1", "3"})
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

    def test_low_activity_sampled_user_is_kept_in_train_without_holdout(self):
        with self.interactions.open("a", encoding="utf-8", newline="") as file:
            csv.writer(file).writerow((99, 101, "2021-01-01", 4, "one rating"))
        data = prepare_dataset(
            self.interactions, self.recipes, self.root / "low-activity",
            source_version="test-release", seed=20261112,
            user_limit=9, rights_review="test fixture only",
        )
        with (data / "user_id_map.csv").open(encoding="utf-8", newline="") as file:
            mapping = {row["foodcom_user_id"]: row["user_id"] for row in csv.DictReader(file)}
        user_id = mapping["99"]
        split_users = {}
        for split in ("train", "validation", "test"):
            with (data / f"{split}.csv").open(encoding="utf-8", newline="") as file:
                split_users[split] = {row["user_id"] for row in csv.DictReader(file)}
        self.assertIn(user_id, split_users["train"])
        self.assertNotIn(user_id, split_users["validation"])
        self.assertNotIn(user_id, split_users["test"])
        manifest = json.loads((data / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["audit"]["split_users"], {"train": 9, "validation": 8, "test": 8})

    def test_train_history_sampler_and_connectivity_manifest_are_reproducible(self):
        with self.interactions.open("a", encoding="utf-8", newline="") as file:
            csv.writer(file).writerow((99, 106, "2023-01-01", 5, "below minimum training history"))
        first = prepare_dataset(
            self.interactions, self.recipes, self.root / "history-first",
            source_version="test-release", seed=20261113, user_limit=8,
            rights_review="test fixture only", sampling_strategy="user_history", min_user_train=4,
        )
        second = prepare_dataset(
            self.interactions, self.recipes, self.root / "history-second",
            source_version="test-release", seed=20261113, user_limit=8,
            rights_review="test fixture only", sampling_strategy="user_history", min_user_train=4,
        )
        for name in ("canonical.csv", "train.csv", "validation.csv", "test.csv", "manifest.json"):
            self.assertEqual((first / name).read_bytes(), (second / name).read_bytes())
        manifest = json.loads((first / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["preprocessing"]["subset_policy"]["eligible_users_before_cap"], 8)
        self.assertEqual(manifest["preprocessing"]["subset_policy"]["strategy"], "user_history")
        self.assertFalse(manifest["audit"]["connectivity"]["population_full"]["computed"])
        self.assertGreater(manifest["audit"]["connectivity"]["subset_full"]["edges"], 0)
        self.assertGreater(manifest["audit"]["connectivity"]["subset_training"]["components"], 0)
        with (first / "user_id_map.csv").open(encoding="utf-8", newline="") as file:
            self.assertNotIn("99", {row["foodcom_user_id"] for row in csv.DictReader(file)})

    def test_popular_k_core_and_largest_component_sampling_execute(self):
        configurations = (
            ("popular_recipes", {"min_popular_user_train": 3, "min_item_train": 4}),
            ("k_core", {"core_k": 3}),
            ("largest_component", {}),
        )
        for strategy, options in configurations:
            with self.subTest(strategy=strategy):
                data = prepare_dataset(
                    self.interactions, self.recipes, self.root / strategy,
                    source_version="test-release", seed=20261113, user_limit=8,
                    rights_review="test fixture only", sampling_strategy=strategy, **options,
                )
                manifest = json.loads((data / "manifest.json").read_text(encoding="utf-8"))
                self.assertEqual(manifest["preprocessing"]["subset_policy"]["strategy"], strategy)
                self.assertGreater(manifest["audit"]["subset"]["explicit_rating_pairs"], 0)
                self.assertIn("population_training", manifest["audit"]["connectivity"])

    def test_graph_components_and_largest_component_members(self):
        stats, users, items = _graph_stats(
            [(1, 1, 5), (1, 2, 4), (2, 2, 5), (2, 3, 3), (3, 4, 5)],
            3, 4, include_largest_members=True,
        )
        self.assertEqual(stats["components"], 2)
        self.assertEqual(stats["largest_component"], {"nodes": 5, "users": 2, "items": 3})
        self.assertEqual(set(users), {1, 2})
        self.assertEqual(set(items), {1, 2, 3})

    def test_neighbor_and_candidate_support_are_reported_separately(self):
        training = {1: {1: 5, 2: 4}, 2: {1: 4}, 3: {3: 5}}
        evaluation = [(1, 3, 5)]
        neighbors, stats = _neighbor_support(training, evaluation, min_common=1)
        predictions, reasons = _model_predictions(training, evaluation, 1, 1, neighbors)
        self.assertEqual(stats["valid_neighbors_per_user"]["histogram"], {"1": 1})
        self.assertEqual(stats["common_ratings_per_valid_user_pair"]["histogram"], {"1": 1})
        self.assertEqual(stats["zero_overlap_pairs"], 1)
        self.assertEqual(stats["common_ratings_per_candidate_user_pair"]["histogram"], {"0": 1, "1": 1})
        self.assertEqual(predictions, [None])
        self.assertEqual(reasons, ["neighbors_not_rated_item"])

    def test_split_assignment_is_deterministic_and_preserves_minimum_partitions(self):
        items = [str(item) for item in range(101, 111)]
        first = _split_items(20261113, "user-1", items)
        self.assertEqual(first, _split_items(20261113, "user-1", items))
        self.assertEqual({"train", "validation", "test"}, set(first.values()))
        self.assertEqual({"train"}, set(_split_items(20261113, "user-2", items[:2]).values()))

    def test_modified_split_fails_checksum_before_evaluation(self):
        data = self._prepare("dataset")
        with (data / "test.csv").open("a", encoding="utf-8") as file:
            file.write("\n")
        with self.assertRaisesRegex(ValueError, "artifact checksum mismatch"):
            evaluate_dataset(data, self.root / "evaluation", ks=(1,))


if __name__ == "__main__":
    unittest.main()
