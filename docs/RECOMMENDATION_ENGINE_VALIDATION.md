# Recommendation Engine Validation

## Status: Pending Validation

Python core implements an explicit baseline for User-Based Collaborative Filtering (UBCF). It is not yet integrated with the website or a worker. Altair parity is **Pending Validation**: repository audit found no research rating fixture, Altair process file, or reference output. The synthetic fixture below is a hand-calculated unit-test fixture, not the research dataset. Do not use this result as evidence of parity or enable automatic processing.

## Current baseline

- Algorithm: user-based k-nearest neighbors with cosine similarity.
- Similarity strategy: `overlap` by default; vectors contain only foods both users rated. Optional `zero_filled` compares union of food IDs and treats missing ratings as zero.
- Minimum common ratings: configurable; fixture uses 2. Value 1 is only a code-level baseline, not a research parameter.
- Neighbor selection: exclude target user; retain positive similarities meeting minimum overlap; sort by similarity descending, then user ID ascending; take `kNeighbors`.
- Prediction: raw similarity-weighted neighbor rating, `pred(u,i) = Σ(sim(u,v) × r(v,i)) / Σ(sim(u,v))`, using selected positive-similarity neighbors who rated candidate. No mean-centering, imputation, popularity fallback, or prediction when denominator is zero.
- Candidate eligibility: active food IDs supplied by snapshot caller, excluding every food target user rated in that snapshot.
- Top-N: predicted rating descending, then food ID ascending. Candidate IDs are deduplicated before scoring.
- Empty statuses: `COLD_START`, `NO_CANDIDATES`, `NO_NEIGHBORS`, `NO_PREDICTIONS`; successful result is `READY`.
- Initial operational values suggested by product: `kNeighbors=3`, `topN=5`, poll interval 30 minutes, automatic processing OFF. These are not research findings. Engine functions require k and Top-N explicitly.

## Synthetic test dataset and calculation

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

## Altair comparison

| Check | Python baseline | Altair reference | Status |
| --- | --- | --- | --- |
| Cosine overlap / missing-value behavior | Configurable `overlap` or `zero_filled` | No process configuration or result file found | Pending Validation |
| Neighbor selection and tie-breaking | Similarity desc, user ID asc | No reference output found | Pending Validation |
| Prediction formula / rating centering | Raw similarity-weighted average; no centering | No reference output found | Pending Validation |
| Candidate and empty-data behavior | Active, unrated candidates only; explicit empty status | No reference output found | Pending Validation |
| Top-N ranking | Predicted score desc, food ID asc | No reference output found | Pending Validation |

No output was adjusted to force a match. To complete parity validation, provide the exact research rating dataset, Altair AI Studio version/operator configuration, and exported similarity, neighbor, prediction, and recommendation outputs for the same snapshot. Until then, mathematical choices above remain implementation assumptions, not verified protocol.

## Run unit tests

From repository root:

```powershell
Set-Location services/recommender
$env:PYTHONPATH = "src"
python -m unittest discover -s tests -v
```
