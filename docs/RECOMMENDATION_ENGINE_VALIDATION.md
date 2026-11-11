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
| Ranking/ties | Predicted rating descending, then food ID ascending. Weighted averages are clamped to observed neighbor rating bounds solely to remove floating-point drift. | Screenshot references expose rank only; no score/tie details. | Tie behavior **unverified**; cannot explain all 264 differences. |

The 43 workflow XML uses operator compatibility `irbrecommender:user_k-NN` 5.1.002 with `Weighted Knn=false`, `k=3`, and `Apply Model IR` `n=1/2`, `Online updates=false`. Its source is a local repository entry, so XML is not a self-contained rerun. Package includes no verified 264 workflow. `Weighted Knn=false` alone does not establish cosine formula, normalization, score aggregation, or tie-breaking. The 264 screenshot/reference association is explicitly an assumption in package README. Since many Python-scored screenshot items are below Top-1 and three are unscored, item mismatch is not attributable to tie-breaking alone; exact cause remains unresolved without actual process settings and score output.

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
