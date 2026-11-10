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

## Procedure for OpenCode / Phase B
1. Keep current job processing/automation OFF. Do not run migrations, reset database, or import recommendations to live FoodRec.
2. Inspect existing Python engine's similarity definition, normalization, missing-value handling, neighbors, prediction weighting and ranking/tie-breaking, and compare them with actual Altair operator settings/documentation. `Weighted Knn=false` does not establish the full mathematical formula or exact ranking policy.
3. Run the **43-rating fixture** through Python with k=3, intended Top-2. Export `(user_id,item_id,rank)` in stable order. Compare row sets **and order per user** with `altair_reference_top2_43_SCREENSHOT_TRANSCRIPTION.csv`. A difference should be logged, not patched by guessing.
4. Run the **264-rating training fixture** with k=3, intended Top-1, and compare with the screenshot-transcribed 22 reference rows. The exact Altair workflow responsible was not uploaded in full; record the limitation.
5. For MAE/RMSE, run a SEPARATE rating-prediction workflow that trains on 264 and predicts 66 held-out observations. Do not derive MAE/RMSE from Top-N ranks.
6. Assert test set pairs are disjoint from training set; check that no recommended items are already rated in the specific input used for prediction; check stable user IDs and food IDs, candidate counts, cold-start and no-candidate cases.
7. Report an exact comparison table (case, input checksum, settings, Python output, available Altair reference, row mismatches, unresolved mathematical differences). Do not claim parity solely on matching screenshot ranks.
8. If the engine cannot match because Altair scoring semantics are unknown, mark `PARTIAL OUTPUT MATCH` or `PENDING VALIDATION`, and request genuine Altair exported CSV and/or score breakdown for rigorous parity.
9. Preserve all prior work, tests and unrelated local changes. Make small atomic commits after meaningful verified units. No push without user request.

## Limitations
- References are **visually transcribed** output, not signed exported files. User-provided screenshot observations only; not reproducible machine evidence.
- 879 source set is highly dense (879/880 possible ratings) and may be synthetic/test data; source provenance not established.
- Altair model internals, preprocessing, item recommendation score, and custom feature settings still require confirmation. Exact numerical equivalence is unproven.
- The training 264 workflow screenshot shows the source and a User k-NN operator, but not all later operators. Reference is thus conditional.
- Ranking similarity and rating-prediction accuracy are separate evaluations.
