# Food.com preprocessing specification

Pipeline: `services/recommender/scripts/foodcom_research.py`. Uses Python standard library and the existing Python engine only for evaluation. It does not change production code, databases, catalog, jobs, or validation gates.

## Inputs and validation

Use `RAW_interactions.csv` and `RAW_recipes.csv` from one verified release. The `prepare` command:

- Requires source columns `user_id,recipe_id,date,rating` and recipe column `id`.
- Requires canonical positive decimal source IDs, strict `YYYY-MM-DD` dates, and integer ratings 0–5. Rejects malformed/missing required values, duplicate recipe IDs, and interactions pointing to absent recipes. It does not silently coerce or drop malformed rows.
- Counts empty/missing cells and affected rows by column across both raw files. Missing required values fail preprocessing; missing optional review/recipe metadata is reported, not imputed.
- Computes SHA-256 for both source files; records their names, hashes, row counts, release label, rights-review reference, and generated-artifact hashes/counts in `manifest.json`.
- Ignores rating-zero rows as non-ratings. For duplicate explicit `(user_id,recipe_id)` pairs, retains latest date; same-date ties retain last source row. Counts removed duplicate explicit rows. Zero rows are discarded before duplicate resolution, so zero cannot erase a valid explicit rating.
- Does not use review text, recipe descriptions, or other metadata as model features.

## Subset and ID mapping

Select up to `--user-limit` users by ascending SHA-256 rank of source user ID among users with at least one explicit rating; do not filter the sample by full-history interaction count or rating value. Items are all recipes rated by selected users; there is no item-based test-score filtering. Users with fewer than three explicit pairs stay in training only because they cannot contribute one pair to each partition. Thus validation/test metrics cover sampled users with enough history, but test interactions do not determine which users enter the subset.

Canonical user/item IDs are dense positive integers assigned in ascending source-ID order. `user_id_map.csv` and `item_id_map.csv` preserve exact Food.com IDs. `canonical.csv` has only `user_id,item_id,rating`; canonical rating values remain 1–5. These IDs are research-local and never map to production `Food.id`.

## Split, leakage, and reproducibility

For each sampled user with at least three pairs, SHA-256 ranks source recipe IDs using the recorded seed. Assign approximately 80% to train, 10% to validation, remainder to test, guaranteeing at least one row in each split. Users with one or two pairs are assigned entirely to train. Split pair sets are disjoint. The `evaluate` command rechecks split checksums, rating schema, training-user presence, and pair leakage before scoring.

Manifest records seed, eligibility/subset rule, split rule, source checksums, source row counts, rating-zero count, duplicate count, full-data and subset user/item/pair/rating counts, density/sparsity, split row counts, output SHA-256 values, Python/SQLite versions, and pipeline SHA-256. The deterministic hash ranking avoids dependence on Python's `random` implementation version. Identical source files, arguments, pipeline, and runtime produce byte-identical artifacts and manifest.

`canonical.csv` contains selected subset only. Full-source aggregate counts and per-column missing-value counts are computed after explicit-rating deduplication if and only if `prepare` successfully processes the actual files. Actual local exploratory counts are documented in [`EXPERIMENT_RESULTS.md`](EXPERIMENT_RESULTS.md); the manifest remains the machine-readable record.

## Checks and execution

Small fixtures exercise deterministic outputs, zero and duplicate handling, source mapping, pairwise split isolation, checksum detection, invalid-row rejection, and end-to-end evaluator output:

```powershell
cd services/recommender
python -m unittest discover -s tests -p "test_foodcom_research.py"
```

Prepare and evaluate only after selecting documented seed, user cap, release, rights reference, candidate `k`, and minimum overlap. Example evaluation (candidate set is provisional, not approved final parameters):

```powershell
python scripts/foodcom_research.py evaluate `
  --data-dir C:\foodrec-research\foodcom\prepared `
  --output-dir C:\foodrec-research\foodcom\evaluation `
  --ks 1 3 5 10 `
  --min-common 1
```

Outputs include `evaluation.json` and row-level `test_predictions.csv`. Keep these local and outside Git. Do not create `EXPERIMENT_RESULTS.md` until an authorized run on verified full RAW files completes.
