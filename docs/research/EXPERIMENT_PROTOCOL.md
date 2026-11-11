# Food.com experiment protocol

## Research question and scope

Test explicit-rating User-Based Collaborative Filtering (UBCF) with cosine similarity on Food.com user–recipe ratings. This is a secondary-dataset experiment, not an import into FoodRec. Food.com recipes are not FoodRec's 40 catalog foods; results do not establish production performance or generalize automatically to FoodRec respondents.

Source acquisition, rights, schema, and status: [`PUBLIC_DATASET_SOURCE.md`](PUBLIC_DATASET_SOURCE.md). Preprocessing and split specification: [`DATA_PREPROCESSING.md`](DATA_PREPROCESSING.md). A 5,000-user local exploratory run completed; rights remain unclear, so no confirmatory or publishable result is claimed. See [`EXPERIMENT_RESULTS.md`](EXPERIMENT_RESULTS.md).

## Model

For users `u,v`, use only co-rated recipes `I_uv`; missing ratings are not zero:

```text
sim(u,v) = Σ[i∈I_uv] r(u,i) r(v,i)
           / (sqrt(Σ[i∈I_uv] r(u,i)^2) sqrt(Σ[i∈I_uv] r(v,i)^2))
```

The existing Python engine selects at most `k` neighbors with positive similarity and at least `m` common ratings. Ties break by user ID. Prediction is the positive-similarity-weighted mean of selected neighbors' ratings for the target recipe; no available neighbor rating means no prediction. No missing rating is imputed as zero. This is an explicit-rating Python implementation; it is not asserted mathematically equivalent to Altair Item Recommendation. See [`ALTAIR_PYTHON_PARITY_INVESTIGATION.md`](../ALTAIR_PYTHON_PARITY_INVESTIGATION.md).

## Split and tuning

The preprocessing script splits all source users by per-user SHA-256-ranked pairs before cohort selection. Users with fewer than three pairs remain train-only. Cohort and item filters use training rows only; seed, strategy, thresholds, and source checksums are locked in the manifest. The comparison run prespecifies `k={1,3,5,10}`, `m=1`, user cap 5,000, train-history minimum 5, popular-item minimum 25 plus user minimum 3, training-only bipartite 3-core, and largest training-only connected component. Seeds `20261113`, `20261114`, and `20261115` are used for every strategy. These are exploratory choices, not advisor-approved final parameters.

For each candidate `k`, fit UBCF on training only and score validation. Select lowest validation MAE among candidates with at least one prediction; ties select smaller `k`. Validation coverage is reported with every error. Refit on train plus validation, then score test once for every preregistered `k`; validation-selected `k` is primary, remaining test metrics are descriptive only and cannot select a model. Test ratings and model outcomes never select cohort membership, items, or parameters. Users with fewer than three total pairs are train-only. If no candidate predicts a validation row, evaluator stops rather than inventing a selected configuration.

The current evaluator does not enforce a minimum-coverage acceptance threshold because no threshold has been approved. Report coverage, missing count, and missing reasons regardless; agree on any final acceptance threshold before confirmatory use.

## Metrics and baselines

For covered pairs:

```text
MAE      = mean(|prediction − actual|)
RMSE     = sqrt(mean((prediction − actual)^2))
Coverage = predicted test/validation pairs ÷ all pairs in that split
```

For every method report total pairs, predicted, missing, coverage, MAE, RMSE, and missing reasons. Compare UBCF to global-mean, user-mean, and item-mean baselines calculated from that fit's training data only. For baseline fairness, report each baseline on all held-out pairs and on each `k`-specific UBCF-covered subset. Rating error excludes unavailable predictions; coverage exposes those cases. Report graph degree/component distributions, valid neighbors per evaluation user, co-rated counts per valid user pair, and candidate-scoring missing reasons to locate coverage bottlenecks.

Top-N evaluation is not implemented in this initial pipeline. No relevance threshold has been approved; do not infer unobserved ratings are negatives. Add ranking evaluation only after relevance definition, candidate set, and metrics are prespecified.

## Reporting and limitations

Retain source version, raw checksums, rights reference, preprocessing manifest, code commit, Python version, seed, subset rule, split counts, parameters, validation selection, per-method error/coverage, and row-level test predictions. Keep source and derived rating files local unless rights explicitly permit sharing. Do not modify production engine, validation gate, database, automatic processing/publication, or catalog.

One prior local exploratory Food.com run is reported in `EXPERIMENT_RESULTS.md`; its seed `20261112` test fold is exposed and is excluded here. New comparison run details/results belong in `DATASET_SAMPLING_COMPARISON.md` and remain exploratory. Before thesis use, resolve rights and obtain advisor approval for cohort selection, minimum-coverage criteria, and evaluation protocol; use an independent confirmatory dataset/split after prespecification. Even valid benchmark estimates describe selected Food.com cohorts, not FoodRec's users or 40 foods. No Python–Altair parity claim is made.
