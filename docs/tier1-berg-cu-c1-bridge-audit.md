# Tier · Berg Cu C1 bridge audit

Status: **REPORT C1 DEFINITIONS RECONSTRUCTED / REPORT-DECK NET-REVENUE VECTOR SOURCE-LOCKED / S&P COST TIER STILL EJ VERIFIERAD**

Syfte: använda Berg som andra riktiga Cu-primary golden case efter Vizcachitas och separera tre olika saker som rapporten annars lätt får att se ut som samma mått:

1. rapporterad Cu by-product C1;
2. rapporterad co-product C1 på CuEq-denominator;
3. den net-revenue pro-rata-allokering som offentlig SNL/S&P-metodik anger på hög nivå.

Ingen Project-ekonomi eller project_json-v3-fixtur ändras av denna audit.

## 1. Source lock

Technical report:

- Surge Copper Corp., *Berg Copper Project NI 43-101 Technical Report and Pre-Feasibility Study*
- Effective date: **June 12, 2026**
- Report date: **July 28, 2026**
- prepared principally by Ausenco Engineering Canada ULC / Ausenco Sustainability ULC and Moose Mountain Technical Services

Relevant report locations:

- Section 19.1.1 / Tables 19-1 and 19-2, pp.272-273: Cu concentrate freight/marketing, TC, Cu/Au/Ag refining and payability assumptions
- Section 19.1.2 / Table 19-3, p.274: Mo freight/marketing, roasting and payability
- Section 19.2, p.274: commodity price deck
- Sections 22.2-22.3, pp.317-319: DCF convention, Q2 2026 cost basis, no inflation, 8% discount rate, FX and royalty/off-site assumptions
- Table 22-3, pp.320-321: project economics summary, payable quantities, total C1 inputs and published by-product/co-product C1
- Table 22-4, pp.322-324: annual gross revenue, product-level off-site cost, product-level net revenue, royalty, operating cost and annual C1 rows

## 2. Existing Project reconciliation remains unchanged

The existing Berg golden fixture uses the report timeline exactly:

- Years **-3, -2, -1** construction;
- production Years **1-28**;
- final Year **29** for closure / salvage / working-capital terminal effects;
- `masterN = 31`, `productionStartPeriod = 3`.

Report economic assumptions used by the reconciliation:

- Cu: **US$4.75/lb**
- Mo: **US$20.00/lb**
- Ag: **US$45.00/oz**
- Au: **US$3,500/oz**
- CAD:USD: **0.73**
- discount rate: **8%**
- discount convention: **mid-period**
- costs: **constant Q2 2026 Canadian dollars**, no inflation/escalation

The existing V3 reconciliation remains within the explicit 2% relative tolerance:

| Metric | Report | Canonical V3 | Difference |
|---|---:|---:|---:|
| NPV8 post-tax | US$3,352.160m | US$3,335.787m | -US$16.373m (-0.4884%) |
| IRR post-tax | 23.790% | 23.7356% | -0.0544 percentage points (-0.2287% relative) |
| NPV8 pre-tax | US$4,826.030m | US$4,809.136m | -US$16.894m (-0.3501%) |
| IRR pre-tax | 23.760% | 23.7199% | -0.0401 percentage points (-0.1689% relative) |

The annual report cash-flow rows are rounded to C$ millions; the golden suite therefore also keeps the existing period-by-period FCFF rounding tolerance.

## 3. What Berg reports as C1

Table 22-3 reports:

- **C1 by-product basis: -0.17 USD/lb Cu**
- **C1 co-product basis: 1.95 USD/lb CuEq**

The footnotes define them differently.

### 3.1 By-product basis

Footnote 1:

```text
C1 = mine + mill + G&A + off-site costs + royalties - by-product credits
```

The Table 22-4 annual identities prove that the denominator is **payable Cu**, not recovered/contained Cu. For Year 1:

- total operating cost: C$615.8m
- off-site: C$156.8m
- royalty: C$22.3m
- Mo + Ag + Au gross revenue: C$901.2m
- payable Cu: 228 Mlb

Translated with the report FX, this reconstructs approximately **-0.34035 USD/lb**, matching the published Year-1 **-0.34 USD/lb** row.

Using the Table 22-3 LOM totals reconstructs **-0.16847 USD/lb payable Cu**, matching the reported **-0.17 USD/lb**.

Therefore the Berg by-product checkpoint can now be source-classified as:

- basis: `net_by_product`
- denominator: `payable_primary_metal`
- by-product treatment: credited
- off-site: included
- royalties: included
- cost base year: 2026

It remains **not comparable** with the S&P co-product curve because the costing basis differs.

### 3.2 Reported co-product basis

Footnote 3 defines C1 as:

```text
mine + mill + G&A + off-site costs + royalties
```

Footnote 5 defines CuEq as:

```text
Cu mass
+ Mo mass × (Mo price / Cu price)
+ Ag mass × (Ag price / 1000 / Cu price)
+ Au mass × (Au price / 1000 / Cu price)
```

Table 22-3 gives:

- on-site operating costs: C$18,130.5m
- off-site costs: C$3,434.5m
- royalties: C$502.7m
- payable CuEq: 8,253 Mlb

After applying CAD:USD 0.73:

```text
(18,130.5 + 3,434.5 + 502.7) × 0.73 / 8,253
= 1.95195 USD/lb CuEq
```

This reconstructs the published **1.95 USD/lb CuEq**.

## 4. Key finding: Berg's reported CuEq C1 is a gross-value allocation identity

Table 22-4 gives LOM gross revenues:

- Cu: C$30,548.8m
- Mo: C$16,334.3m
- Ag: C$4,917.7m
- Au: C$1,899.2m
- total: C$53,700.0m

Cu therefore contributes approximately **56.8879% of gross payable metal value**.

If the same report C1 pool is allocated to Cu by that gross-value share and divided by payable Cu, the result is:

- **1.95193 USD/lb payable Cu**.

That is effectively identical to the report's **1.95195 USD/lb CuEq** reconstruction.

This is not an accident. The report CuEq denominator is mathematically another representation of gross metal-value weighting when the same payable quantities and price deck are used.

**Consequence:** the published 1.95 co-product checkpoint is useful evidence, but it is not yet the same definition as SNL/S&P's publicly described **net-revenue pro-rata** method.

## 5. Berg is much stronger than Vizcachitas on the allocation vector

Unlike Vizcachitas, Berg Table 22-4 explicitly publishes product-level annual off-site and net-revenue rows.

LOM net revenue totals are:

- Cu: **C$28,026.9m**
- Mo: **C$15,473.4m**
- Ag: **C$4,868.6m**
- Au: **C$1,896.7m**

The published report-deck Cu net-revenue share is therefore approximately **55.7576%**.

Using that LOM aggregate share with the same Berg report C1 pool gives a diagnostic:

- **1.91315 USD/lb payable Cu**.

Using the published **annual** Table 22-4 net-revenue vector and applying the generic allocator period by period to the rounded annual canonical/report C1 pool gives:

- **1.92336 USD/lb payable Cu**.

The difference between 1.913 and 1.923 is not treated as an error. The two calculations use different aggregation conventions and the annual report rows are rounded. The Tier allocator conserves the selected source cost pool exactly.

Both values are diagnostic only.

## 6. Why the S&P cost gate is still fail-closed

Berg materially narrows the earlier problem, but does not close it.

### Closed for Berg at report-deck/source level

- payable Cu denominator is source-verifiable;
- Berg has no stream contract, so generic stream-treatment uncertainty is not project-applicable;
- product-level **published net revenue** is available by Cu, Mo, Ag and Au;
- no guessed decomposition of aggregate selling cost is needed to reproduce the PFS report-deck net-revenue vector.

### Still open for S&P benchmark compatibility

1. **Exact benchmark-compatible allocation revenue/price basis — Ej verifierad.** Berg gives an exact published net-revenue vector under its PFS long-term price deck. We still do not have direct public evidence proving which price/revenue basis should be imposed on a pre-revenue project to make its allocation comparable with the S&P 2024 actual curve. Therefore the global `exact allocation revenue/price vector` blocker remains.
2. **Full current C1 component boundary — Ej verifierad.** Berg's report C1 explicitly includes on-site operating cost, off-site cost and royalties. Santa Cruz's S&P comparison uses a mining + processing + G&A bridge with royalty shown separately. Public evidence still does not justify silently forcing either project's numerator convention onto every S&P observation.
3. **Cost-vintage alignment — Ej verifierad.** Berg costs are constant **Q2 2026 C$**, while the benchmark is **2024 actual**. No inflation/index normalization is inserted without a verified benchmark normalization rule.

**Tier Cu Cost status for Berg: Ej verifierad.**

## 7. Implementation changes in PR #516

`bergCostBridge.test.ts` now locks:

- LOM by-product C1 reconstruction;
- Year-1 payable-Cu denominator identity;
- LOM and Year-1 CuEq co-product reconstruction;
- mathematical equivalence between Berg CuEq C1 and gross-value pro-rata allocation;
- the published annual net-revenue vector by Cu/Mo/Ag/Au;
- period-by-period net-revenue allocation conservation;
- separation between report-deck diagnostics and the still-unverified S&P allocation price basis;
- project-specific no-stream context;
- the exact remaining external blockers.

The reported-cost fixture semantics are also tightened: Berg's by-product checkpoint is now explicitly classified as payable-Cu rather than denominator-unknown.

No allocation metadata is written into the Berg project fixture yet. The remaining component-boundary and benchmark-basis questions make that premature.

## 8. Next step

Berg shows that the architecture can ingest a genuinely rich multi-product PFS without inventing an allocation vector. The next golden case should be **Warintza**, because it tests the opposite hard case:

- payable Cu checkpoint is already close to the benchmark denominator;
- Cu/Au/Ag/Mo are present;
- the Au stream means stream treatment is genuinely project-applicable rather than removable as in Vizcachitas and Berg.

That is the most informative next stress test for the current fail-closed contract.
