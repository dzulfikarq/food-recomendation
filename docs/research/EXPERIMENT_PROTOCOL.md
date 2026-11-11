# Food.com experiment protocol

## Research question and scope

Test explicit-rating User-Based Collaborative Filtering (UBCF) with cosine similarity on Food.com user–recipe ratings. This is a secondary-dataset experiment, not an import into FoodRec. Food.com recipes are not FoodRec's 40 catalog foods; results do not establish production performance or generalize automatically to FoodRec respondents.

Source acquisition, rights, schema, and status: [`PUBLIC_DATASET_SOURCE.md`](PUBLIC_DATASET_SOURCE.md). Preprocessing and split specification: [`DATA_PREPROCESSING.md`](DATA_PREPROCESSING.md). Full-data experiment is blocked until same-release RAW files and research-use rights are verified.

## Model

For users `u,v`, use only co-rated recipes `I_uv`; missing ratings are not zero:

```text
sim(u,v) = Σ[i∈I_uv] r(u,i) r(v,i)
           / (sqrt(Σ[i∈I_uv] r(u,i)^2) sqrt(Σ[i∈I_uv] r(v,i)^2))
```

The existing Python engine selects at most `k` neighbors with positive similarity and at least `m` common ratings. Ties break by user ID. Prediction is the positive-similarity-weighted mean of selected neighbors' ratings for the target recipe; no available neighbor rating means no prediction. No missing rating is imputed as zero. This is an explicit-rating Python implementation; it is not asserted mathematically equivalent to Altair Item Recommendation. See [`ALTAIR_PYTHON_PARITY_INVESTIGATION.md`](../ALTAIR_PYTHON_PARITY_INVESTIGATION.md).

## Split and tuning

The preprocessing script creates per-user train/validation/test partitions with no user–recipe pair overlap and at least one training row per evaluated user. Seed and source checksums are locked in the manifest. Candidate `k={1,3,5,10}` and `m=1` are provisional defaults, not approved final values. Candidate set and subset cap must be recorded before a study run.

For each candidate `k`, fit UBCF on training only and score validation. Select lowest validation MAE among candidates with at least one prediction; ties select smaller `k`. Validation coverage is reported with every error. Then refit on train plus validation and score test once using selected `k`. Test ratings and model outcomes do not select users or parameters. A provisional, predeclared minimum-count eligibility rule (three explicit pairs/user) is applied before splitting so every selected user can contribute to each partition; this conditions the study cohort on activity and must be approved before confirmatory use and reported as a sampling limitation. If no candidate predicts a validation row, evaluator stops rather than inventing a selected configuration.

The current evaluator does not enforce a minimum-coverage acceptance threshold because no threshold has been approved. Report coverage, missing count, and missing reasons regardless; agree on any final acceptance threshold before confirmatory use.

## Metrics and baselines

For covered pairs:

```text
MAE      = mean(|prediction − actual|)
RMSE     = sqrt(mean((prediction − actual)^2))
Coverage = predicted test/validation pairs ÷ all pairs in that split
```

For every method report total pairs, predicted, missing, coverage, MAE, RMSE, and missing reasons. Compare UBCF to global-mean, user-mean, and item-mean baselines calculated from that fit's training data only. For baseline fairness, report both each baseline's metrics on all held-out pairs and metrics on the subset UBCF predicted. Rating error excludes unavailable predictions; coverage exposes those cases.

Top-N evaluation is not implemented in this initial pipeline. No relevance threshold has been approved; do not infer unobserved ratings are negatives. Add ranking evaluation only after relevance definition, candidate set, and metrics are prespecified.

## Reporting and limitations

Retain source version, raw checksums, rights reference, preprocessing manifest, code commit, Python version, seed, subset rule, split counts, parameters, validation selection, per-method error/coverage, and row-level test predictions. Keep source and derived rating files local unless rights explicitly permit sharing. Do not modify production engine, validation gate, database, automatic processing/publication, or catalog.

No full Food.com experiment has run in this repository. Results must be reported in `EXPERIMENT_RESULTS.md` only after a complete authorized run; no pilot or fixture number is a Food.com result. Even valid benchmark estimates describe the selected active-user cohort and Food.com recipes, not FoodRec's own user population or 40 foods. No Python–Altair mathematical parity claim is made.
