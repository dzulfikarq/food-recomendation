# Food.com public dataset source audit

## Source and publication

- Dataset page: [Food.com Recipes and User Interactions](https://www.kaggle.com/datasets/shuyangli94/food-com-recipes-and-user-interactions)
- Publisher's paper: Bodhisattwa Prasad Majumder, Shuyang Li, Jianmo Ni, and Julian McAuley. “Generating Personalized Recipes from Historical User Preferences.” *EMNLP-IJCNLP 2019*, pp. 5976–5982. [ACL Anthology D19-1613](https://aclanthology.org/D19-1613/), DOI `10.18653/v1/D19-1613`.
- Related record: [BERD@NFDI, Food.com Recipes and Interactions](https://berd-platform.de/records/dmajj-zp851), published 2019, version v2. Record describes 180K+ recipes, 700K+ reviews, dates 2000-02-25–2018-12-18, and a 0.89 GB dataset.

Kaggle's dataset API reported total size `892407202` bytes and license label **“Data files © Original Authors”** when checked on 2026-11-12. This label is not an explicit open-data license. Permission for research use and redistribution of raw or derived data remains unverified. Obtain institutional/advisor approval and, if needed, permission from rights holders before processing or sharing. Do not redistribute source rows or derived rating data without authorization.

## Access and release integrity

Full `RAW_interactions.csv` and `RAW_recipes.csv` were not downloaded or checksum-verified in this environment. Kaggle CLI, local Kaggle config, and Kaggle credential environment variables were absent. An unauthenticated download-endpoint probe returned HTTP 404; that does not establish whether an authenticated download will succeed. The BERD record currently exposes 100-line sample files, not the full RAW files.

Therefore, this repository has **no verified full-release row counts, checksums, rating distribution, or experiment results**. Do not cite the BERD sample or Kaggle's summary counts as measurements from the local RAW files. Record the exact source release/version and both file SHA-256 values after obtaining the pair from one release.

### Manual download

1. Resolve research-use rights with the advisor/institution or data rights holder. Do not place API tokens in this repository or share them with the pipeline.
2. Sign in to Kaggle, review/accept dataset access terms, and download both `RAW_interactions.csv` and `RAW_recipes.csv` from the **same** dataset release. If Kaggle requires an account or approval, complete that in the browser.
3. Keep source files read-only and outside Git, for example `C:\foodrec-research\foodcom\`. Record the release/version label shown by Kaggle; do not infer one from a filename.
4. Run preprocessing only after rights review is recorded. Example command (replace paths, release label, seed, and sample cap with approved values):

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

The sampled interaction file uses `user_id,recipe_id,date,rating,review`; recipe rows use `name,id,minutes,contributor_id,submitted,tags,nutrition,n_steps,steps,description,ingredients,n_ingredients`. The full files still need direct schema validation by the pipeline.

A BERD 100-line interaction sample contains a `rating=0` row whose review says “I will not rate.” Treat `0` as no explicit rating, not as rating `1`, and exclude it from explicit-rating modeling. This sample confirms that zero occurs; it does **not** establish its frequency in the full release. Pipeline accepts only integer ratings 0–5, rejects other values, and reports zero rows separately.

Food.com `recipe_id` identifies a recipe, not one of FoodRec's 40 `Food.id` catalog entries. Canonical IDs and mappings in this research workflow are isolated files; no silent mapping or production import is permitted. Findings describe Food.com review behavior and do not directly generalize to FoodRec users or its food catalog.

## Current status

- Source and paper identity: documented.
- Full RAW files and same-release pairing: pending local acquisition and checksum verification.
- Research-use permission: unresolved; no open license established.
- Full-source statistics, preprocessing output, and experimental claims: none yet.
- Python explicit-rating engine and Altair parity: separate questions. This dataset workflow does not claim mathematical parity with Altair's Item Recommendation operator; see [`ALTAIR_PYTHON_PARITY_INVESTIGATION.md`](../ALTAIR_PYTHON_PARITY_INVESTIGATION.md).
