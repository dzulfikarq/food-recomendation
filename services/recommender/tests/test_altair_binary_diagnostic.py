import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
FIXTURES = Path(__file__).parent / "fixtures" / "phase_b_altair"
sys.path.insert(0, str(SCRIPTS))

from diagnose_altair_binary import (  # noqa: E402
    binary_cosine,
    diagnose,
    interaction_score,
    read_reference,
    read_training,
    select_binary_neighbors,
    write_report,
)


class BinaryKnnDiagnosticTests(unittest.TestCase):
    def test_binary_cosine_and_neighbor_support_formula(self):
        self.assertEqual(binary_cosine({1, 2}, {2, 3}), 0.5)
        interactions = {9: {1, 2}, 8: {1}, 7: {2}, 6: {3}}
        neighbors = select_binary_neighbors(9, interactions, [9, 8, 7, 6], 3)

        self.assertEqual([neighbor.user_id for neighbor in neighbors], [8, 7, 6])
        self.assertEqual([neighbor.overlap for neighbor in neighbors], [1, 1, 0])
        self.assertAlmostEqual(neighbors[0].similarity, 1 / 2**0.5)
        self.assertEqual(interaction_score(3, neighbors, interactions, 3), 1 / 3)
        self.assertEqual(interaction_score(4, neighbors, interactions, 3), 0)

    def test_neighbor_ties_preserve_first_seen_order_and_zero_similarity_can_fill_k(self):
        interactions = {9: {1, 2}, 8: {1}, 5: {2}, 4: {3}}
        neighbors = select_binary_neighbors(9, interactions, [9, 8, 5, 4], 3)

        self.assertEqual([neighbor.user_id for neighbor in neighbors], [8, 5, 4])
        self.assertEqual(neighbors[-1].similarity, 0)

    def test_rating_magnitudes_are_ignored_when_building_positive_feedback(self):
        with tempfile.TemporaryDirectory() as directory:
            low = Path(directory) / "low.csv"
            high = Path(directory) / "high.csv"
            low.write_text("user_id,food_id,rating\n1,10,1\n2,10,5\n", encoding="utf-8")
            high.write_text("user_id,food_id,rating\n1,10,5\n2,10,1\n", encoding="utf-8")

            self.assertEqual(read_training(low)[:3], read_training(high)[:3])

    def test_train264_native_items_are_max_support_but_ties_prevent_exact_parity_claim(self):
        dataset = FIXTURES / "datasets" / "foodrec_offline_train_264.csv"
        native = FIXTURES / "references" / "altair_train264_top1.csv"
        interactions, users, items, row_count = read_training(dataset)
        references = read_reference(native)
        rows = diagnose(interactions, users, items, references, k=3, top_n=1)
        compared = [row for row in rows if row["reference_items"]]

        self.assertEqual(row_count, 264)
        self.assertEqual(len(compared), 22)
        self.assertEqual(sum(bool(row["reference_score_compatible"]) for row in compared), 22)
        self.assertEqual(sum(bool(row["reference_top1_is_unique_max"]) for row in compared), 5)
        self.assertEqual(sum(bool(row["deterministic_id_ascending_match"]) for row in compared), 10)
        self.assertEqual(
            sum(len(str(row["top_score_items"]).split(";")) > 1 for row in compared), 17
        )

    def test_toy43_screenshot_top2_is_score_compatible_but_not_native_evidence(self):
        dataset = FIXTURES / "datasets" / "ratings_uji_collaborative_filtering_43.csv"
        screenshot = FIXTURES / "references" / "altair_reference_top2_43_SCREENSHOT_TRANSCRIPTION.csv"
        interactions, users, items, row_count = read_training(dataset)
        references = read_reference(screenshot)
        rows = diagnose(interactions, users, items, references, k=3, top_n=2)
        compared = [row for row in rows if row["reference_items"]]

        self.assertEqual(row_count, 43)
        self.assertEqual(len(compared), 4)
        self.assertEqual(sum(bool(row["reference_score_compatible"]) for row in compared), 4)
        self.assertEqual(sum(bool(row["deterministic_id_ascending_match"]) for row in compared), 3)
        self.assertEqual(
            sum(int(row["matching_reference_rows_id_ascending"]) for row in compared), 3
        )

    def test_checked_in_reports_reproduce_from_diagnostic(self):
        cases = (
            (
                "foodrec_offline_train_264.csv",
                "altair_train264_top1.csv",
                "altair_binary_train264_diagnostics.csv",
                1,
            ),
            (
                "ratings_uji_collaborative_filtering_43.csv",
                "altair_reference_top2_43_SCREENSHOT_TRANSCRIPTION.csv",
                "altair_binary_toy43_diagnostics.csv",
                2,
            ),
        )
        with tempfile.TemporaryDirectory() as directory:
            for dataset_name, reference_name, report_name, top_n in cases:
                interactions, users, items, _ = read_training(
                    FIXTURES / "datasets" / dataset_name
                )
                references = read_reference(FIXTURES / "references" / reference_name)
                rows = diagnose(
                    interactions, users, items, references, k=3, top_n=top_n
                )
                generated = Path(directory) / report_name
                write_report(generated, rows)
                self.assertEqual(
                    generated.read_bytes(),
                    (FIXTURES / "reports" / report_name).read_bytes(),
                )


if __name__ == "__main__":
    unittest.main()
