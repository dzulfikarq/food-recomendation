# Food.com catalog import

## Scope and rights

Food.com RAW files remain local. Kaggle currently labels files `Data files © Original Authors`; research/commercial use and redistribution permission remain unverified. The import path is restricted to a PostgreSQL database ending in `_test`, requires an explicit `--apply`, and does not publish data. Do not commit RAW files or generated catalog/rating exports.

## Deterministic application subset

- Source: Kaggle Food.com Recipes and User Interactions, release v2 (2019-11-08).
- Cohort: `user_history`, seed `20261113`, cap 500 users, at least five training ratings per selected user. The existing pipeline hashes IDs after training-only eligibility; it does not use validation/test metrics to select users.
- Catalog: exporter includes only recipes with at least one selected `train.csv` rating. No validation/test rows are imported.
- Ratings: `train.csv` only. Rating 0 is excluded upstream; duplicate explicit pairs follow latest-date/last-source-row policy. Reviews, usernames, email, and other identity fields are not imported.
- IDs: source recipe IDs persist in `Food.sourceId`; original source user IDs persist only in `HistoricalRating.sourceUserId`. The export manifest and catalog import retain source release, checksums, seed, strategy, counts, and rights-review note.
- The 500-user/10,000-recipe/100,000-rating caps and 20 MiB snapshot limit fit existing worker constraints. Jobs cap account targets at `10,000 / Top-N` to stay within existing result-row limit. UBCF neighbor selection compares users pairwise; 500 users means at most about 250,000 user pairs per target before overlap work. These are operational bounds, not a model-quality claim.

Final user/recipe/rating counts come from generated `manifest.json`; do not substitute RAW-wide counts. Export/import both verify SHA-256 checksums.

## Local export/import

Prepare a deterministic cohort with `services/recommender/scripts/foodcom_research.py prepare`, then export metadata and training ratings:

```powershell
python services/recommender/scripts/export_foodcom_catalog.py `
  --prepared-dir 'E:\path\to\prepared-subset' `
  --raw-recipes 'E:\path\to\RAW_recipes.csv' `
  --output-dir 'E:\path\to\new-foodcom-export'
```

After creating a fresh isolated `_test` database and applying migrations:

```powershell
$env:DATABASE_URL = 'postgresql://.../foodrec_foodcom_test'
npm run foodcom:import -- 'E:\path\to\new-foodcom-export' --apply
```

Importer is transactional and idempotent by export-manifest checksum. It activates one Food.com import, deactivates older Food.com catalog entries, preserves unrelated/manual foods, and never deletes catalog or rating rows. Production and existing databases are not migration targets.

## UBCF namespaces and safety

FoodRec account user IDs remain positive. Food.com pseudonymous source user IDs become negative IDs only in worker snapshots; collisions are impossible. Both populations rate the same `Food.id` on the existing 1–5 scale. Historical users can be neighbors but are excluded from `targetUserIds`, result validation, and account recommendations. Recipes already rated by an account are removed from its candidates. Empty/cold-start cases produce no fabricated recommendations.

Snapshots contain only `user_id,food_id,rating`, with no names or emails. Manual Altair batch import/publication validation stays unchanged; only positive FoodRec account IDs can be published, so historical negative-ID outputs are rejected. Worker artifacts remain `UNVERIFIED`; this path does not publish batches, open validation gates, or enable automation.

## Isolated E2E

`npm run test:e2e:foodcom` creates a new database and refuses to reuse or reset an existing one. Set these environment variables to local paths and a previously unused `_test` database URL before running:

- `FOODREC_FOODCOM_E2E_DATABASE_URL`
- `FOODREC_FOODCOM_PREPARED_DIR`
- `FOODREC_RAW_RECIPES`
- `FOODREC_FOODCOM_EXPORT_DIR` (must not exist yet)

The runner seeds only an E2E administrator, imports Food.com data, builds the app, exercises responsive catalog/detail/tag filtering and account rating, exports a namespaced snapshot, runs the real Python worker, and verifies candidate IDs, rated-item exclusion, and unpublished `UNVERIFIED` artifact state. It keeps the new database and local artifacts for review; no reset or delete occurs.
