# Tier cost position · methodology pivot 2026-09-02

Status: **binding design record for PR #516**. This document explains why the cost-position work deliberately became less numerically decisive than the first public-curve design. The reduced apparent precision is intentional and must not later be “fixed” without an explicit new methodology decision.

## The problem we found

The first public-Cu path aimed at a highly source-locked, homogeneous cost curve with exact weighted Q1/P50/Q3 boundaries. That work remains useful, but the apparent precision of the final percentile classification exceeded the precision carried by the underlying mining evidence.

A technical report can state a cost in 2022-, 2023-, 2025- or 2026-dollar terms. A producer cost curve can be actual 2024. A PEA/PFS/FS number is an engineering estimate for a future operation, while a producer observation is an operating outcome. Even when both numbers use the same nominal metric label, a difference of a few cents per pound can reflect cost vintage, labour/energy/reagent/freight/TC-RC conditions, estimate class, or operating reality rather than a durable difference in mine quality.

If Instrumentbrädan transforms every project cost into its own synthetic common-year number, it starts measuring the project against **our model of the mine** rather than the mine/report itself. That is the wrong direction for the intended Tier engine.

## Decision

The governing rule is now:

> **Beräkna exakt. Klassificera bara med den precision som underlaget faktiskt bär.**

And more specifically:

> **Normalisera definitionen, men normalisera inte ekonomin för att få projektet att passa benchmarken.**

The exact report/project cost remains the measurement. A reference curve is a yardstick and may describe a raw relative position, but it must not silently rewrite the project.

## What stays precise

The following work remains strict and is not relaxed by this pivot:

- exact source/page/table provenance;
- exact cost definition and denominator;
- payable vs contained vs produced identity;
- co-product/by-product treatment;
- inclusion/exclusion of mining, processing, site G&A, TC/RC, freight, royalties, sustaining capital etc.;
- physical co-product vector;
- report cost base year when disclosed;
- Project JSON reconciliation rules;
- public-curve observation inclusion remains fail-closed.

Precision is still required to prevent calculation and semantic errors. The pivot concerns the **strength of the conclusion**, not the quality of the underlying reconstruction.

## What we explicitly do NOT do

Instrumentbrädan must not introduce any of the following merely to obtain a neat percentile:

- generic CPI uplift/downlift from one cost year to another;
- implicit FX rebasing;
- a synthetic “2024 equivalent C1” for a 2026 PFS;
- an invented ±x% vintage uncertainty band;
- guessed mine-cost escalation based on broad inflation;
- relabelling a PEA/PFS/FS estimate as an operating actual;
- turning a research-only public curve into a hard Tier gate because its sample count is large enough.

If an empirical cost-vintage model is ever introduced, it must be a separate, sourced and tested research decision. It may not appear as an innocent utility function or convenience conversion.

## New evidence fields

Cost-position assessment now carries two facts separately from the numeric value:

`costBaseYear`
: The economic cost vintage actually supported by the source. `null` means unknown; it is not inferred from publication year.

`costEvidenceClass`
: One of `ACTUAL_OPERATION`, `FS_ESTIMATE`, `PFS_ESTIMATE`, `PEA_ESTIMATE`, `OTHER_ESTIMATE`, `UNKNOWN`.

These fields describe the evidence. They do not alter the measured cost.

## New reference-position layer

`src/lib/tier1/costPosition.ts` implements a deliberately non-Tier reference assessment.

It preserves:

- `measuredCost` exactly as supplied;
- `costBaseYear`;
- `costEvidenceClass`;
- the reference curve year and boundaries.

It may describe the unadjusted number as:

- `BELOW_Q1_REFERENCE`;
- `Q1_TO_P50_REFERENCE`;
- `P50_TO_Q3_REFERENCE`;
- `ABOVE_Q3_REFERENCE`.

That is a **raw reference position**, not a claim that the project truly occupies that percentile in a common economic universe.

The assessment also states comparability:

- `DIRECT_REFERENCE` — only possible for an explicitly activated reference, same cost vintage and `ACTUAL_OPERATION` evidence;
- `REFERENCE_ONLY` — useful contextual comparison, but not a hard cost classification;
- `NOT_COMPARABLE` — essential evidence such as cost base year/evidence class is missing or invalid.

Critically, this layer always returns `hardTier: null`. It is impossible for it to activate Cost Tier by accident.

## Public Cu curve after the pivot

The Batch-6 public curve remains valuable as a 2024 producer reference distribution:

- 41 reviewed operations;
- 23 source-complete observations;
- 2,017,969.466 t contained Cu;
- production-weighted Q1/P50/Q3 = 1.6531976 / 1.9310822 / 2.1142360 USD/lb contained Cu;
- `comparisonEnabled=false` / research-only.

Its role has changed conceptually. The goal is no longer “determine an exact project percentile to enough decimal places”. The goal is “provide a broad, definitions-controlled reference distribution against which a project's unaltered reported/canonical cost can be contextualised”.

The existing concentration/robustness diagnostics remain important because the reference itself must not be dominated by a handful of operations. But a perfectly stable reference curve would still not justify pretending that a 2026 PFS estimate and a 2024 operating actual are the same evidence class.

## Example: a future Crean Hill PFS

Suppose a 2026 PFS yields a source-locked canonical cost of 1.58 USD/lb on a definition compatible enough to display against the public Cu reference.

The system should preserve:

- measured cost: **1.58 USD/lb**;
- cost base year: **2026**;
- evidence class: **PFS_ESTIMATE**;
- 2024 public Q1 reference: **1.653 USD/lb**;
- raw reference position: **BELOW_Q1_REFERENCE**;
- comparability: **REFERENCE_ONLY**;
- adjusted cost: **none**;
- hard Cost Tier: **none**.

It must not manufacture a 2024-equivalent Crean Hill cost and then classify the synthetic number.

## Why the result may look “imprecise” later

A future developer or chat may notice that Instrumentbrädan has exact source-locked cost numbers and exact Q1/P50/Q3 boundaries, yet sometimes refuses to say “Q1” or “Tier 1 cost”. That is **not an unfinished feature**.

It is deliberate. The exact numbers answer different questions:

- the project number answers “what does this source/model say this mine costs?”;
- the reference number answers “where did comparable operating observations sit in this reference year?”;
- the final classification must respect the gap between those questions.

Do not remove `REFERENCE_ONLY`, invent a common-year adjustment, or tighten the raw reference position into a hard percentile simply because the UI looks less decisive.

## What would justify a later stronger classification

A later “robust low-cost” rule may be built, but its tolerance must come from evidence rather than preference. The preferred next research is to study year-to-year cost-position movement for mines with source-complete actual observations across several years and measure how stable Q1/P50 placement really is. Similar work is needed for estimate-vs-actual error by study class where enough history exists.

Only after that empirical work should we consider a rule such as “far enough below Q1 to be robustly low-cost”. The distance must not be invented in advance.

## Relationship to S&P and public research

S&P remains an external reference/cross-check where its published semantics are known. Its proprietary fields must not be reverse-engineered. The public curve remains a separate canonical research metric. Neither should be calibrated to match the other numerically.

## Binding implementation guard

Before any future PR turns a technical-report cost into a hard percentile/Tier classification, it must answer all of the following explicitly:

1. What exact cost definition is being compared?
2. What is the project's verified `costBaseYear`?
3. What is its `costEvidenceClass`?
4. What is the reference's data year and evidence class?
5. Is any economic rebasing being applied? If yes, what sourced empirical model justifies it?
6. Why does the evidence support the claimed classification precision?

If these questions cannot be answered, the correct result is reference-only or `Ej verifierad`, not a synthetic precise percentile.
