import csv
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "compare_altair.py"


class CompareAltairTests(unittest.TestCase):
    def run_comparison(self, directory, altair_rows, *extra_args):
        dataset = directory / "ratings.csv"
        altair = directory / "altair.csv"
        dataset.write_text(
            "user_id,food_id,rating\n1,10,5\n1,11,3\n2,10,5\n2,11,4\n2,12,5\n",
            encoding="utf-8",
        )
        altair.write_text(altair_rows, encoding="utf-8")
        return subprocess.run(
            [sys.executable, str(SCRIPT), "--dataset", str(dataset), "--altair", str(altair), "--top-n", "1", *extra_args],
            capture_output=True,
            text=True,
            check=False,
        )

    def test_matching_rank_and_python_export(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            python_output = directory / "python.csv"
            result = self.run_comparison(directory, "user_id,item_id,rank\n1,12,1\n", "--python-output", str(python_output))

            self.assertEqual(result.returncode, 0, result.stderr)
            rows = list(csv.DictReader(result.stdout.splitlines()))
            self.assertEqual(rows, [{"user_id": "1", "item_id": "12", "python_rank": "1", "altair_rank": "1", "status": "MATCH"}])
            self.assertEqual(python_output.read_text(encoding="utf-8").splitlines(), ["user_id,item_id,rank", "1,12,1"])

    def test_reports_rank_mismatch_and_altair_only_item_per_user(self):
        with tempfile.TemporaryDirectory() as temp:
            result = self.run_comparison(
                Path(temp),
                "user_id,item_id,rank\n1,12,2\n2,13,1\n",
            )

            self.assertEqual(result.returncode, 1)
            rows = list(csv.DictReader(result.stdout.splitlines()))
            self.assertEqual(
                rows,
                [
                    {"user_id": "1", "item_id": "12", "python_rank": "1", "altair_rank": "2", "status": "RANK_MISMATCH"},
                    {"user_id": "2", "item_id": "13", "python_rank": "", "altair_rank": "1", "status": "ALTAIR_ONLY"},
                ],
            )


if __name__ == "__main__":
    unittest.main()
