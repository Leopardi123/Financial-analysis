# Cost semantics foundation

This branch treats reported project cost as evidence first and benchmark classification second.

## Single source of truth

`economicsBreakdown.reportedCostMetrics[]` is the canonical storage location for cost metrics explicitly reported by a PEA/PFS/FS. The same evidence reader and compatibility guard must be used by every Tier caller. Do not add project-, metal-, label-, or route-specific cost overrides.

## Evidence vs benchmark claim

A report can provide an exact C1/AISC value even when its definition is not comparable with the selected external benchmark. Preserve the value and provenance. Fail closed only on the benchmark claim.

## Semantic dimensions

New reported cost evidence may describe `primaryMetal`, `basis`, `denominator`, `period`, `byProductTreatment`, `royaltyTreatment`, `offSiteTreatment`, `costBaseYear`, and `quality`. Unknown means unknown; missing information must never be treated as zero or inferred from free text.

Legacy `basisId` remains readable only for backward-compatible benchmark proof. New project JSON should describe the report semantics rather than copy a benchmark ID.

## Multiple metrics

A single report may contain multiple valid metrics with the same family. Berg PFS is the regression case: C1 by-product basis and C1 co-product basis coexist and must not be resolved by array order. LOM is preferred over a first-N-years metric only when the competing entries otherwise describe the same semantic definition. Semantically different LOM candidates are ambiguous until a benchmark-compatible resolver selects one.

## Coverage rule

Strict means no false benchmark claim, not loss of source evidence. UI/API should retain reported cost evidence even when cost quartile is not verified. Canonical reconstruction is a later fallback for reports that do not publish the needed metric.
