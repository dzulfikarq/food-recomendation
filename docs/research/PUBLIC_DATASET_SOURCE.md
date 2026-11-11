# Food.com public dataset source audit

## Source and publication

- Dataset page: [Food.com Recipes and User Interactions](https://www.kaggle.com/datasets/shuyangli94/food-com-recipes-and-user-interactions)
- Publisher's paper: Bodhisattwa Prasad Majumder, Shuyang Li, Jianmo Ni, and Julian McAuley. “Generating Personalized Recipes from Historical User Preferences.” *EMNLP-IJCNLP 2019*, pp. 5976–5982. [ACL Anthology D19-1613](https://aclanthology.org/D19-1613/), DOI `10.18653/v1/D19-1613`.
- Related record: [BERD@NFDI, Food.com Recipes and Interactions](https://berd-platform.de/records/dmajj-zp851), published 2019, version v2. Record describes 180K+ recipes, 700K+ reviews, dates 2000-02-25–2018-12-18, and a 0.89 GB dataset.

Kaggle's dataset API reported total size `892407202` bytes, `currentVersionNumber=2`, `lastUpdated=2019-11-08`, and license label **“Data files © Original Authors”** when checked on 2026-11-12. This label is not an explicit open-data license. Permission for research use and redistribution of raw or derived data remains unverified. Local exploratory processing was performed at the user's request; this does not establish permission for thesis publication, production use, or redistribution. Obtain institutional/advisor approval and, if needed, permission from rights holders before those uses. Do not redistribute source rows or derived rating data without authorization.

## Access and release integrity

The user supplied `RAW_interactions.csv`, `RAW_recipes.csv`, and `archive.zip` under `E:\Kuliah\TA\Yusfan\Dataset`. Both RAW files occur in that same archive. Their uncompressed sizes and SHA-256 hashes match the extracted files byte-for-byte:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `archive.zip` | 280,350,373 | `e7a43e623c616799f78a0479b550483450fd7ede4e0c40979db3458a82b5b913` |
| `RAW_interactions.csv` | 349,436,524 | `4e278d2f687b1020f5694e51003a7d6174344b51aebbdf4530de88b5c6a78ee4` |
| `RAW_recipes.csv` | 294,520,189 | `6a8136d1da9e03396a9f52d72200b3fddb8fe103f11e1496effca30ac4e0539f` |

The Kaggle API metadata identifies current version 2 and the archive's member timestamps are 2019-11-08. The archive contains no embedded Kaggle release manifest, so evidence confirms that both files came from the same local archive and match its entries; linkage of that archive to Kaggle version 2 relies on the supplied download provenance and matching metadata/date, not a signed release manifest. Kaggle CLI/authentication were not used by this agent. The earlier unauthenticated endpoint probe returned HTTP 404 and does not establish authenticated access status.

Full-source row counts, schema, missing values, rating distribution, and exploratory metrics are now measured from these local RAW files. See [`EXPERIMENT_RESULTS.md`](EXPERIMENT_RESULTS.md); these measurements are not Kaggle page-summary counts. The 100-line BERD sample remains evidence only for the interpretation of rating zero, not for its full-source frequency.

### Manual download

1. Resolve research-use rights with the advisor/institution or data rights holder before thesis/final use or sharing. Local exploratory processing does not resolve rights. Do not place API tokens in this repository or share them with the pipeline.
2. Sign in to Kaggle, review/accept dataset access terms, and download both `RAW_interactions.csv` and `RAW_recipes.csv` from the **same** dataset release. If Kaggle requires an account or approval, complete that in the browser.
3. Keep source files read-only and outside Git, for example `C:\foodrec-research\foodcom\`. Record the release/version label shown by Kaggle; do not infer one from a filename.
4. For confirmatory use, run preprocessing only after rights review is complete. `--rights-review` records a reference; it is not a legal authorization check. Example command (replace paths, release label, seed, and sample cap with approved values):

```powershell
python services/recommender/scripts/foodcom_research.py prepare `
  --interactions C:\foodrec-research\foodcom\RAW_interactions.csv `
  --recipes C:\foodrec-research\foodcom\RAW_recipes.csv `
  --output-dir C:\foodrec-research\foodcom\prepared `
  --source-version "verified-release-label" `
  --rights-review "institutional-approval-or-permission-reference" `
  --seed 12345 `
  --user-limit 1000
```

The seed and user cap above are syntax examples only; agree on actual study values before running.

The script refuses an existing output directory. It never imports data into FoodRec's database or production catalog. Source data, prepared files, and experiment outputs stay local and outside Git.

## Schema and rating semantics

The full interaction file uses `user_id,recipe_id,date,rating,review`; recipe rows use `name,id,minutes,contributor_id,submitted,tags,nutrition,n_steps,steps,description,ingredients,n_ingredients`. Pipeline validated these headers and required fields; measured missing-value counts are in [`EXPERIMENT_RESULTS.md`](EXPERIMENT_RESULTS.md).

A BERD 100-line interaction sample contains a `rating=0` row whose review says “I will not rate.” Treat `0` as no explicit rating, not as rating `1`, and exclude it from explicit-rating modeling. This sample confirms that zero occurs; it does **not** establish its frequency in the full release. Pipeline accepts only integer ratings 0–5, rejects other values, and reports zero rows separately.

Food.com `recipe_id` identifies a recipe, not one of FoodRec's 40 `Food.id` catalog entries. Canonical IDs and mappings in this research workflow are isolated files; no silent mapping or production import is permitted. Findings describe Food.com review behavior and do not directly generalize to FoodRec users or its food catalog.

## Current status

- Source and paper identity: documented.
- Full RAW files: locally present; both RAW entries verified against one archive and checksummed. Kaggle release linkage is based on supplied provenance and metadata, not embedded release manifest.
- Research-use permission: unresolved; no open license established.
- Full-source statistics and local exploratory run: recorded in [`EXPERIMENT_RESULTS.md`](EXPERIMENT_RESULTS.md). No final/approved thesis result is claimed.
- Python explicit-rating engine and Altair parity: separate questions. This dataset workflow does not claim mathematical parity with Altair's Item Recommendation operator; see [`ALTAIR_PYTHON_PARITY_INVESTIGATION.md`](../ALTAIR_PYTHON_PARITY_INVESTIGATION.md).
