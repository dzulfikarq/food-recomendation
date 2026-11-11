# Recommendation Engine Validation

## Status: Pending Validation

Python core implements explicit UBCF baselines and Phase C worker runs it through authenticated staging jobs. It does not feed the website recommendation page or publication path. Phase B package provides one 43-rating workflow XML and two screenshot transcriptions, but no genuine Altair CSV exports or score/neighbor breakdown. The 43-rating input is a toy fixture. The 264-rating screenshot is only conditionally associated with that training set. Matching one transcribed ranking does not prove mathematical parity. Automatic processing remains **OFF**.

## Current baseline

- Algorithm: user-based k-nearest neighbors with cosine similarity.
- Similarity strategy: `overlap` by default; vectors contain only foods both users rated. Optional `zero_filled` compares union of food IDs and treats missing ratings as zero.
- Minimum common ratings: configurable; fixture uses 2. Value 1 is only a code-level baseline, not a research parameter.
- Neighbor selection: exclude target user; retain positive similarities meeting minimum overlap; sort by similarity descending, then user ID ascending; take `kNeighbors`.
- Prediction: raw similarity-weighted neighbor rating, `pred(u,i) = Σ(sim(u,v) × r(v,i)) / Σ(sim(u,v))`, using selected positive-similarity neighbors who rated candidate. No mean-centering, imputation, popularity fallback, or prediction when denominator is zero.
- Candidate eligibility: active food IDs supplied by snapshot caller, excluding every food target user rated in that snapshot.
- Top-N: predicted rating descending, then food ID ascending. Candidate IDs are deduplicated before scoring.
- Empty statuses: `COLD_START`, `NO_CANDIDATES`, `NO_NEIGHBORS`, `NO_PREDICTIONS`; successful result is `READY`.
- Initial operational values suggested by product: `kNeighbors=3`, `topN=5`; these are not research findings. Phase C queue worker polls every 2 seconds, but no automatic job enqueue/scheduler exists. Engine functions require k and Top-N explicitly.

## Phase A synthetic unit fixture

Fixture: [`services/recommender/tests/fixtures/synthetic_ratings.csv`](../services/recommender/tests/fixtures/synthetic_ratings.csv). Target user 1 rated food 101 as 5 and food 102 as 1. User 2 rated same foods `[5,1]`; user 3 rated `[1,5]`.

With overlap cosine and minimum overlap 2:

```text
sim(1,2) = (5×5 + 1×1) / (sqrt(5²+1²) × sqrt(5²+1²)) = 1
sim(1,3) = (5×1 + 1×5) / (sqrt(26) × sqrt(26)) = 10/26 = 5/13 ≈ 0.384615
pred(1,103) = (1×5 + (5/13)×1) / (1 + 5/13) = 35/9 ≈ 3.888889
pred(1,104) = (1×4 + (5/13)×5) / (1 + 5/13) = 77/18 ≈ 4.277778
pred(1,105) = 5 (only user 3 rated it; weight cancels)
```

For active foods 101–106, `kNeighbors=2`, `topN=3`, and minimum overlap 2, Python selects users `[2,3]` and returns `(105, 5.0)`, `(104, 4.277778)`, `(103, 3.888889)`. Food 106 has no neighbor rating and receives no prediction. Foods 101 and 102 are excluded because target user already rated them.

## Phase B package and comparison

Extracted fixtures: [`services/recommender/tests/fixtures/phase_b_altair`](../services/recommender/tests/fixtures/phase_b_altair). All 13 manifest payload checksums matched during extraction. Package says 43-row fixture is toy/not real research data. The 264/66 datasets are a seeded (`20261025`) split of an 879-row snapshot; provenance of the source ratings is unverified. Source snapshot SHA-256: `a2cda622ac8702538c3ba0d9c0ae0ad73be9e88c5d3699e3933cd215c2f23337`; 66-row test SHA-256: `a5bf580b2d951864937f7f3803de9df50f7280556f02e5d0d32c38a6945dfaea`. Train has 12 ratings for each of 22 users; test has 3 held-out ratings per user and no duplicate user-food pairs across splits. Original 879 rows were not loaded into any database.

| Case | Input SHA-256 | Settings | Altair transcription | Python output | Status |
| --- | --- | --- | --- | --- | --- |
| 43 ratings / 8 users / 6 foods | `8425899720fd43edb06822fb7f9efb80c47b563490a042bbc2b05ca865f31a53` | Python k=3/Top-2; overlap cosine baseline, min overlap 1. XML declares k=3 and Apply Model n=1/2. | 5 rows | Same 5 rows and order | **MATCHED OUTPUT** |
| Train 264 / 22 users / 40 foods | `19e34a779d3637b12667f4a7c3f4f369c8c901c45513b25f2965811ffa6fa349` | Python k=3/Top-1. Screenshot association with these settings is unconfirmed. | 22 rows, all rank 1 | 22 rows; same user order/rank, 0 item IDs match | **MISMATCH** |

43 output, both reference and Python, ordered by user then rank:

```text
(1,106,1) (1,105,2) (2,106,1) (3,104,1) (5,105,1)
```

Candidate exclusions also agree for 43 fixture. Candidate counts by user are `1:2, 2:1, 3:1, 4:0, 5:1, 6:0, 7:0, 8:0`; all five returned foods are unrated by their target user. Provided XML calculates `remaining_candidates`, routes users with at least two candidates to `Apply Model IR n=2`, and routes users with exactly one to `n=1`. Users 4, 6, 7, and 8 have no candidate.

For train-264, each user has 28 unrated foods out of 40. All 22 screenshot items are candidates under train snapshot; all 22 Python items are also unrated. Python can score 19 screenshot items using its selected neighbors, but those items rank 2–22, never Top-1. Three screenshot items (user/food `(6,6)`, `(19,33)`, `(22,32)`) have no rating from Python's selected top-3 neighbors and receive no prediction. Python Top-1 versus screenshot transcription:

```text
user: Altair→Python
2: 28→13   3: 28→10   4: 33→6    5: 13→2    6: 6→31
7: 40→8    8: 34→19   9: 27→6   10: 13→1   11: 40→2
12: 40→1  13: 36→4   14: 25→10  15: 28→11  16: 23→2
17: 24→1  18: 8→39   19: 33→6   20: 22→1   21: 29→2
22: 32→13 23: 29→4
```

## Mathematical/operator audit

| Detail | Python baseline used in comparisons | Evidence available for Altair | Finding |
| --- | --- | --- | --- |
| Cosine inputs | Raw ratings on co-rated foods (`overlap`); missing ratings omitted. Optional `zero_filled` exists but was not used. | 43 XML identifies `User k-NN`; XML does not serialize similarity strategy or overlap threshold. No similarity values exported. | Exact cosine implementation **unverified**. |
| Neighbors | Positive similarity, minimum common ratings 1, similarity descending, user ID ascending for ties; k=3. | 43 XML sets `k=3`; no neighbor list/scores or tie policy. 264 workflow XML is absent. | k agrees where declared; neighbor set/order **unverified**. |
| Weighting/prediction | Similarity-weighted raw neighbor rating average; no user-mean centering. Only selected neighbors who rated candidate contribute. No valid weight means no score. | 43 XML sets `Weighted Knn=false`; package does not define whether this disables neighbor weighting or another weighting stage. 264 screenshot has no scores/configuration. | Plausible source of 264 mismatch, not proven cause. |
| Candidate filtering | Active IDs supplied by caller minus target user's ratings in training snapshot. | 43 XML explicitly branches on remaining candidate count. All 43/264 transcribed items are unrated in the corresponding input. | Candidate exclusion agrees for available rows. |
| Ranking/ties | Predicted rating descending, then food ID ascending. Weighted averages are clamped to observed neighbor rating bounds solely to remove floating-point drift. | Screenshot references expose rank only; no score/tie details. | Tie behavior **unverified**. Per-user diagnostic finds 4/19 scored screenshot items tied with Python's top score, 15 scored below Python Top-1, and 3 unscored; tie policy cannot explain full mismatch if transcription is accurate. |

The 43 workflow XML uses operator compatibility `irbrecommender:user_k-NN` 5.1.002 with `Weighted Knn=false`, `k=3`, and `Apply Model IR` `n=1/2`, `Online updates=false`. Its source is a local repository entry, so XML is not a self-contained rerun. Package includes no verified 264 workflow. `Weighted Knn=false` alone does not establish cosine formula, normalization, score aggregation, or tie-breaking. The 264 screenshot/reference association is explicitly an assumption in package README. Since many Python-scored screenshot items are below Top-1 and three are unscored, item mismatch is not attributable to tie-breaking alone; exact cause remains unresolved without actual process settings and score output.

## Phase G diagnostic comparison — 2026-11-11

No Python formula or production engine behavior was changed. Diagnostic runs exercised alternatives only; they do not identify Altair semantics.

### Dataset integrity and sensitivity probes

- Training fixture: 264 rows, 22 users (IDs 2–23, exactly 12 rows/user), 40 foods (IDs 1–40), integer ratings 1–5, no duplicate user-food pairs; SHA-256 `19e34a779d3637b12667f4a7c3f4f369c8c901c45513b25f2965811ffa6fa349`.
- Holdout: 66 rows, 22 users (3 rows/user), IDs and ratings are integers, no duplicate pairs, and all 66 user-food pairs are disjoint from training; SHA-256 `a5bf580b2d951864937f7f3803de9df50f7280556f02e5d0d32c38a6945dfaea`.
- Toy fixture: 43 rows, 8 users, 6 foods, integer IDs/ratings, no duplicate pairs; SHA-256 `8425899720fd43edb06822fb7f9efb80c47b563490a042bbc2b05ca865f31a53`.
- ID mapping is structurally consistent in supplied CSVs: Python parses numeric `user_id`/`food_id` as integers; the toy XML assigns `user_id` and `food_id` to user/item identification roles; recommendation references use numeric `item_id`. No ID/type cause was found in these artifacts.
- Python parameter sweep compared overlap vs zero-filled cosine, minimum overlap 1 vs 2, k ∈ {1,2,3,5,10}, and similarity-weighted vs unweighted neighbor rating averages. No tested configuration matched more than 1/22 screenshot Top-1 items. This is sensitivity evidence, not a parameter search target; no setting was selected to fit the screenshot.
- At baseline overlap/minimum-overlap-1/k=3, 62/66 selected neighbors have cosine exactly 1.0; 16/66 selected neighbor pairs share only one rated food. 15/22 users have a tie at the k=3 neighbor cutoff. Thus low-overlap cosine and neighbor tie ordering are plausible contributors, but actual Altair neighbor identities/order are unavailable, so this is **not proven root cause**.
- For the 66-row rating-prediction holdout, the separate Python-only test still yields 42 predictions and 24 missing; MAE/RMSE apply only to those 42. No Altair holdout predictions were provided.

### Per-user comparison: train-264 Top-1

Reference column means screenshot transcription, not an original exported Altair CSV. Python rank/score is the rank/score of that transcribed item under the unchanged baseline (`overlap`, k=3, minimum overlap 1, similarity-weighted ratings). Neighbor column shows selected Python neighbor ID / common training ratings.

| User | Screenshot item | Python Top-1 | Screenshot item Python rank / score | Selected Python neighbors (`id` / overlap) |
|---:|---:|---:|---:|---|
| 2 | 28 | 13 | 6 / 4.0091 | 12 / 1, 11 / 3, 3 / 2 |
| 3 | 28 | 10 | 2 / 5.0000 (top-score tie) | 17 / 2, 19 / 3, 7 / 3 |
| 4 | 33 | 6 | 11 / 3.0000 | 9 / 3, 14 / 4, 16 / 1 |
| 5 | 13 | 2 | 2 / 5.0000 (top-score tie) | 6 / 3, 7 / 3, 10 / 3 |
| 6 | 6 | 31 | not predicted | 5 / 3, 11 / 2, 13 / 1 |
| 7 | 40 | 8 | 16 / 2.0000 | 5 / 3, 12 / 4, 22 / 2 |
| 8 | 34 | 19 | 3 / 5.0000 (top-score tie) | 13 / 1, 18 / 5, 23 / 4 |
| 9 | 27 | 6 | 18 / 1.0000 | 4 / 3, 14 / 1, 19 / 5 |
| 10 | 13 | 1 | 20 / 1.0000 | 5 / 3, 15 / 3, 20 / 4 |
| 11 | 40 | 2 | 7 / 4.0000 | 6 / 2, 16 / 1, 21 / 4 |
| 12 | 40 | 1 | 20 / 2.0000 | 2 / 1, 5 / 1, 7 / 4 |
| 13 | 36 | 4 | 22 / 1.0000 | 6 / 1, 8 / 1, 15 / 3 |
| 14 | 25 | 10 | 2 / 5.0000 (top-score tie) | 4 / 4, 9 / 1, 19 / 4 |
| 15 | 28 | 11 | 17 / 1.0000 | 10 / 3, 13 / 3, 20 / 2 |
| 16 | 23 | 2 | 8 / 4.0000 | 4 / 1, 6 / 4, 11 / 1 |
| 17 | 24 | 1 | 16 / 1.0000 | 6 / 3, 12 / 4, 22 / 4 |
| 18 | 8 | 39 | 15 / 2.0000 | 5 / 1, 8 / 5, 13 / 1 |
| 19 | 33 | 6 | not predicted | 4 / 5, 9 / 5, 14 / 4 |
| 20 | 22 | 1 | 11 / 3.0000 | 5 / 4, 10 / 4, 15 / 2 |
| 21 | 29 | 2 | 19 / 1.0000 | 11 / 4, 16 / 4, 6 / 2 |
| 22 | 32 | 13 | not predicted | 7 / 2, 17 / 4, 12 / 4 |
| 23 | 29 | 4 | 11 / 3.0000 | 8 / 4, 13 / 3, 16 / 1 |

All 22 reference foods are valid unrated candidates in each user's training snapshot (28 candidates/user). Python predicts 19/22 reference items: four are tied with Python's maximum score, 15 rank below it, and users 6/19/22 have no selected-neighbor prediction for the reference item. These diagnostics localize behavior but cannot distinguish missing-value handling, neighbor/tie policy, scoring, or a screenshot/workflow mismatch.

**Parity status: BLOCKED / Pending Validation.** Evidence still required: complete Altair workflow used for train-264; native exported output CSV for train-264 and toy-43; exact Altair AI Studio and recommender extension versions/settings; per-user neighbor IDs and similarities; per-candidate prediction scores before ranking; confirmed provenance of the 879-row source and 264/66 split. Do not change Python to fit transcribed output.

### Separate 264/66 rating-prediction holdout

This check does **not** call Top-N. For each of 66 test pairs, it selects neighbors from train-only ratings (`k=3`) and calls `predict_rating`; all 66 train/test pairs are disjoint. Python baseline predicts 42/66; 24 have no selected neighbor who rated held-out food. On 42 covered predictions, MAE=`0.571609`, RMSE=`1.086003`. No Altair Rating Prediction output is supplied, so these metrics are Python-only and do not establish parity or full holdout coverage. Do not compute MAE/RMSE from Top-N ranks.

## Overall validation status

- 43-rating comparison: **MATCHED OUTPUT** (5/5 ordered rows); mathematics not proven.
- Train-264 Top-1 comparison: **MISMATCH** (22/22 row count, user IDs and rank values align; 0/22 item IDs align).
- Mathematical parity: **Pending Validation**. Needed: original exported Altair outputs, confirmed 264 process XML and extension settings, plus similarity/neighbor/prediction scores and tie behavior.
- Automatic processing: **OFF**. Do not open publication/automation gate from screenshot ranking match.

## Phase F QA evidence (2026-11-11)

- 4/4 Playwright Chromium journeys pass against isolated `foodrec_e2e_test`; 6/6 PostgreSQL integration suites pass against isolated `foodrec_test`.
- Real Python worker claimed a manual job and wrote `SUCCEEDED` with an `UNVERIFIED` artifact. Rating revision changed after snapshot, so artifact was correctly marked stale. E2E verified no batch count change and that artifact publication is rejected.
- API attempts to enable automation or enqueue an automatic job were rejected; database config remained `autoProcessingEnabled=false`, `automaticPublicationEnabled=false`, `validationStatus=PENDING_VALIDATION`.
- This validates queue, API, browser controls, and staging boundary only. It does **not** validate algorithm parity. 43-rating output stays **MATCHED OUTPUT**; train-264 Top-1 stays **MISMATCH**; mathematical parity and real Altair export remain **Pending Validation**.
- Production `npm audit --omit=dev` reports one moderate advisory in transitive `fast-uri`; see [`PHASE_F_VERIFICATION.md`](PHASE_F_VERIFICATION.md).

## Run unit tests

From repository root:

```powershell
Set-Location services/recommender
$env:PYTHONPATH = "src"
python -m unittest discover -s tests -v
```
