# Recommendation Engine Validation

## Status: Pending Validation

Python core implements explicit UBCF baselines and Phase C worker runs it through authenticated staging jobs. It does not feed the website recommendation page or publication path. Phase B now includes a user-provided native Altair train-264 Top-1 CSV and per-user Python diagnostics; no native toy-43 CSV, train-264 workflow, or Altair score/neighbor export is available. The 43-rating input is a toy fixture. Native train-264 output mismatches Python 0/22; ranking comparison alone does not prove mathematical parity. Automatic processing remains **OFF**.

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

Extracted fixtures: [`services/recommender/tests/fixtures/phase_b_altair`](../services/recommender/tests/fixtures/phase_b_altair). Original 13 manifest payload checksums matched during extraction; native CSV and diagnostics were added during this investigation. Package says 43-row fixture is toy/not real research data. The 264/66 datasets are a seeded (`20261025`) split of an 879-row snapshot; provenance of the source ratings is unverified. Source snapshot SHA-256: `a2cda622ac8702538c3ba0d9c0ae0ad73be9e88c5d3699e3933cd215c2f23337`; 66-row test SHA-256: `a5bf580b2d951864937f7f3803de9df50f7280556f02e5d0d32c38a6945dfaea`. Train has 12 ratings for each of 22 users; test has 3 held-out ratings per user and no duplicate user-food pairs across splits. Original 879 rows were not loaded into any database.

| Case | Input SHA-256 | Settings | Altair reference | Python output | Status |
| --- | --- | --- | --- | --- | --- |
| 43 ratings / 8 users / 6 foods | `8425899720fd43edb06822fb7f9efb80c47b563490a042bbc2b05ca865f31a53` | Python k=3/Top-2; overlap cosine baseline, min overlap 1. XML declares k=3 and Apply Model n=1/2. | 5 screenshot-transcribed rows | Same 5 rows and order | **MATCHED OUTPUT** |
| Train 264 / 22 users / 40 foods | `19e34a779d3637b12667f4a7c3f4f369c8c901c45513b25f2965811ffa6fa349` | Python k=3/Top-1, min overlap 1. User reports Altair k=3, `Weighted Knn=false`, Apply Model IR n=1, online updates false; exact workflow/build unavailable. | Native CSV: 22 rows, all rank 1. Historical screenshot transcription remains separate. | Native export: 22 rows, 0 item IDs match. | **NATIVE MISMATCH** |

43 output, both reference and Python, ordered by user then rank:

```text
(1,106,1) (1,105,2) (2,106,1) (3,104,1) (5,105,1)
```

Candidate exclusions also agree for 43 fixture. Candidate counts by user are `1:2, 2:1, 3:1, 4:0, 5:1, 6:0, 7:0, 8:0`; all five returned foods are unrated by their target user. Provided XML calculates `remaining_candidates`, routes users with at least two candidates to `Apply Model IR n=2`, and routes users with exactly one to `n=1`. Users 4, 6, 7, and 8 have no candidate.

Historical screenshot transcription only: for train-264, each user has 28 unrated foods out of 40. All 22 screenshot items are candidates under train snapshot; all 22 Python items are also unrated. Python can score 19 screenshot items using its selected neighbors, but those items rank 2–22, never Top-1. Three screenshot items (user/food `(6,6)`, `(19,33)`, `(22,32)`) have no rating from Python's selected top-3 neighbors and receive no prediction. These rows are not the native export; see [native investigation](ALTAIR_PYTHON_PARITY_INVESTIGATION.md).

Python Top-1 versus historical screenshot transcription:

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
| Cosine inputs | Raw ratings on co-rated foods (`overlap`); missing ratings omitted. Optional `zero_filled` exists but was not used. | Public extension source at pinned commit computes binary cosine over positive user-item interactions. Link to installed build is unverified; no similarity values exported. | Runtime formula **unverified**; public source differs from Python baseline. |
| Neighbors | Positive similarity, minimum common ratings 1, similarity descending, user ID ascending for ties; k=3. | Public source sorts all other users by binary cosine and takes k; exact runtime and tie ordering unavailable. No native neighbor list/scores. | k agrees by user report; neighbor set/order **unverified**. |
| Weighting/prediction | Similarity-weighted raw neighbor rating average; no user-mean centering. Only selected neighbors who rated candidate contribute. No valid weight means no score. | Public source maps `Weighted Knn=false` to unweighted binary user-KNN; its score is fraction of selected neighbors that interacted with item. Installed-build link unverified. | Strong candidate cause; not proven for this run. |
| Candidate filtering | Active IDs supplied by caller minus target user's ratings in training snapshot. | 43 XML explicitly branches on remaining candidate count. All 43 screenshot and 264 native-reference items are unrated in the corresponding input. | Candidate exclusion agrees for available rows. |
| Ranking/ties | Predicted rating descending, then food ID ascending. Weighted averages are clamped to observed neighbor rating bounds solely to remove floating-point drift. | Public source randomizes some equal-score Top-N replacements; exact build unavailable. Native CSV exposes rank only, no scores. | Python and source tie behavior differ; runtime tie behavior **unverified**. |

The 43 workflow XML uses operator compatibility `irbrecommender:user_k-NN` 5.1.002 with `Weighted Knn=false`, `k=3`, and `Apply Model IR` `n=1/2`, `Online updates=false`. The public source repository (commit `3d89c7dbe247ca2db4c4d49cf6189d4467872bcd`, dated 2013-06-29) implements `Weighted Knn=false` using positive-only binary feedback, binary cosine, and neighbor-support scores; its Top-N helper randomizes equal-score replacements. This is concrete source evidence, but does not prove the installed extension build matches that repository revision. The XML compatibility value is not an installed-version record; the native run's `.rmp` and Altair/extension versions remain unavailable.

## Phase G diagnostic comparison — 2026-11-11

No Python formula or production engine behavior was changed. Sensitivity variants alone do not identify Altair semantics; pinned public extension source reviewed below still lacks a verified link to the installed build.

### Dataset integrity and sensitivity probes

- Training fixture: 264 rows, 22 users (IDs 2–23, exactly 12 rows/user), 40 foods (IDs 1–40), integer ratings 1–5, no duplicate user-food pairs; SHA-256 `19e34a779d3637b12667f4a7c3f4f369c8c901c45513b25f2965811ffa6fa349`.
- Holdout: 66 rows, 22 users (3 rows/user), IDs and ratings are integers, no duplicate pairs, and all 66 user-food pairs are disjoint from training; SHA-256 `a5bf580b2d951864937f7f3803de9df50f7280556f02e5d0d32c38a6945dfaea`.
- Toy fixture: 43 rows, 8 users, 6 foods, integer IDs/ratings, no duplicate pairs; SHA-256 `8425899720fd43edb06822fb7f9efb80c47b563490a042bbc2b05ca865f31a53`.
- ID mapping is structurally consistent in supplied CSVs: Python parses numeric `user_id`/`food_id` as integers; the toy XML assigns `user_id` and `food_id` to user/item identification roles; recommendation references use numeric `item_id`. No ID/type cause was found in these artifacts.
- Historical screenshot sensitivity sweep compared overlap vs zero-filled cosine, minimum overlap 1 vs 2, k ∈ {1,2,3,5,10}, and similarity-weighted vs unweighted neighbor rating averages. No tested configuration matched more than 1/22 screenshot Top-1 items. This is sensitivity evidence, not a parameter search target; no setting was selected to fit the screenshot.
- At baseline overlap/minimum-overlap-1/k=3, 62/66 selected neighbors have cosine exactly 1.0; 16/66 selected neighbor pairs share only one rated food. 15/22 users have a tie at the k=3 neighbor cutoff. Thus low-overlap cosine and neighbor tie ordering are plausible contributors, but actual Altair neighbor identities/order are unavailable, so this is **not proven root cause**.
- For the 66-row rating-prediction holdout, the separate Python-only test still yields 42 predictions and 24 missing; MAE/RMSE apply only to those 42. No Altair holdout predictions were provided.

### Per-user comparison: train-264 Top-1

This table is historical screenshot transcription only, not the native export. Python rank/score is the rank/score of that transcribed item under the unchanged baseline (`overlap`, k=3, minimum overlap 1, similarity-weighted ratings). Neighbor column shows selected Python neighbor ID / common training ratings. Use the native report below for the actual exported Top-1 comparison.

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

All 22 screenshot-reference foods are valid unrated candidates in each user's training snapshot (28 candidates/user). These historical diagnostics do not describe the native export; see the native report below.

**Parity status: BLOCKED / Pending Validation.** Evidence still required: complete Altair workflow used for train-264; native toy-43 CSV; exact Altair AI Studio and installed recommender extension versions/settings; per-user Altair neighbor IDs and similarities; per-candidate prediction scores before ranking; confirmed provenance of the 879-row source and 264/66 split. Do not change Python to fit reference output.

### Native train-264 export — 2026-11-11

- Original user-supplied `altair_train264_top1.csv` is preserved at `services/recommender/tests/fixtures/phase_b_altair/references/altair_train264_top1.csv`; SHA-256 `988f96d195fb793b1553ab82d263c46ba7cee6f833525a575791ae024507c3e4`. It contains 22 rank-1 rows, one per user; all 22 items are unrated in the matching train snapshot.
- Rerunning `compare_altair.py` with k=3, Top-1, minimum overlap 1, and overlap cosine gives **0/22** exact item matches. The supplied comparison CSV agrees with recomputed Python Top-1, native-item rank/score, and neighbor fields for all 22 users; it is evidence about Python output, not Altair internals.
- Detailed user/candidate diagnostics are in [`reports/altair_train264_python_diagnostics.csv`](../services/recommender/tests/fixtures/phase_b_altair/reports/altair_train264_python_diagnostics.csv). Python scores 17/22 native items; five (users 2, 6, 9, 13, 16) have no rating from the selected global top-3 neighbors. The other 17 rank below Python Top-1; five of those have score 5.0 but lose Python's food-ID tie-break.
- Sensitivity probes (not production settings): zero-filled cosine 1/22 (user 4); unweighted arithmetic mean 0/22; item-specific top-3 eligible raters, weighted or unweighted, 0/22; minimum overlap 2, 0/22; reverse neighbor-ID tie 1/22 (user 12); reverse food-ID tie 3/22 (users 5, 8, 12). Combined probes matched at most 1/22.
- Public source review found a plausible semantic explanation: in repository commit `3d89c7dbe247ca2db4c4d49cf6189d4467872bcd`, `Weighted Knn=false` selects binary positive-only user-KNN, uses binary cosine and scores candidates by fraction of selected neighbors that interacted with them; Top-N equal-score replacements use random choice. A source-faithful support probe places every native item among maximum-support candidates (22/22), with tied maxima for 21 users. This is **strong evidence for a likely cause, not proof**: installed extension build/version and train-264 workflow are unavailable, and no native neighbors/scores were exported.
- Production Python behavior remains unchanged. Mathematical parity stays **Pending Validation**; Top-1 ranking mismatch is verified, not fixed by tuning. Required next evidence: exact `.rmp`/XML and Altair plus installed-extension versions/build, and native per-user neighbors/similarities and candidate scores (or source/JAR hash proving the inspected implementation matches runtime).

### Separate 264/66 rating-prediction holdout

This check does **not** call Top-N. For each of 66 test pairs, it selects neighbors from train-only ratings (`k=3`) and calls `predict_rating`; all 66 train/test pairs are disjoint. Python baseline predicts 42/66; 24 have no selected neighbor who rated held-out food. On 42 covered predictions, MAE=`0.571609`, RMSE=`1.086003`. No Altair Rating Prediction output is supplied, so these metrics are Python-only and do not establish parity or full holdout coverage. Do not compute MAE/RMSE from Top-N ranks.

## Overall validation status

- 43-rating screenshot-transcription comparison: **MATCHED OUTPUT** (5/5 ordered rows); mathematics not proven; no native 43 export.
- Train-264 native Top-1 comparison: **MISMATCH** (22/22 row count, user IDs and rank values align; 0/22 item IDs align).
- Mathematical parity: **Pending Validation**. Public source suggests binary-feedback/support scoring, but runtime linkage and matching neighbor/score evidence are missing.
- Automatic processing: **OFF**. Do not open publication/automation gate from ranking evidence.

## Phase F QA evidence (2026-11-11)

- 4/4 Playwright Chromium journeys pass against isolated `foodrec_e2e_test`; 6/6 PostgreSQL integration suites pass against isolated `foodrec_test`.
- Real Python worker claimed a manual job and wrote `SUCCEEDED` with an `UNVERIFIED` artifact. Rating revision changed after snapshot, so artifact was correctly marked stale. E2E verified no batch count change and that artifact publication is rejected.
- API attempts to enable automation or enqueue an automatic job were rejected; database config remained `autoProcessingEnabled=false`, `automaticPublicationEnabled=false`, `validationStatus=PENDING_VALIDATION`.
- This validates queue, API, browser controls, and staging boundary only. It does **not** validate algorithm parity. The 43-rating screenshot comparison stays **MATCHED OUTPUT**; native train-264 Top-1 stays **MISMATCH**; mathematical parity stays **Pending Validation**.
- Production `npm audit --omit=dev` reports one moderate advisory in transitive `fast-uri`; see [`PHASE_F_VERIFICATION.md`](PHASE_F_VERIFICATION.md).

## Run unit tests

From repository root:

```powershell
Set-Location services/recommender
$env:PYTHONPATH = "src"
python -m unittest discover -s tests -v
```
