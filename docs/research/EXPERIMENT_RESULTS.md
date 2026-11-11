# Food.com exploratory experiment results

**Status: local exploratory run only. Not final, advisor-approved, or suitable for an unqualified thesis claim.** Kaggle's license label is “Data files © Original Authors”; research-use and redistribution permissions remain unverified. No raw rows, mappings, prepared dataset, or row-level predictions are committed here.

Run date: 2026-11-12. Python `3.15.1`, SQLite `3.53.4`. Exact pipeline SHA-256: `e5331d3c899638ca3e7eae1bcbb47983f54cfe37a934f0d5a648a265dc9245a5`. Production engine, database, Food catalog, Altair workflow, validation gate, and automatic processing/publication were not changed.

## Source verification and rights

Kaggle metadata reported dataset current version 2, updated `2019-11-08`, total size `892407202` bytes, and license **“Data files © Original Authors”**. This does not specify an open license or establish research/redistribution rights. The user supplied an archive and extracted RAW files. Both RAW files were members of the same local `archive.zip`; their SHA-256 hashes match the extracted files byte-for-byte. Archive has no embedded Kaggle release manifest, so connection to Kaggle version 2 rests on supplied download provenance and matching metadata/date, not a signed release record.

| Source file | Bytes | SHA-256 |
| --- | ---: | --- |
| `archive.zip` | 280,350,373 | `e7a43e623c616799f78a0479b550483450fd7ede4e0c40979db3458a82b5b913` |
| `RAW_interactions.csv` | 349,436,524 | `4e278d2f687b1020f5694e51003a7d6174344b51aebbdf4530de88b5c6a78ee4` |
| `RAW_recipes.csv` | 294,520,189 | `6a8136d1da9e03396a9f52d72200b3fddb8fe103f11e1496effca30ac4e0539f` |

Kaggle API metadata: [dataset page](https://www.kaggle.com/datasets/shuyangli94/food-com-recipes-and-user-interactions). Paper: Majumder et al., “Generating Personalized Recipes from Historical User Preferences,” EMNLP-IJCNLP 2019, [D19-1613](https://aclanthology.org/D19-1613/), DOI `10.18653/v1/D19-1613`.

## Full-source validation

The pipeline accepted these headers:

- Interactions: `user_id,recipe_id,date,rating,review`
- Recipes: `name,id,minutes,contributor_id,submitted,tags,nutrition,n_steps,steps,description,ingredients,n_ingredients`

No missing/invalid required IDs, dates, ratings, duplicate recipe IDs, or interaction references to absent recipe IDs were found; otherwise preprocessing would have stopped. Empty optional values were counted, not imputed:

| File / column | Empty cells / affected rows |
| --- | ---: |
| Interactions `review` | 168 |
| Recipes `description` | 4,982 |
| Recipes `name` | 1 |
| All other listed columns | 0 |

There were `1,132,367` interaction rows and `231,637` recipe rows. `60,847` interaction rows had rating 0 and were excluded as non-ratings; source sample review text says “I will not rate.” No 0 was converted to 1. Among remaining explicit ratings, duplicate `(user_id,recipe_id)` rows removed: `0`.

| Rating | Explicit pairs |
| ---: | ---: |
| 1 | 12,818 |
| 2 | 14,123 |
| 3 | 40,855 |
| 4 | 187,360 |
| 5 | 816,364 |
| **Total** | **1,071,520** |

After zero exclusion and explicit-pair deduplication: `196,098` users, `226,590` interacted recipes, `1,071,520` pairs. Density `0.0024115%`; sparsity `99.9975885%`. Rating distribution is highly skewed toward 5. These counts describe Food.com RAW files, not FoodRec's 40-food catalog.

## Subset and split

Exploratory configuration was fixed before evaluation: seed `20261112`, cap `5,000` users. Select users by deterministic SHA-256 rank of source user ID among users with at least one explicit rating; no full-history count or rating-value filter determines subset membership. Include every selected user's explicit pairs. Users with fewer than three pairs remain in train only because they cannot populate all three splits. Thus all 5,000 sampled users occur in train; `868` have validation and test rows. This evaluated cohort still favors users with enough history and does not represent all Food.com users.

| Subset measure | Value |
| --- | ---: |
| Users | 5,000 |
| Recipes | 21,138 |
| Explicit pairs | 27,364 |
| Density | 0.0258908% |
| Sparsity | 99.9741092% |

Per-user SHA-256 split, approximately 80/10/10 where each user has at least three pairs; users with one or two pairs are train-only:

| Split | Rows | Users |
| --- | ---: | ---: |
| Train | 22,100 | 5,000 |
| Validation | 2,463 | 868 |
| Test | 2,801 | 868 |
| **Total** | **27,364** | — |

Pair overlap across splits: `0`. Evaluator verified artifact checksums, schema, training-user presence, and pairwise split disjointness before scoring. Validation selected `k`; test was scored afterward. Test was not used to select subset membership or parameters. This test fold is now viewed and is no longer blind for later protocol changes.

## Validation: k selection and baselines

Method: existing Python UBCF engine, explicit raw-rating cosine over co-rated recipes, positive neighbors only, minimum common ratings `m=1`; prediction is similarity-weighted mean. Candidates `k={1,3,5,10}`. Selection rule: lowest validation MAE among candidates with at least one prediction; ties choose smaller `k`. No minimum coverage threshold was approved or enforced.

| Method | Predicted / total | Coverage | MAE | RMSE |
| --- | ---: | ---: | ---: | ---: |
| UBCF `k=1` | 8 / 2,463 | 0.3248% | **0.375000** | **0.612372** |
| UBCF `k=3` | 26 / 2,463 | 1.0556% | 0.384615 | 0.679366 |
| UBCF `k=5` | 34 / 2,463 | 1.3804% | 0.470588 | 0.766965 |
| UBCF `k=10` | 54 / 2,463 | 2.1924% | 0.481481 | 0.793492 |
| Global mean | 2,463 / 2,463 | 100.0000% | 0.519066 | 0.679662 |
| User mean | 2,463 / 2,463 | 100.0000% | 0.416818 | 0.666189 |
| Item mean | 754 / 2,463 | 30.6131% | 0.450138 | 0.819783 |

Selected `k=1` by validation MAE, based on only **8 predictions** (0.3248% coverage). This is too little evidence for a reliable parameter choice. The very low-coverage candidate can appear favorable because error is computed only where prediction exists.

## Final test evaluation

After validation selected `k=1`, engine refit on train plus validation and evaluated test once:

| Method | Predicted / total | Missing | Coverage | MAE | RMSE |
| --- | ---: | ---: | ---: | ---: | ---: |
| UBCF `k=1` | 15 / 2,801 | 2,786 | 0.5355% | 0.400000 | 0.730297 |
| Global mean | 2,801 / 2,801 | 0 | 100.0000% | 0.528306 | 0.695945 |
| User mean | 2,801 / 2,801 | 0 | 100.0000% | **0.424132** | **0.655186** |
| Item mean | 904 / 2,801 | 1,897 | 32.2742% | 0.484019 | 0.862213 |

UBCF missing reasons: `144` cases had no eligible positive-similarity neighbor; `2,642` had selected neighbors but none rated the target recipe.

For direct comparison on the same `15` test pairs UBCF predicted:

| Method on UBCF-covered pairs | N | MAE | RMSE |
| --- | ---: | ---: | ---: |
| UBCF `k=1` | 15 | 0.400000 | 0.730297 |
| Global mean | 15 | 0.449896 | 0.550165 |
| User mean | 15 | 0.351517 | 0.565555 |
| Item mean | 15 | **0.348433** | **0.545589** |

UBCF error is based on only 15 cases and has higher MAE than user/item means and worse RMSE than all baselines on this paired slice. Overall coverage is `0.5355%`; this does not support a quality or superiority claim. User mean had full test coverage, but its full-test MAE is not directly comparable to UBCF's conditional MAE because UBCF predicts only 15 cases.

Top-N metrics were not run because no relevance threshold was approved. No Python–Altair mathematical parity is claimed.

## Reproduction and artifact integrity

Outputs remained outside Git under `E:\Kuliah\TA\Yusfan\Dataset`:

- Prepared data: `foodrec_research_prepared_v2_seed20261112_users5000_idsample`
- Evaluation: `foodrec_research_evaluation_v2_seed20261112_users5000_idsample`
- Prepared manifest SHA-256: `d8e2a46d307ec894ae7839dddfe0ac47dabb9db7b968ed11251385c92dce1248`
- Evaluation JSON SHA-256: `e631ce5b477b7a93e9fd6c4bd9a5e1b13cb5c035d25a89c476e9c03cdbd836d6`
- `test_predictions.csv` SHA-256: `872bb9f05bc3513bfbcd779141f742cae19d84dc4f27434fb29e23458724089c`
- Canonical, split, and ID-map checksums are recorded in the manifest.

Earlier output folders with `users5000` but without `_idsample` used a superseded full-history `>=3` user filter. They remain outside Git but are **not** the run reported here and should not be cited.

Run from repository root using fresh output paths; the script refuses existing output directories:

```powershell
python services/recommender/scripts/foodcom_research.py prepare `
  --interactions "E:\Kuliah\TA\Yusfan\Dataset\RAW_interactions.csv" `
  --recipes "E:\Kuliah\TA\Yusfan\Dataset\RAW_recipes.csv" `
  --output-dir "E:\Kuliah\TA\Yusfan\Dataset\foodrec_research_prepared_v2_seed20261112_users5000_repro" `
  --source-version "Kaggle current version 2; lastUpdated 2019-11-08; RAW entries verified in local archive.zip" `
  --rights-review "Unverified: Kaggle label Data files © Original Authors; exploratory local-only run; no redistribution" `
  --seed 20261112 `
  --user-limit 5000

python services/recommender/scripts/foodcom_research.py evaluate `
  --data-dir "E:\Kuliah\TA\Yusfan\Dataset\foodrec_research_prepared_v2_seed20261112_users5000_repro" `
  --output-dir "E:\Kuliah\TA\Yusfan\Dataset\foodrec_research_evaluation_v2_seed20261112_users5000_repro" `
  --ks 1 3 5 10 `
  --min-common 1
```

## Limitations and thesis-use gate

1. **Rights:** license label is not an open license. Get written institutional/advisor guidance and rights-holder permission if required before thesis publication, production use, or sharing raw/derived rows. Local exploratory processing does not resolve this.
2. **Coverage:** UBCF covers below 1% of validation and test pairs. No coverage acceptance threshold was prespecified; validation MAE alone selected `k=1` from eight predictions.
3. **Holdout status:** test results have been inspected. Do not reuse this split as blind after changing thresholds, subset, or model. Confirmatory work needs a new preregistered independent holdout/dataset or an advisor-approved design accounting for this exploratory exposure.
4. **Sampling:** seeded 5,000-user ID sample; users with fewer than three pairs stay train-only, so validation/test estimate applies to the 868 users with enough history. Results may change with another sample seed or cap.
5. **Protocol:** one split only; no repeats, confidence intervals, nested CV, temporal evaluation, or Top-N. Ratings are ordinal, while raw cosine/MAE/RMSE treat them numerically.
6. **Generalization:** recipes and Food.com users differ from FoodRec's 40 foods and app users. No production recommendation quality or Altair parity follows from this run.

Before using any number as a thesis finding: resolve data rights; approve sampling, rating-zero semantics, split, `k` selection, and minimum coverage with the advisor; define a fresh confirmatory evaluation; preserve raw files locally and do not add them or row-level outputs to Git.
