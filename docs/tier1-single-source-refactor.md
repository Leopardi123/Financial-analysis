# Tier single-source refactor

Scope guard: this refactor changes only functionality introduced for Compare Stocks → Pre Revenue Tier. No pre-existing Project or Corporate economic field, formula, engine, aggregation, financing path, or project-shift behavior may be removed or changed.

Tier now treats the existing project economic model as the single source of truth. An explicit reported cost in `economicsBreakdown.reportedCostMetrics` may override the engine-derived Tier cost when usable; otherwise the existing engine-derived result remains in place. Missing report-reconciliation metadata, benchmark basis IDs, source page/table, or cost-vintage metadata do not invalidate an otherwise computable Tier result.

The project JSON Tier extension is reduced to optional `reportedCostMetrics` entries with only `metric`, `value`, and `unit`. The Tier-only PEA/PFS/FS reconciliation contract and hard guard have been removed from the active project JSON/template and Tier UI. Existing Project/Corporate economics remain untouched.
