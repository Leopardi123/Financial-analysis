# Tier · Vizcachitas Cu C1 bridge audit

Status: **PROJECT REPORT C1 RECONSTRUCTED / S&P CO-PRODUCT C1 STILL EJ VERIFIERAD**

Syfte: använda Vizcachitas som första riktiga golden case för den nya polymetalliska Cu-cost-arkitekturen utan att ändra Project-ekonomin eller skriva osäker allocation-metadata i den reconcilerade `project_json_v3`-fixturen.

## 1. Source lock

Technical report:

- Los Andes Copper Ltd., *Vizcachitas Project Pre-Feasibility Study*, NI 43-101 Technical Report
- Effective date: 20 February 2023
- Report date: 30 March 2023
- prepared by Tetra Tech Sudamérica S.A.

Relevant report locations:

- Table 19.1 p.313: report commodity prices
- Table 19.2 p.315: concentrate selling assumptions
- Table 21.6 p.346: operating-cost unit rates
- Section 21.2.3 and Table 21.11 p.349: report C1/C3/AISC definitions and first-8/LOM metrics
- Section 22.1.1 p.350: report period axis
- Table 22.1 p.351: economic parameters
- Table 22.6 pp.357-358: physical production and payable quantities
- Table 22.7 pp.359-362: annual cash-flow model output
- Table 22.8 p.363: NPV/IRR and financial results
- p.363: LOM net-revenue contribution statement, Cu 88%, Mo 10%, balance Ag

## 2. Existing Project reconciliation remains unchanged

No Project fixture or Project economic input is changed by this audit.

The existing golden fixture remains source-locked to:

- periods: Section 22.1.1 p.350 and Tables 22.6-22.7 pp.357-362;
- prices: Cu **3.68 USD/lb**, Mo **12.90 USD/lb** represented canonically as **28,439.63182122 USD/t**, Ag **21.79 USD/oz**;
- NPV/IRR: Table 22.8 p.363;
- discount rate: **8%**, mid-year convention in the canonical reconciliation.

Existing reconciliation result from the V3 golden suite:

| Metric | Report | Canonical V3 | Difference |
|---|---:|---:|---:|
| NPV8 post-tax | 2,776.000 MUSD | 2,775.728 MUSD | -0.272 MUSD (-0.0098%) |
| IRR post-tax | 24.200% | 24.2241% | +0.0241 percentage points (+0.0994% relative) |
| NPV8 pre-tax | 3,999.000 MUSD | 3,998.498 MUSD | -0.502 MUSD (-0.0125%) |
| IRR pre-tax | 28.500% | 28.5263% | +0.0263 percentage points (+0.0921% relative) |

This audit therefore does not require any economic-series change to make the Project reconcile.

## 3. What Vizcachitas itself calls C1

Section 21.2.3 states that Vizcachitas C1:

- includes **site operating costs: mining and processing**;
- excludes indirect costs, head-office G&A and exploration;
- is calculated per **pound copper produced**.

Table 21.11 reports:

| Metric | First 8 operating years | LOM |
|---|---:|---:|
| Mining | 0.47 USD/lb Cu | 0.71 USD/lb Cu |
| Processing | 0.46 USD/lb Cu | 0.54 USD/lb Cu |
| **C1** | **0.93 USD/lb Cu** | **1.25 USD/lb Cu** |
| Surface infrastructure | 0.14 | 0.17 |
| Indirects | 0.04 | 0.04 |
| Royalty | 0.09 | 0.10 |
| C3 | 1.19 | 1.56 |

The report therefore gives us a strong internal definition oracle: **Vizcachitas C1 = mining + processing / produced Cu**, not a payable-Cu co-product metric.

## 4. Canonical reconstruction of the report metric

Using the existing Table 22.7 canonical dollar series and Table 22.6 physical quantities:

### First eight operating years

Canonical mining + processing pool divided by contained/produced Cu reconstructs:

- **0.920506 USD/lb produced Cu**
- report Table 21.11: **0.93 USD/lb**
- difference: **-0.009494 USD/lb**, within one cent and consistent with rounded annual report rows versus the report's underlying model.

Using the *same* canonical cost pool but changing only the denominator to payable Cu gives:

- **0.953876 USD/lb payable Cu**

That is about **3.34 cents/lb higher** than the reconstructed produced-Cu metric. Produced and payable Cu are therefore not interchangeable for this project.

### LOM

The Table 22.7 total Mining Opex includes mining activity in pre-production periods and the total Processing Opex also contains a small post-production/closure-period amount. The C1 bridge must therefore use only periods with positive Cu production. Canonical producing-period mining + processing divided by contained/produced Cu reconstructs:

- **1.241129 USD/lb produced Cu**
- report Table 21.11: **1.25 USD/lb**
- difference: **-0.008871 USD/lb**, within one cent.

This strongly verifies that the canonical Project cost rows preserve the PFS report C1 basis while also preventing non-producing-period cost from being silently placed in the operating C1 numerator.

## 5. Why this is not yet the S&P co-product C1 metric

The external Tier benchmark currently requires:

- exact product: Cu;
- paid/payable Cu denominator in lb;
- co-product/pro-rata costing;
- common costs allocated on a net-revenue basis;
- benchmark vintage: 2024 actual.

Vizcachitas differs immediately on the report checkpoint because its reported 0.93/1.25 C1 uses **produced Cu** and is not presented as a net-revenue co-product allocation.

The report does, however, give strong commercial evidence:

- Table 19.2 specifies Cu and Ag payabilities, Cu TC/RC, Ag refining, concentrate freight, transport loss, SG&A, financing, and Mo roasting/leaching/freight terms;
- Table 22.6 provides annual contained and payable Cu, Mo and Ag quantities;
- Table 22.7 provides annual metal values;
- p.363 says LOM net revenue contribution is approximately **88% Cu, 10% Mo, balance Ag**.

The remaining problem is not lack of commercial assumptions. It is that Table 22.7 reports **Selling & Payability Expenses as one aggregate multi-product line**. The report does not expose an exact annual net-revenue vector by product, and the 88/10/2 LOM statement is rounded.

No implicit decomposition of that aggregate line is allowed.

## 6. Diagnostic only: what gross payable revenue would do

Using the report price deck and the existing payable-quantity arrays for the first eight operating years gives a gross-payable revenue share for Cu of approximately:

- **89.8448% Cu**.

If the report-defined mining + processing pool were mechanically allocated using that **gross payable revenue** share and divided by payable Cu, the result would be approximately:

- **0.855793 USD/lb payable Cu**.

This number is intentionally regression-tested as a **diagnostic only**. It is *not* an S&P-compatible C1 because SNL/S&P methodology evidence calls for **net revenue**, not gross payable revenue. Tier must not use this 0.856 figure for a percentile classification.

Likewise, the PFS's rounded LOM statement of 88% Cu / 10% Mo / ~2% Ag is useful source evidence but is not silently promoted to an exact allocation vector.

## 7. Component classification for the golden case

Current canonical V3 components can be classified against the **Vizcachitas report definition** without ambiguity:

| Canonical component | Viz report C1 | S&P current C1 allocation status |
|---|---|---|
| `mining_opex` | included in producing periods | allocation metadata not yet authorized |
| `processing_opex` | included in producing periods | allocation metadata not yet authorized |
| `stockpile_rehandling` | separate Table 22.7 line; not silently folded into report mining+processing C1 | Ej verifierad |
| `surface_infrastructure` | outside Viz report C1; enters C3 | current S&P universal treatment Ej verifierad |
| `site_ga` | outside Viz report C1 | Santa Cruz supports G&A in its 1.32 bridge, but current S&P universal boundary remains Ej verifierad |
| aggregate `selling_payability...` | outside Viz report C1 / part of realization economics | product decomposition missing; cannot provide exact allocation vector |
| `receivables_finance_advance` | not a report C1 component | not authorized for S&P C1 |
| project NSR / mining royalty tax | outside Viz report C1 | current S&P universal treatment Ej verifierad |

Therefore **no allocation metadata is written into the Vizcachitas fixture yet**.

## 8. Project-specific readiness after method audit

Vizcachitas has `streamsByMetal: null`. The unresolved generic S&P treatment of streams is therefore **not applicable to this project** and should not block Vizcachitas specifically.

Three blockers remain:

1. **Exact allocation net-revenue / price vector — Ej verifierad.** The PFS gives terms and rounded LOM shares but not an exact annual net-revenue vector by product.
2. **Full current S&P C1 component boundary — Ej verifierad.** Santa Cruz is strong evidence for a mining + processing + G&A core and royalty exclusion in that comparison, but public evidence still does not prove the universal treatment of TC/RC, freight/marketing, royalties and other realization charges for every observation in the 2024 curve.
3. **Cost-vintage alignment — Ej verifierad.** Vizcachitas is a 2023-US$ real PFS while the S&P curve is 2024 actual. No unverified inflation/index proxy may be inserted merely to force vintage compatibility.

**Tier Cu Cost status for Vizcachitas: Ej verifierad.**

## 9. Implementation consequence

`vizcachitasCostBridge.test.ts` now locks the source-supported findings:

- report-defined mining + processing reconstruction;
- producing-period guard for LOM C1;
- produced-Cu versus payable-Cu denominator mismatch;
- report price deck used for diagnostics;
- no-stream project context;
- gross-revenue diagnostic kept separate from net-revenue allocation;
- exact remaining blockers.

The next implementation step is **not** to tag Vizcachitas costs speculatively. It is to close either the exact net-revenue vector from source evidence or the remaining external S&P component/vintage contract. Until then the cost gate must remain fail-closed.
