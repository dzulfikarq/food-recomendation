# Altair–Python Parity Investigation

## Status: Pending Validation

**Verified output result:** native Altair train-264 Top-1 and unchanged Python baseline match on **0/22** users. Match count stayed **0/22 before and after** this investigation; no production algorithm changed. **Likely semantic cause:** the public Recommender extension source implements this operator as implicit binary-feedback user-KNN, while FoodRec Python predicts explicit numeric ratings. The inspected source has not been tied to the Altair build used for this run, so this is not a proven runtime root cause and mathematical parity remains **PENDING VALIDATION**.

## Inputs and integrity

| Artifact | Rows / details | SHA-256 |
| --- | --- | --- |
| `services/recommender/tests/fixtures/phase_b_altair/datasets/foodrec_offline_train_264.csv` | 264 ratings; 22 users (IDs 2–23), 12/user; foods 1–40; no duplicate user-food pairs | `19e34a779d3637b12667f4a7c3f4f369c8c901c45513b25f2965811ffa6fa349` |
| `services/recommender/tests/fixtures/phase_b_altair/references/altair_train264_top1.csv` | 22 native-export rows; one rank-1 item/user | `988f96d195fb793b1553ab82d263c46ba7cee6f833525a575791ae024507c3e4` |
| User-supplied `foodrec_altair_vs_python_train264.csv` | 22 rows; fields agree with independent recomputation of Python output | `25e9147110a3ea3e126affafaf6459beaa316b1663500175575c8502340993a3` |
| `services/recommender/tests/fixtures/phase_b_altair/reports/altair_train264_python_diagnostics.csv` | Per-user candidate, score, neighbor, overlap, similarity, and rank details | `6e1a67e2d8f9af0071e83c8d592ebcfe505ca2e22edeac132ebbff6811e9690e` |

Native file was copied unchanged from the supplied CSV. All 22 Altair item IDs are in foods 1–40 and unrated in that user's train snapshot; every user has 28 unrated candidates. The historical screenshot transcription remains a separate artifact and is not used as native ground truth. The 43-rating reference is still screenshot-transcribed; no native toy-43 CSV was supplied.

## Run configuration and provenance

The user reports this native run used User k-NN, `k=3`, `Weighted Knn=false`, Apply Model Item Recommendation `n=1`, and `Online updates=false`. The train fixture SHA above matches the fixture manifest. The exact train-264 `.rmp`/XML was not supplied, so workflow settings/defaults cannot be independently checked.

The existing toy workflow XML declares operator compatibility `irbrecommender:user_k-NN` `5.1.002`, `k=3`, `Weighted Knn=false`, Apply Model IR `n=1/2`, and online updates false. That XML is not the train-264 workflow. Its compatibility attribute does not identify the installed Altair AI Studio or extension build. Neither installed version nor extension JAR hash was available.

## Python baseline audited

Relevant implementation: `services/recommender/src/engine/{similarity.py,user_knn.py,prediction.py,recommend.py}`.

- Similarity uses raw rating values only on co-rated foods: `Σ(r_ui × r_vi) / (sqrt(Σr_ui²) × sqrt(Σr_vi²))`; missing foods are omitted. Default minimum overlap is 1.
- Select positive similarities, sort descending then user ID ascending, and take global top 3.
- Candidate prediction is similarity-weighted mean of the selected neighbors' numeric ratings for that food. Neighbors without that rating do not contribute; no usable rating means no Python score.
- Exclude foods already rated by target user. Sort predictions descending then food ID ascending.
- Therefore Python scores are rating-scale values (1–5); Altair's semantics cannot be inferred from `Weighted Knn=false` alone.

## Public extension source review

Inspected public repository [`matmih/Recommender-extension`](https://github.com/matmih/Recommender-extension) at commit [`3d89c7dbe247ca2db4c4d49cf6189d4467872bcd`](https://github.com/matmih/Recommender-extension/commit/3d89c7dbe247ca2db4c4d49cf6189d4467872bcd), dated 2013-06-29. GitHub exposes no tags/releases; [`build.properties`](https://github.com/matmih/Recommender-extension/blob/3d89c7dbe247ca2db4c4d49cf6189d4467872bcd/Recommender%20Extension%20source/build.properties) says `extension.version=5`, while `build.xml` requires RapidMiner 5.0. Neither identifies compatibility value `5.1.002` or the installed binary. This pins the inspected source, **not** the binary installed for the native run.

- [`UserKnn.java`](https://github.com/matmih/Recommender-extension/blob/3d89c7dbe247ca2db4c4d49cf6189d4467872bcd/Recommender%20Extension%20source/src/com/rapidminer/ItemRecommendation/UserKnn.java) builds `PosOnlyFeedback` from user and item IDs. The loop does not read numeric `rating` values. With `Weighted Knn=false`, it instantiates `_userKnn`; true selects `WeightedUserKnn`.
- [`_userKnn.java`](https://github.com/matmih/Recommender-extension/blob/3d89c7dbe247ca2db4c4d49cf6189d4467872bcd/Recommender%20Extension%20source/src/com/rapidminer/ItemRecommendation/_userKnn.java) trains with `BinaryCosine`. For users `u,v`, source computes `|Iu ∩ Iv| / sqrt(|Iu| × |Iv|)`, where `Iu` is the set of positive interactions. `Predict(u,i)` is `count(selected neighbors that interacted with i) / k`. This is binary support, not an average of numeric ratings; unsupported items still score zero.
- [`BinaryCosine.java`](https://github.com/matmih/Recommender-extension/blob/3d89c7dbe247ca2db4c4d49cf6189d4467872bcd/Recommender%20Extension%20source/src/com/rapidminer/data/BinaryCosine.java) computes that cosine over binary feedback. Rating magnitudes do not enter numerator or denominator.
- [`CorrelationMatrix.java`](https://github.com/matmih/Recommender-extension/blob/3d89c7dbe247ca2db4c4d49cf6189d4467872bcd/Recommender%20Extension%20source/src/com/rapidminer/data/CorrelationMatrix.java) excludes self, sorts every other internal user index by similarity, and takes first `k`. It has no positive-similarity or minimum-overlap filter; zero-similarity users can fill remaining slots. Comparator returns `0` for equal similarities. [`EntityMapping.java`](https://github.com/matmih/Recommender-extension/blob/3d89c7dbe247ca2db4c4d49cf6189d4467872bcd/Recommender%20Extension%20source/src/com/rapidminer/data/EntityMapping.java) assigns internal IDs in first-seen order; stable Java object sorting therefore preserves that internal order for neighbor ties.
- [`ApplyModel.java`](https://github.com/matmih/Recommender-extension/blob/3d89c7dbe247ca2db4c4d49cf6189d4467872bcd/Recommender%20Extension%20source/src/com/rapidminer/ItemRecommendation/ApplyModel.java) uses items observed in training, excluding items already consumed by each user. It asks for first `n`; zero-score candidates remain eligible. [`PredictItemsFast.java`](https://github.com/matmih/Recommender-extension/blob/3d89c7dbe247ca2db4c4d49cf6189d4467872bcd/Recommender%20Extension%20source/src/com/rapidminer/eval/PredictItemsFast.java) replaces a current candidate on equal score with probability 4/5 (`nextInt(5) <= 3`). [`WeightedItem.compareTo`](https://github.com/matmih/Recommender-extension/blob/3d89c7dbe247ca2db4c4d49cf6189d4467872bcd/Recommender%20Extension%20source/src/com/rapidminer/data/WeightedItem.java) returns `0` for equal scores; no food-ID tie-break exists. Candidate enumeration comes from [`CompactHashSet`](https://github.com/matmih/Recommender-extension/blob/3d89c7dbe247ca2db4c4d49cf6189d4467872bcd/Recommender%20Extension%20source/src/com/rapidminer/data/CompactHashSet.java), not an explicit item-ID sort. Exact tie results are therefore not reproducible from score values alone.
- [`WeightedUserKnn.java`](https://github.com/matmih/Recommender-extension/blob/3d89c7dbe247ca2db4c4d49cf6189d4467872bcd/Recommender%20Extension%20source/src/com/rapidminer/ItemRecommendation/WeightedUserKnn.java)'s alternate weighted path sums similarities from binary-feedback neighbors who interacted with the item. This still is not rating-weighted prediction.

**Interpretation:** if this public source corresponds to the installed extension, `Weighted Knn=false` means unweighted binary support, not unweighted arithmetic averaging of 1–5 ratings. Python's explicit-rating overlap cosine and weighted rating average are a different algorithm. This is a strong likely semantic explanation for the mismatch. Source/build linkage is missing; do not claim it as the proven cause of the native run yet.

### Source-semantics sensitivity probe

An offline probe treated each positive rating as a binary interaction, computed binary cosine, chose global top-3 neighbors in first-seen user order for similarity ties, and checked native-item support. All **22/22** native items have maximum score. Only **5/22** are unique maxima; remaining **17/22** users have a tied maximum. This is score compatibility, not exact parity: the installed build is unknown and the extension randomizes some equal-score selections.

## Executable binary diagnostic

Added separate script [`services/recommender/scripts/diagnose_altair_binary.py`](../services/recommender/scripts/diagnose_altair_binary.py). It does not import or modify the production engine. It ignores `rating`, constructs positive interaction sets, uses all-other-user neighbor selection (including zero similarities), computes `count/k`, excludes consumed items, and reports tie-compatible reference rankings. Its food-ID-ascending ranking is explicitly a deterministic comparison proxy, **not** the extension tie rule.

Run from repository root:

```powershell
python services/recommender/scripts/diagnose_altair_binary.py `
  --dataset services/recommender/tests/fixtures/phase_b_altair/datasets/foodrec_offline_train_264.csv `
  --reference services/recommender/tests/fixtures/phase_b_altair/references/altair_train264_top1.csv `
  --k 3 --top-n 1 --output $env:TEMP\altair_binary_train264.csv

python services/recommender/scripts/diagnose_altair_binary.py `
  --dataset services/recommender/tests/fixtures/phase_b_altair/datasets/ratings_uji_collaborative_filtering_43.csv `
  --reference services/recommender/tests/fixtures/phase_b_altair/references/altair_reference_top2_43_SCREENSHOT_TRANSCRIPTION.csv `
  --k 3 --top-n 2 --output $env:TEMP\altair_binary_toy43.csv
```

The checked-in per-user reports are [`altair_binary_train264_diagnostics.csv`](../services/recommender/tests/fixtures/phase_b_altair/reports/altair_binary_train264_diagnostics.csv) and [`altair_binary_toy43_diagnostics.csv`](../services/recommender/tests/fixtures/phase_b_altair/reports/altair_binary_toy43_diagnostics.csv). Each records candidate IDs, all candidate scores, selected binary neighbors (`user_id:overlap:similarity`), reference item score, max-score item set, score compatibility, and deterministic ID-ascending comparison.

| Dataset | Source-score compatible | Unique-score/forced result | ID-ascending proxy |
| --- | ---: | ---: | ---: |
| Train-264 native Top-1 | 22/22 Altair items are within max-score set | 5/22 native items are unique maxima; other 17 are tied | 10/22 exact Top-1 items |
| Toy-43 screenshot Top-2 | All 5 rows / 4 users fit top-2 scores | Not applicable: top-2 ranking has equal-score ties | 3/4 exact user lists; 3/5 exact `(user,item,rank)` rows |

The 264 deterministic ID tie count is not an Altair prediction count: source has no ID tie-break and may choose another equal-score item. For 43, output is screenshot transcription, not native Altair CSV. All five screenshot rows are score-compatible; that supports the binary-scoring hypothesis across a second dataset but does not validate runtime or prove mathematical parity.

## Research implication and implementation recommendation

In the inspected source, `rating` is not read by User k-NN. Every user-food row becomes the same positive event. Rating values 1–5 therefore do **not** affect similarity, neighbors, item score, or rank; changing a row's rating from 1 to 5 leaves output unchanged. This operator is positive-interaction recommendation, not explicit rating prediction. `Weighted Knn=true` still weights binary interactions by similarity; it does not make the numeric rating matter.

Choose implementation from the thesis definition, not from which one copies the current Altair list:

- If the thesis says rating values represent preference intensity and specifies explicit-rating UBCF, keep Python's explicit-rating model as the reference. Do not call this binary Altair operator equivalent. For a future approved comparison, use a rating-aware Altair method or independently coded workflow matching the thesis equation; preserve the existing manual workflow unchanged.
- If the thesis defines any recorded rating as a positive interaction, the separate binary diagnostic is the closer model. Document that all 1–5 values collapse to one event. Production migration still needs explicit approval, separate rating-prediction evaluation, and validation; do not switch based on Top-1 matches.

No production implementation change is recommended until the thesis equation and installed Altair build are confirmed.

## Native comparison and diagnostic experiments

`compare_altair.py` rerun with Python `k=3`, `top-n=1`, `min-common-ratings=1`, and `overlap` cosine: 22 Python rows, 22 native rows, **0 exact Top-1 matches**. The supplied comparison report's Python Top-1, native-item rank/score, and Python-neighbor fields all agree with recomputation. No candidate items are already rated by their target users.

The per-user detail file linked above lists all 28 unrated food IDs and every Python candidate score (`NO_SCORE` where no selected neighbor rated it), plus Python's three selected neighbors as `user_id:common-rating-count:similarity`, native item's Python rank/score, and missing-score reason. Summary:

| User | Altair | Python | Altair item: Python rank / score | Python top-3 neighbors (`ID:overlap:similarity`) |
| ---: | ---: | ---: | --- | --- |
| 2 | 39 | 13 | not scored | 12:1:1.000000; 11:3:0.981981; 3:2:0.970143 |
| 3 | 28 | 10 | 2 / 5.0000 | 17:2:1.000000; 19:3:0.993999; 7:3:0.971537 |
| 4 | 33 | 6 | 11 / 3.0000 | 9:3:1.000000; 14:4:1.000000; 16:1:1.000000 |
| 5 | 13 | 2 | 2 / 5.0000 | 6:3:1.000000; 7:3:1.000000; 10:3:1.000000 |
| 6 | 6 | 31 | not scored | 5:3:1.000000; 11:2:1.000000; 13:1:1.000000 |
| 7 | 40 | 8 | 16 / 2.0000 | 5:3:1.000000; 12:4:1.000000; 22:2:1.000000 |
| 8 | 34 | 19 | 3 / 5.0000 | 13:1:1.000000; 18:5:1.000000; 23:4:1.000000 |
| 9 | 19 | 6 | not scored | 4:3:1.000000; 14:1:1.000000; 19:5:1.000000 |
| 10 | 13 | 1 | 20 / 1.0000 | 5:3:1.000000; 15:3:1.000000; 20:4:1.000000 |
| 11 | 40 | 2 | 7 / 4.0000 | 6:2:1.000000; 16:1:1.000000; 21:4:1.000000 |
| 12 | 38 | 1 | 4 / 5.0000 | 2:1:1.000000; 5:1:1.000000; 7:4:1.000000 |
| 13 | 40 | 4 | not scored | 6:1:1.000000; 8:1:1.000000; 15:3:1.000000 |
| 14 | 25 | 10 | 2 / 5.0000 | 4:4:1.000000; 9:1:1.000000; 19:4:1.000000 |
| 15 | 28 | 11 | 17 / 1.0000 | 10:3:1.000000; 13:3:1.000000; 20:2:1.000000 |
| 16 | 25 | 2 | not scored | 4:1:1.000000; 6:4:1.000000; 11:1:1.000000 |
| 17 | 24 | 1 | 16 / 1.0000 | 6:3:1.000000; 12:4:1.000000; 22:4:1.000000 |
| 18 | 8 | 39 | 15 / 2.0000 | 5:1:1.000000; 8:5:1.000000; 13:1:1.000000 |
| 19 | 28 | 6 | 6 / 4.0000 | 4:5:1.000000; 9:5:1.000000; 14:4:1.000000 |
| 20 | 22 | 1 | 11 / 3.0000 | 5:4:1.000000; 10:4:1.000000; 15:2:1.000000 |
| 21 | 29 | 2 | 19 / 1.0000 | 11:4:1.000000; 16:4:1.000000; 6:2:1.000000 |
| 22 | 40 | 13 | 19 / 1.0000 | 7:2:1.000000; 17:4:1.000000; 12:4:1.000000 |
| 23 | 29 | 4 | 11 / 3.0000 | 8:4:1.000000; 13:3:1.000000; 16:1:1.000000 |

Here `overlap` is number of shared rated foods; `similarity` is Python overlap cosine. Python did not score native items for users 2, 6, 9, 13, and 16 because none of their selected global top-3 neighbors rated that item. Other native items scored, but all ranked below Python's Top-1; five had score 5.0 and lost Python's food-ID tie-break.

Diagnostic variants were isolated sensitivity probes; none changed production defaults:

| Variant | Native Top-1 matches |
| --- | ---: |
| Baseline: overlap cosine, weighted numeric ratings, global top-3, minimum overlap 1 | 0/22 |
| Zero-filled numeric cosine, weighted global top-3 | 1/22 (user 4) |
| Unweighted arithmetic mean of numeric neighbor ratings | 0/22 |
| Item-specific top-3 eligible raters, weighted or unweighted | 0/22 |
| Minimum common ratings 2 | 0/22 |
| Reverse user-ID neighbor tie | 1/22 (user 12) |
| Reverse food-ID prediction tie | 3/22 (users 5, 8, 12) |
| Combined probes | at most 1/22 |

Under Python baseline, 15/22 users have a tie at the global top-3 neighbor cutoff and 20/22 have a tie at the best candidate score. Tie policy is a sensitivity factor, not enough evidence to explain all native output.

## Other validation scope

- Toy 43-rating fixture: existing screenshot transcription matches Python ordered Top-2 output 5/5. It is not a native export and does not prove parity.
- Sparse, dense, cold-start, missing-neighbor, duplicate prevention, deterministic ranking, and engine unit cases are covered by existing Python tests; run results are recorded in task completion, not inferred from the native ranking comparison.
- Rating prediction stays separate from Top-N ranking. Train-264/test-66 holdout has 42 Python predictions, 24 missing; MAE/RMSE only apply to the 42 covered predictions. No Altair holdout prediction export was supplied.

## Decision and evidence needed

No proven root cause for the exact installed Altair run yet; no production change. Keep artifact `UNVERIFIED`, mathematical parity `PENDING VALIDATION`, automation/publication disabled, and do not tune Python to match the Top-1 list.

To close the evidence gap, provide:

1. Exact train-264 workflow `.rmp` or XML, including role mappings, operator parameters/defaults, preprocessing, and candidate construction.
2. Altair AI Studio version and installed Recommender extension version/build; ideally extension JAR SHA-256 or other evidence linking it to the inspected public source.
3. If available, per-user Altair neighbor IDs/similarities and candidate scores before Top-1 truncation. Keep original native CSV unchanged; no database import or publication.
4. Optional native toy-43 export for a second ranking comparison; it cannot replace score/neighbor evidence.

Until then, the source-based binary-feedback explanation is the leading hypothesis, not a claim of mathematical parity.
