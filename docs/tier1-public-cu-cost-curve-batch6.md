# Tier · public Cu cost curve · batch 6 audit

Status: **RESEARCH_ONLY / Batch 6 broadening. No Tier percentile is activated.**

Batch 6 continues the post-20 strategy: prefer operations outside the dominant DRC/Chile/Peru/Zambia and Ivanhoe/Zijin/FQM/MMG clusters, and promote a row only when the contained-metal denominator and pre-by-product common pool can both be source-locked.

## Eligible upgrade: Mount Milligan

Mount Milligan was previously partial because Centerra's 2024 results label the reported copper quantity as payable copper produced. The later 2025 NI 43-101 Technical Report closes that exact blocker without relabelling payable metal.

Technical Report Table 1-1 reports historical 2024 production on a **100% production basis**:
- Cu: **57.6 Mlb contained** = 26,126.921 t;
- Au: **171.9 koz**.

Centerra's FY2024 reconciliation separately reports Mount Milligan production costs of **US$306.3m** and third-party smelting/refining/transport of **US$10.2m**. The US$195.9m by-product/co-product credits are shown separately and are not included in the canonical pre-credit pool. Batch 6 therefore source-locks a common pool of **US$316.5m**.

Using the fixed public 2024 allocation deck already locked by the pilot, the normalized research cost is **US$2.026319/lb contained Cu**. This is not the issuer's reported cash cost and is not claimed to reproduce S&P C1.

## Additional North American review kept fail-closed

| Operation | Country | Blocker |
| --- | --- | --- |
| Mount Polley | Canada | reported cash cost is net of by-product and other revenues; exact absolute pre-credit common pool not separately source-locked |
| Red Chris | Canada | Imperial disclosure is attributable 30% and net of by-product/other revenues; exact 100% physical vector plus canonical pre-credit pool not jointly source-locked |
| Robinson | United States | KGHM C1 is on payable-copper basis after by-product value; mine-level contained co-product vector and absolute pre-credit pool not source-locked in this pass |

No payable-to-contained relabelling, inferred ownership scaling, guessed by-product quantity, or reverse-engineering of issuer credits is used.

## Sample effect

Mount Milligan supersedes its prior partial row. The three newly reviewed North American rows remain partial. The unique sample therefore becomes **41 reviewed, 23 eligible and 18 partial**, covering **2,017,969.466 t contained Cu**.

Production-weight concentration improves mechanically because a source-complete Canadian operator is added:
- largest mine: **21.66%**;
- top 3: **49.11%**;
- top 5: **68.67%**;
- top 10: **85.08%**.

The builder recomputes production-weighted Q1/P50/Q3, equal-mine diagnostics and leave-largest-out diagnostics from the full 23-row sample. These values are regression-logged in `publicCuCostCurveBatch6.test.ts`; they are diagnostics only and cannot activate Tier.

## Decision

**Keep research-only.** `comparisonEnabled=false` remains mandatory. Batch 6 improves Canadian/North-American representation and demonstrates that a previously partial observation can be promoted only when the exact physical-denominator blocker is genuinely closed. The public curve still requires broader sampling and tighter common-pool semantic consistency before another activation audit can support Tier use.
