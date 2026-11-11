# Food.com sampling and connectivity comparison

**Status: exploratory, local-only. Not final or advisor-approved.** Dataset research/redistribution rights remain unverified; Kaggle labels files “Data files © Original Authors.” No RAW data, ID maps, or row-level predictions belong in Git. This analysis does not alter ratings, synthesize ratings, change production engine/DB/catalog/Altair, or imply generalization to FoodRec's 40 Indonesian foods.

## Locked design — set before new test evaluation

- Exclude seed `20261112`; its test results were already viewed.
- Run each strategy with seeds `20261113`, `20261114`, and `20261115`; cap each sample at 5,000 users.
- Build per-user pair split from deduplicated explicit ratings first, using SHA-256 rank of `(seed, source user ID, source recipe ID)`. Approximately 80/10/10; users with fewer than three pairs are train-only. Only after this split, choose users/items using **training rows only**. Test rows and metrics never determine cohort membership or thresholds.
- Common `k` selection set `{1,3,5,10}`, minimum common ratings `m=1`, existing positive explicit-cosine UBCF, weighted-mean prediction. Choose primary `k` by lowest validation MAE among nonempty candidates; ties choose smaller `k`. Report validation coverage alongside error. Refit on train+validation, score every prespecified `k` once on test; validation-selected `k` is primary, all other test values descriptive only.
- Report global-, user-, and item-mean baselines fit on training rows, on every test row and on each UBCF-covered paired subset. No fallback predictions. No test-driven threshold/model changes.
- Three seeds measure split/sample stability; they are repeated exploratory estimates on the same source release, not independent external validation.

## Prespecified subset strategies

All strategies use same per-seed SHA-256 user rank for sample cap. Item IDs never enter selection by test score.

| Strategy | Eligibility and retained edges | Expected bias / interpretation |
| --- | --- | --- |
| `hash_id` | Hash-rank all explicit-rating users; retain all their items. | Baseline avoids activity threshold before sampling; test metrics still require at least three pairs/user and are sparse. |
| `user_history` | Users with at least 5 training pairs; hash-rank/cap; retain all their items. | Conditions on training activity; estimates active-user cohort, not population. |
| `popular_recipes` | Items with at least 25 training pairs; users need at least 3 training pairs on these items; hash-rank/cap; retain only eligible items. | Conditions on item popularity and user interaction with popular items; improves support by design, not representative of long-tail recipes. |
| `k_core` | Repeatedly remove training-graph users/items with degree `<3` until stable; sample surviving users; retain induced surviving-item edges in all splits. | Training-only filtering avoids test leakage but changes graph/cohort; active dense core is not population representative. |
| `largest_component` | Find largest connected component on training-only bipartite graph; hash-rank/cap its users; retain only its recipes. | Excludes disconnected users/items; makes connectivity analyzable but estimates largest training component only. |

The full explicit graph is analyzed descriptively, not used for selection. k-core is applied to training edges, not full graph; therefore no full-graph k-core test-selection bias. Every graph-filtered estimate remains conditional on training-selected cohort. Per-manifest strategy parameters and artifact checksums are authoritative.

## Full-population connectivity

Computed from all RAW interactions after documented rating-zero exclusion and explicit-pair deduplication. User/item degrees count explicit pairs. Component node counts are bipartite user+item nodes. Degree quantiles use nearest-rank; histogram bins from manifest. Co-rated counts come from validation/test target users' positive-similarity, `m=1` training neighbors; with ratings in 1–5, all nonempty overlaps have positive cosine under current engine.

| Measure | Result |
| --- | --- |
| User-degree distribution (n, median, p90, p95, max; histogram) | Pending run |
| Recipe-degree distribution (n, median, p90, p95, max; histogram) | Pending run |
| Full graph: users, items, edges, components, largest component users/items/nodes | Pending run |
| Training graph: components and largest component | Pending run |

Previously audited source totals: 196,098 users, 226,590 interacted recipes, 1,071,520 explicit pairs after excluding 60,847 zero ratings; duplicate explicit pairs removed `0`. Reconfirm against manifests/checksums for this run.

## Per-strategy sample and connectivity results

Each cell reports mean and range across three seeds unless explicitly shown per seed. User/item/pair counts and sparsity are cohort-specific. Include full degree histograms, component count/largest component, split sizes, valid-neighbor distribution, and common-rating distribution in the table or appendix below.

| Strategy | Users | Items | Pairs | Sparsity | Train/val/test pairs | Components (subset) | Largest component (user/item nodes) |
| --- | ---: | ---: | ---: | ---: | --- | ---: | --- |
| `hash_id` | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| `user_history` | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| `popular_recipes` | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| `k_core` | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| `largest_component` | Pending | Pending | Pending | Pending | Pending | Pending | Pending |

## Evaluation results

Coverage denominator is all test rows in that strategy/seed; error denominator is only predictions and is always reported as `n`. UBCF `missing_reasons` distinguishes no valid positive-similarity neighbor (overlap/neighbor support) from valid selected neighbors that did not rate target item (candidate availability). Neighbor support reports valid neighbors per held-out user and common-rated-item counts per valid user pair. Compare the latter with missing reasons before attributing coverage failure to one stage.

| Strategy | k | Validation MAE / RMSE / coverage / n | Test MAE / RMSE / coverage / n | Test baseline MAE/RMSE all rows (n) | Baselines on same UBCF-covered rows (n) |
| --- | ---: | --- | --- | --- | --- |
| All strategies/seeds | 1, 3, 5, 10 | Pending run; report each candidate | Pending run; selected `k` primary, all candidates descriptive | Pending run: global/user/item | Pending run: global/user/item per `k` |

Report per-seed values and aggregate mean/range; do not pool predictions across seeds as if independent. Summarize trade-off between coverage and conditional error. Lower MAE at negligible coverage is not a win. Baseline all-test and paired-case metrics answer different questions and must remain separate.

## Interpretation and next design

Populate after all 15 prepared/evaluated runs finish, without changing locked design. Diagnose low coverage as:

1. **Overlap/neighbor bottleneck:** many evaluation users have zero valid training neighbors, or common-rated-item distribution is concentrated at one/two items.
2. **Candidate-scoring bottleneck:** valid neighbors exist but `neighbors_not_rated_item` dominates because none of selected neighbors rated target recipe.
3. **Selection trade-off:** active/popular/core/component cohorts improve one support measure while narrowing target population; report both, do not label it unbiased improvement.

Recommend strategy based on declared estimand, reproducibility, cohort size, coverage and paired/all-test errors together—not minimum MAE. Preserve hash-ID results as population-oriented benchmark and active/core/component results as conditional diagnostic cohorts. For confirmatory thesis work: resolve rights, obtain advisor approval for estimand/coverage threshold, freeze a new protocol, and use independent or untouched holdout. Do not reuse exposed seed `20261112` holdout or claim results apply to FoodRec users/catalog.

## Reproduction

Keep outputs outside Git under `E:\Kuliah\TA\Yusfan\Dataset\foodcom_sampling_comparison_20261113`. Use the pipeline from repository root; create unique per-strategy/seed directories. Example:

```powershell
$root = 'E:\Kuliah\TA\Yusfan\Dataset\foodcom_sampling_comparison_20261113'
$strategies = @('hash_id', 'user_history', 'popular_recipes', 'k_core', 'largest_component')
$seeds = @(20261113, 20261114, 20261115)
foreach ($strategy in $strategies) {
  foreach ($seed in $seeds) {
    $name = "${strategy}_seed${seed}"
    $prepared = Join-Path $root "prepared_$name"
    $evaluation = Join-Path $root "evaluation_$name"
    python services/recommender/scripts/foodcom_research.py prepare `
      --interactions 'E:\Kuliah\TA\Yusfan\Dataset\RAW_interactions.csv' `
      --recipes 'E:\Kuliah\TA\Yusfan\Dataset\RAW_recipes.csv' `
      --output-dir $prepared `
      --source-version 'Kaggle version 2; updated 2019-11-08; local archive verified' `
      --rights-review 'Unverified: exploratory local-only; no redistribution' `
      --seed $seed --user-limit 5000 --sampling-strategy $strategy `
      --min-user-train 5 --min-popular-user-train 3 --min-item-train 25 --core-k 3
    if ($LASTEXITCODE -ne 0) { throw "prepare failed: $name" }
    python services/recommender/scripts/foodcom_research.py evaluate `
      --data-dir $prepared --output-dir $evaluation --ks 1 3 5 10 --min-common 1
    if ($LASTEXITCODE -ne 0) { throw "evaluate failed: $name" }
  }
}
```

The pipeline refuses existing output directories. Verify each manifest and evaluation JSON SHA-256 before reporting. Keep predictions local. This document's numbers must remain pending until the complete locked run finishes.
