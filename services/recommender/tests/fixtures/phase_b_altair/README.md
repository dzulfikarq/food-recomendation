# FoodRec — Phase B Altair comparison package

This bundle packages earlier user-provided FoodRec CSV and XML, plus **manual transcriptions of user-provided screenshots** for comparison. It does **not** establish algorithm parity.

## Contents
- `datasets/ratings_uji_collaborative_filtering_43.csv` — 43 rating toy/fixture input (8 users; 6 foods). **Not real research results**.
- `workflows/FoodRec_Top2_Fixed.xml` — operator `User k-NN` with k=3, Weighted Knn=false, two Apply Model branches n=1/n=2. It retrieves `//Local Repository/data/ratings_uji_collaborative_filtering`. This is not a self-contained run: the repository entry must exist in Altair.
- `references/altair_reference_top2_43_SCREENSHOT_TRANSCRIPTION.csv` — 5 rows copied from screenshot `screenshots/altair_43ratings_top2.png` (Oct 24). Transcription; no exported original CSV or similarity scores.
- `datasets/foodrec_offline_train_264.csv` — offline-sampled training set, 12 ratings per 22 users. See sampling guide. The original ratings' real-vs-synthetic provenance is not verified.
- `references/altair_reference_top1_train264_SCREENSHOT_TRANSCRIPTION.csv` — 22 rows manually transcribed from `screenshots/altair_train264_top1.png` (Oct 26). Assumed associated with training-264 run based on the screenshots shown together; original Altair exported output and full process settings **not** provided. All rank=1.
- `datasets/foodrec_offline_test_66.csv` — held-out evaluation rows, disjoint from train; *not* a ready MAE/RMSE ground truth without a rating prediction workflow.
- `datasets/foodrec_snapshot_879.csv` — source export used for offline split. **Do not load or overwrite existing application database with it**.
- `workflows/test2_snapshot879.xml` and `workflows/FoodRec_879Rating_EmptyBranch_Fix.xml` — prior 879-snapshot workflows; latest XML is modified to bypass empty Top-2 branch but has not been validated here by running Altair.

## Manual Altair experiment

Run offline only. Keep auto-processing and publication **OFF**; do not connect this workflow to FoodRec or import its results into any application database.

1. Import `datasets/ratings_uji_collaborative_filtering_43.csv` into Altair Local Repository. Verify 43 rating rows, integer ID columns, and numeric `rating`; do not filter, normalize, or split. Open `workflows/FoodRec_Top2_Fixed.xml`; point Retrieve at that imported file. The XML records `rating` as label, `user_id` as user identification, `food_id` as item identification, `User k-NN: k=3, Weighted Knn=false`, and Apply Model IR `n=1/2`, `Online updates=false`. XML is not self-contained; retrieve path must resolve.
2. Run and export the **native result** to `$out\altair_43_top2.csv` as UTF-8 CSV with `user_id,item_id,rank` headers. The saved XML appends `n=1` and `n=2` branches; export raw output unchanged and state what `n` means in this extension. Do not copy rows from screenshots or deduplicate/re-rank results.
3. For train-264, import only `datasets/foodrec_offline_train_264.csv`; verify 264 rows and same column types, without another split. Copy the 43 workflow, change Retrieve to this file, retain same role mapping and k-NN settings, and export the `n=1` Apply Model result to `$out\altair_train264_top1.csv` using same UTF-8/header settings. No complete train-264 workflow was supplied. Do not use the 879-row workflows.
4. Save the exact workflow used as XML/`.rmp`, plus native CSV. Record Altair/Studio build, recommender extension name/version, input SHA-256, data types, all operator settings (including defaults), and any preprocessing/filtering.
5. Record unresolved extension semantics: similarity metric and normalization; missing-rating/overlap handling and minimum co-ratings; neighbor eligibility, weighting and tie-breaking; candidate universe and rated-item filtering; prediction/ranking score and tie behavior; cold-start/no-neighbor behavior. `Weighted Knn=false` alone does not answer these. Export selected neighbor IDs, similarities, overlap counts and per-candidate scores/predictions if Altair exposes them; otherwise state that they are unavailable.

### Compare native CSV to Python

Run from repository root. Python baseline defaults are `k=3`, `top-n` below, `min-common-ratings=1`, cosine on overlap-only ratings. Those are Python settings, **not proven Altair equivalents**. Set options only when Altair evidence establishes corresponding semantics.

```powershell
$out = Join-Path $env:TEMP "foodrec-altair"
New-Item -ItemType Directory -Force -Path $out | Out-Null

python services/recommender/scripts/compare_altair.py `
  --dataset services/recommender/tests/fixtures/phase_b_altair/datasets/ratings_uji_collaborative_filtering_43.csv `
  --altair "$out\altair_43_top2.csv" --k 3 --top-n 2 `
  --python-output "$out\python_43_top2.csv" > "$out\comparison_43_top2.csv"

python services/recommender/scripts/compare_altair.py `
  --dataset services/recommender/tests/fixtures/phase_b_altair/datasets/foodrec_offline_train_264.csv `
  --altair "$out\altair_train264_top1.csv" --k 3 --top-n 1 `
  --python-output "$out\python_train264_top1.csv" > "$out\comparison_train264_top1.csv"
```

Comparison CSV lists each user/item/rank with `MATCH`, `RANK_MISMATCH`, `PYTHON_ONLY`, or `ALTAIR_ONLY`. Exit 0 means rank rows match; exit 1 means differences; exit 2 means invalid/empty input. Keep output files outside Git. A matching ranking is **not mathematical parity** without matching neighbor/score evidence and resolved settings.

### Evidence to return

- Native Altair CSVs for both datasets, unedited, with headers and every output row.
- Exact XML/`.rmp` for each run, plus Altair and extension versions.
- Input checksums, role/data-type mapping, all operator settings/defaults, candidate/filter logic, and any warnings.
- Neighbor/similarity/overlap and candidate score/prediction breakdowns, if available.
- Both Python CSVs and comparison CSVs; report exit codes and unresolved parameter semantics.
- For separate MAE/RMSE work, train on 264 and predict the disjoint 66-row holdout. Do not infer rating error from Top-N ranks.

## Limitations
- References are **visually transcribed** output, not original Altair exports. They are not reproducible machine evidence.
- 879 source set is highly dense (879/880 possible ratings) and may be synthetic/test data; source provenance not established.
- Altair model internals, preprocessing, item recommendation score, and custom feature settings still require confirmation. Exact mathematical equivalence is unproven.
- The train-264 screenshot shows the source and a User k-NN operator, but not a complete workflow. Its transcribed reference is conditional.
- Ranking similarity and rating-prediction accuracy are separate evaluations.
