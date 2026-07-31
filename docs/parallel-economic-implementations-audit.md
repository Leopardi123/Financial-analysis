# Fas 2 — audit av parallella ekonomiska implementationer

## 1. Executive summary

Fas 2 startades först efter att Fas 1 hade verdict **FIXED** och dess regressioner passerade. Denna fas ändrar ingen runtime-logik. Det enda körbara tillägget är det isolerade auditverktyget `scripts/debug/parallelEconomicImplementationsAudit.ts`.

De viktigaste fynden är:

1. Project Phase 1 och snapshotens live reconstruction duplicerar EBITDA, sustaining-adjusted operating earnings, EBIT, taxable income, tax och FCFF. De är numeriskt identiska efter Fas 1, men är den högsta framtida drift-risken.
2. DCF vid production start är numeriskt identisk i `computeProjectPhase2`, Lista 2 och canonical timeline för samma fullständiga input. Null-policy och nodsemantik skiljer sig däremot.
3. NPV today är numeriskt identisk mellan Phase 2 och canonical timeline när `todayPeriod=0`, samma år/grid och samma FCFF används. Future-node NPV i timeline är ett annat koncept eftersom den drar initial CAPEX före noden.
4. IRR har en gemensam solver (`computeIrr`) med flera wrappers. Root-resultaten är identiska; wrapperoutputs/debug skiljer sig.
5. Payback har tre självständiga implementationer. De kan sammanfalla i normalfallet men divergerar när “investment” definieras som explicit initial CAPEX respektive pre-production FCFF deficit.
6. AISC har minst tre implementationer/omräkningar och kan divergera på denominatorn: Project AuEq bygger gross revenue/Au price, medan live Corporate kan använda faktisk Au payable.
7. Corporate gör mer än kalenderaggregering: egen DCF/NPV/NAV, financing waterfall, net-cash/share bridge, IRR/payback/AISC och EV/EBITDA. Den konsoliderar däremot inte skatt och har ingen inkopplad corporate-G&A-overlay.

## 2. Klassificeringsnyckel

- **A — Shared core/wrappers:** wrappers anropar samma kärnfunktion.
- **B — Duplicate identical:** egen matematik dupliceras men är identisk för samma input/domain.
- **C — Same name/different definition:** samma label representerar olika ekonomiska begrepp.
- **D — Different name/same definition:** semantiskt samma värde med olika fältnamn.
- **E — Intentional specialization:** medvetet annan nod, period, currency eller bridge.
- **F — Unintentional divergence:** samma avsedda värde ger olika resultat.

## 3. Komplett inventering och producer–consumer-tabell

| Koncept | Implementationer (fil/funktion) | Formel/output | Consumers | Klass |
|---|---|---|---|---|
| Revenue per metal | `project/revenue/computeRevenueByMetal.ts:31–147`; wrapper `revenue/engine.ts:39–55` | `effectiveQty×spot + delivered×streamPrice` | take, gross revenue, snapshot/UI | A |
| Gross revenue | `computeRevenueByMetalUSD:125–138`; snapshot `runCorporateSnapshot.ts:816–824`; UI fallback `projectGridPnl.ts` | `Σ metal revenue` | royalties, Phase 1, AISC, UI | B; UI är fallback |
| Royalties | legacy `take/compute.ts`; MVI `take/computeTakeMvi.ts:331–450`; detail `royalties/mvi.ts`; precedence `nationalTake/engine.ts:83–116`; helper `runCorporateSnapshot.ts:60–68` | Revenue/metal base × fixed/tier rate; precedence väljer serie | EBITDA/driftmått/AISC/UI | C/E |
| Operating costs/site G&A/BP/reclamation | Phase 1 raw inputs; live reconstruction; UI fallback | Direkta periodkomponenter | båda rörelsemått, tax/FCFF, AISC/UI | B |
| Verklig EBITDA | `computeProjectPhase1`; live reconstruction; `projectGridPnl`/operations-grid fallback | `R-op-ga-roy-rec+bp` | Corporate aggregation, EV/EBITDA, UI | B efter Fas 1 |
| Sustaining-adjusted operating earnings | `computeProjectPhase1`; live reconstruction; UI fallback | `EBITDA-sc` | EBIT/tax chain och UI | B efter Fas 1 |
| Depreciation | Raw series + safe-zero i Phase 1/live | `dep` | EBIT, tax shield, FCFF addback | D |
| EBIT | Phase 1; live reconstruction; UI fallback | `operating earnings-dep` | taxable/tax/NOPAT/ROCE/UI | B |
| Taxable income | Phase 1; live reconstruction; UI fallback | `max(0, EBIT)` | Tax | B |
| Tax | Phase 1; live reconstruction; stress scenario recomputation | `taxable×rate` | NOPAT/FCFF | B/E |
| NOPAT | Phase 1; Corporate NOPAT reconstruction for Lista 3 | `EBIT-tax` | FCFF/ROIC | B |
| Initial CAPEX | Phase 1 `capexUSD`; Lista 2 `deriveInitialCapexUSD`; timeline `initialCapexBefore`; financing build need/waterfall | Olika pre-tp windows/signed policies | FCFF, NPV nodes, financing, payback | C/E |
| Sustaining CAPEX | Phase 1 driftmått; `totalCapexUSD` reporting; AISC; stress | `−sc` en gång i cash chain efter Fas 1 | Tax/FCFF indirect, AISC/UI | D; totalCapex är annan output |
| Closure/reclamation | Phase 1; stress last-period multiplier; timeline last-period phase | Period OPEX kontra UI phase | EBITDA/tax/FCFF/AISC/UI | C |
| Working capital | Phase 1/live; UI fallback | `FCFF -= ΔWC` | DCF/IRR/payback | B |
| FCFF | Phase 1; live reconstruction; UI fallback | `EBIT-tax+dep-capex-ΔWC` | Phase 2, Corporate sum, valuation, waterfall | B efter Fas 1 |
| Discount factors | Phase 2 `computeDfToToday`; Lista 2 inline; canonical timeline inline; aggregate/overhead local loops | `1/(1+r)^exponent` | DCF/NPV | B/E |
| DCF | Phase 2; Lista 2; canonical timeline; Corporate aggregate; modeled timeline | Remaining FCFF discounted to today/tp/node | tables/graphs/scenarios | B vid samma nod; E mellan noder |
| NPV | Phase 2; Corporate aggregation; Lista 2 input; timeline; overhead overlay | Today discounted FCFF; future timeline NPV har CAPEX bridge | NAV/financing/UI | C/E |
| NAV | financing engine; corporate snapshot override; canonical timeline; Project view | `NPV+cash-debt` med olika cash definition | graph Low/P-NAV/tables | C/E |
| Enterprise Value | corporate market-value engine; Project view; Producer Core | `marketCap+debt-cash+adjustments` | market box ratios | B/C mellan data domains |
| EV/EBITDA | Corporate modeled timeline; Producer Core reported | Modeled 5/6/7× equity bridge kontra current EV/reported EBITDA | graph respektive revenue-mode UI | C/E |
| IRR | kärna `metrics/lista3.ts:71–174`; Phase 2; Lista 3; scenario node | Root of NPV; gemensam solver | UI/debug/scenarios | A |
| Payback | `computeLista3`; `computeLista3aProjectEfficiencyMetrics`; `computeProjectPreRevenueView` | Odiscounterad cumulative crossing, olika investment base | UI/debug/scenarios | F/C |
| AISC | `computeProjectAisc`; `computeCorporateAiscLom`; snapshot inline recomputation | `Σ sustainingCost / Σ payableAuEq` | UI/efficiency | C/F för multi-metal |
| Corporate calendar aggregation | `corporate/aggregateProjects.ts`; snapshot `sumStrictAlignedSeries`; `aggregateProjectsToCorporateTotals` | Strict sum by year respektive index helper | Corporate series/stress | C/E |
| Production-start valuation | Phase 2; Lista 2; canonical selector; milestone scalar helper | DCF at tp och present-to-today | Project/Corporate tables/graph | B/E |
| Per share | corporate perShare engine; Lista 2 helpers; canonical timeline; Project view; EV/EBITDA inline | value / selected shares | all equity UI | B/C |
| Financing shares/net cash | `computeCorporateFinancing`; period waterfall; pipeline overrides; timeline | current+new+FD shares; post/NAV net cash | NAV/EV/per-share | C/E |

## 4. Dependency graph med paralleller

```text
payable + price
  └─ computeRevenueByMetalUSD
       └─ computeProjectRevenue wrapper
            ├─ take legacy / take MVI / royalty detail ──precedence──> royalties
            └─ gross revenue
                    │
                    ├─ computeProjectPhase1 (Project core) ───────────────┐
                    └─ runCorporateSnapshot live reconstruction (dup) ───┤
                                                                         v
       EBITDA (information)       sustaining-adjusted earnings → EBIT → tax → NOPAT
                  │                                      │
                  └─ EV/EBITDA                          FCFF
                                                         ├─ computeProjectPhase2
                                                         ├─ Lista 2
                                                         ├─ canonical timeline
                                                         ├─ Corporate aggregate/local DCF
                                                         ├─ IRR wrappers → computeIrr
                                                         ├─ payback implementation 1/2/3
                                                         └─ cash waterfall financing

Corporate calendar:
  aggregateProjectsCorporateV1 ─┐
  sumStrictAlignedSeries ───────┼─> Corporate series
  aggregateProjectsToTotals ────┘
                                  ├─ own DCF/NPV/NAV
                                  ├─ own IRR/payback/AISC
                                  ├─ financing cash/debt/shares
                                  └─ per-share + graph selectors
```

## 5. Formel-/policy-matris

| Koncept | A | B | Identiskt för samma input? | Policyavvikelse |
|---|---|---|---:|---|
| EBITDA | Phase 1 | live reconstruction | Ja | UI fallback har färre inputs när backendserie saknas. |
| Driftmått | Phase 1 | live reconstruction | Ja | UI fallback `EBITDA-sc`. |
| FCFF | Phase 1 | live reconstruction | Ja | UI fallback kan safe-zero annorlunda. |
| DCF at tp | Phase 2 | Lista 2/timeline | Ja | Lista 2 nollar null-perioder; Phase 2 kräver strict finite post-tp. |
| NPV today | Phase 2 | timeline today | Ja | Endast om today=0/samma axis; timeline kan rebasa valuation year. |
| Future NPV | Phase 2 saknar | timeline | Nej/specialisering | Timeline drar initial CAPEX before node. |
| NAV | financing | timeline | Algebra samma | Post cash kontra reported cash. |
| IRR | Phase 2 | Lista 3/scenario | Ja | Samma core/root policy. |
| Payback | Lista 3 | Lista 3A/view | Ibland | Explicit initial CAPEX kontra pre-production deficit. |
| AISC | Project | Corporate | Ibland | Revenue/Au-price AuEq kontra actual Au payable. |
| EV | market engine | Project view | Ja | Producer Core använder reported balance data. |

## 6. Null, fallback, rounding och periodisering

| Implementation | Null/fallback | Rounding | Period |
|---|---|---|---|
| Phase 1 | Non-finite→null, komponent-null→0 via `safeValue`; null `capexUSD`→null FCFF | Ingen | Project local t |
| Live reconstruction | Sanitized null och `??0`; tax null kan hanteras separat | Ingen | Project local year, sedan Corporate calendar |
| Corporate strict align | Null i bidragande project-year nullar Corporate year; saknat year bidrar 0/inget | Ingen | Absolute year |
| Lista 2 | Null/non-finite FCFF behandlas som 0 efter normalisering | Ingen | Corporate/index axis |
| Phase 2 | Alla relevanta FCFF måste vara finite | Ingen | t=0/tp |
| Timeline | Remaining slice måste vara finite | Ingen | Absolute year/today/node exponent |
| IRR | Non-finite eller ingen sign change→null | Ingen; bisection tolerance | Full `0..masterN` |
| Lista 3 payback | Full finite series required; explicit initial base option | Real payback `round1` | Från tp |
| Lista 3A payback | Pre-tp deficit; null path→null | `round1` | Från tp |
| Per share | Null/zero/nonpositive shares→null | Ingen | Node/scalar |

## 7. Deterministiska numeriska jämförelser

Auditverktyget kör samma inputs genom parallellerna och failar med assertions vid drift.

| Koncept | Implementation A | Implementation B | Samma input? | Resultat A | Resultat B | Skillnad | Orsak |
|---|---|---|---:|---:|---:|---:|---|
| Revenue multi-metal | Revenue engine | hand identity | Ja | `[35,20]` | `[35,20]` | 0 | Identisk sum. |
| EBITDA | Phase 1 | explicit identity | Ja | `[0,54,49]` | `[0,54,49]` | 0 | Identisk. |
| Driftmått | Phase 1 | EBITDA−SC | Ja | `[0,44,39]` | `[0,44,39]` | 0 | Identisk. |
| FCFF incl. WC release/closure | Phase 1 | expanded identity | Ja | `[-50,29.5,35.75]` | samma | 0 | Last period includes reclamation 7 and WC −5. |
| DCF at tp | Phase 2 | Lista 2 | Ja | `189.7520661` | `189.7520661` | 0 | Identisk finite case. |
| DCF at tp | Phase 2 | Timeline | Ja | `189.7520661` | `189.7520661` | 0 | Samma node/rate. |
| NPV today | Phase 2 | Timeline | Ja | `11.3653439` | `11.3653439` | 0 | todayPeriod=0. |
| IRR | Phase 2 | Lista 3/core | Ja | `13.092531%` | `13.092531%` | 0 | Shared solver. |
| Multiple IRR roots | core scan | analytisk roots | Ja | `10%,20%`; selected `10%` | samma | 0 | Lowest root > 5% discount rate. |
| Real payback normal | Lista 3 | Lista 3A | Cashflow samma; investment coincides | `2.3` | `2.3` | 0 | Pre-deficit=explicit capex i caset. |
| AISC | Project engine | hand identity | Ja | `2.5` | `2.5` | 0 | `125/50`. |

### Testfallscoverage

- **Normalfall/nollor/negativa CF/flera construction years/tp>0:** DCF-caset `[-100,-50,60,70,80]`, tp=2.
- **Closure:** sista reclamation=7 i Phase 1-caset.
- **WC release:** sista ΔWC=−5.
- **Sustaining CAPEX/BP credit/no-taxable t0:** Phase 1-caset.
- **Flera metaller:** Au+Cu revenue-case.
- **Ett projekt:** Phase 1/valuation case och Abra integration.
- **Flera överlappande projekt:** befintlig Corporate integration verifierar calendar contributions och single/multi identities.
- **Olika discount rates:** parametriserade valuation tests och core accepts supplied rate; auditcaset använder 10 %, multiple-root selection 5 %.
- **Inga skattepliktiga vinster:** Phase 1 regression verifierar tax=0 för negativ EBIT.
- **Flera IRR-rötter:** `[-100,230,-132]` ger 10 % och 20 %.

## 8. Identiska implementationer

1. Phase 1 och live reconstruction: EBITDA, driftmått, EBIT, taxable income, tax och FCFF — identiska efter Fas 1.
2. Phase 2, Lista 2 och timeline: production-start DCF — identisk på finite, likadant periodiserad input.
3. Phase 2 och timeline: NPV today — identisk när today är local t0.
4. IRR wrappers — samma `computeIrr` root.
5. Market EV i market-value engine och Project view — samma algebra när inputs betyder samma cash/debt.

## 9. Avsiktliga skillnader

- Timeline future NPV kontra DCF: initial-CAPEX node bridge.
- Post-financing net cash kontra NAV net cash: liquidity/current EV respektive reported-cash intrinsic bridge.
- Corporate DCF/IRR/payback: räknas om på hela Corporate FCFF och är inte summa av Project scalar metrics.
- Lista 2 tolererar null FCFF som zero; Phase 2/timeline är strictare.
- Producer Core EV/EBITDA använder reported data; modeled Corporate använder Project EBITDA.
- Manual extra shares i UI ger dilution utan proceeds.

## 10. Oavsiktliga eller riskfyllda skillnader

| Fynd | Klass | Risk |
|---|---|---|
| Phase 1/live duplicerad egen matematik | Duplicate identical | Hög drift-risk. |
| Lista 2 null→0 kontra strict DCF | Duplicate divergent | Hög: samma label kan ge value kontra null. |
| Payback investment definitions | Definition mismatch | Hög: kan ge olika years. |
| Project/Corporate AISC denominator | Duplicate divergent | Hög i multi-metal. |
| Corporate effective tax rate generisk summering | Verified bug | Hög om exponerad som rate. |
| UI P&L fallbacks | Duplicate divergent | Medel; används endast om backendfält saknas. |
| Corporate overhead overlay | Dead/unused implementation | Medel: corporate costs påverkar inte live valuation. |
| Äldre Corporate/index aggregators | Intentional/legacy specialization | Medel: null/calendar behavior skiljer sig. |

## 11. Särskild Corporate-fråga

**Svar:** Ja. Corporate gör väsentligt mer än att kalenderplacera och summera.

| Corporate-steg | Görs? | Klassificering |
|---|---:|---|
| Revenue | Project metal revenue aggregeras och totalen summeras om | Ren aggregation/duplicate sum |
| EBITDA/driftmått/EBIT/tax/FCFF | Project live-serier strict-summeras | Ren calendar aggregation efter duplicated Project logic |
| Ny Corporate skatt/konsolidering/loss offset | Nej | Definitionell begränsning |
| Egen DCF/NPV | Ja, från Corporate FCFF | Legitimate corporate-only |
| Egen NAV | Ja | Legitimate, men annan net-cash definition än current EV |
| Discount rate | Samma request rate normalt | Ingen Project-rate blend |
| Net cash | Reported-cash NAV och post-cash EV finns parallellt | Intentional definition difference |
| Shares | New debt/equity, raise price, FD extras och manual extras | Legitimate corporate-only |
| Corporate-only costs | Fristående overlay finns men används inte live | Dead/unused gap |
| IRR/payback/AISC/EV-EBITDA | Räknas om på Corporate totals | Legitimate corporate-only med noterade definitioner |
| Flytt av CAPEX/cash mellan projekt | Waterfall kan använda earlier Project cash till later Project CAPEX | Legitimate corporate financing |
| Production start | Earliest Project start och milestone mapping | Legitimate portfolio timeline, avvikande från lokalt tp |

## 12. Rekommenderad canonical källa och refaktoreringsordning

Ingen refaktorering genomförs här. Rekommenderad ordning:

1. **Phase 1 economics core först:** gör Project Phase 1 till enda producent av EBITDA/driftmått/EBIT/tax/FCFF; live snapshot ska konsumera output och endast validera.
2. **DCF kernel:** en gemensam `discountCashflows(cashflows, origin, rate, nullPolicy)` med explicita policies för Phase 2/Lista 2/timeline.
3. **Payback:** en kernel med explicit `investmentBase: initialCapex | preProductionDeficit` och rounding policy.
4. **AISC/AuEq:** välj och namnge denominatorn; samma Project/Corporate kernel.
5. **Calendar aggregation:** behåll en year-keyed strict aggregator och avveckla index-helper där den inte behövs.
6. **Net cash/share bridge:** central typ med `reported`, `postFinancing`, `closing` och denominator source.
7. **UI fallbacks sist:** gör dem presentation-only eller ta bort efter backend contract enforcement.

## 13. Kompakt slutsatstabell

| Koncept | Antal implementationer | Numeriskt identiska? | Avsiktlig skillnad? | Risk | Rekommenderad canonical källa |
|---|---:|---:|---:|---|---|
| Revenue | 3 | Ja i gemensam domain | Wrapper/UI fallback | Låg–medel | `computeRevenueByMetalUSD` |
| Royalties | 4+ | Nej | Ja, precedence/rule types | Hög | `computeNationalTake` + en rule kernel |
| EBITDA/driftmått/EBIT/tax/FCFF | 3 | Project/live: ja; UI fallback: inte alltid | UI fallback | **Hög** | `computeProjectPhase1` |
| Discount factors/DCF/NPV | 5 | Ja för samma node/finite input | Ja, null/node policies | **Hög** | Ny kernel bakom canonical timeline |
| NAV/net cash | 4 | Nej | Ja, cash definitions | Hög | Canonical timeline + typed cash bridge |
| EV | 3 | Ja algebra, olika domains | Ja | Medel | Corporate market-value engine |
| EV/EBITDA | 2 domains | Nej | Ja | Medel | Modeled timeline respektive Producer Core separat |
| IRR | 3 wrappers/1 core | Ja | Wrapper outputs | Låg | `computeIrr` |
| Payback | 3 | Ibland | Delvis | **Hög** | Ny explicit-policy kernel |
| AISC | 3 | Ibland | Denominator oklar | **Hög** | Ny AuEq/AISC kernel |
| Corporate aggregation | 3 | Inte generellt | Calendar/index use cases | Hög | `sumStrictAlignedSeries` som exporterad kernel |
| Per share | 4+ | Ja med samma denominator | Denominator varierar | Medel | Canonical timeline/perShare kernel |
| Financing shares/net cash | 3 | Nej | Ja, stock definitions | Hög | `computeCorporateCashWaterfall` + typed bridge |

## Slutbedömning

Den högst prioriterade centraliseringen är Project economics/live reconstruction, följd av DCF null/node-policy, payback och AISC. IRR är redan korrekt centraliserad. Corporate är inte bara en aggregator: portfolio valuation och financing är legitima Corporate-only beräkningar, medan skatt fortsatt är summan av Project tax och corporate overhead-overlayn är ej inkopplad.
