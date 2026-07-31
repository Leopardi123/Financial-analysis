# Fullständig systemaudit: produktions-, ekonomi- och värdekedjan

> **Historisk baslinje.** EBITDA-/FCFF-avsnitten dokumenterar pre-fix-läget. Den implementerade korrigeringen och aktuell formel finns i `docs/ebitda-and-sustaining-capex-correction.md`; parallellimplementationerna finns i `docs/parallel-economic-implementations-audit.md`.

## 1. Omfattning, metod och huvudslutsatser

Detta är en read-only audit av den körbara Corporate/Project-kedjan bakom Instrumentbrädans pre-revenue-modell. Auditens rot är API-körningen `runCorporateSnapshotPipeline`; variabelnamn har inte antagits vara definitioner utan varje påstående nedan följer producerande uttryck, kalenderaggregering, värdering och UI-konsumtion.

### Huvudslutsatser

1. **Motorn är inte en full mine-plan-/metallurgimotor.** Ore mined, ore milled, grade och recovery är redan modellerade råserier/diagnostik. Waste, strip ratio, concentrate, contained metal och recovered metal har ingen producerande formel i den auditerade runtime-kedjan. Den ekonomiska motorn börjar i praktiken vid **payable quantity per metal**.
2. **Payable quantity är den kanoniska produktionsdrivaren för intäkt:** `payable quantity × price`, med särskild stream-brygga, summeras till gross revenue.
3. **Den namngivna EBITDA-serien är icke-konventionell:** sustaining CAPEX och reclamation dras av i EBITDA. Sustaining CAPEX dras därefter av en gång till i FCFF.
4. **Project-ekonomi räknas först per lokal period. Corporate summerar samma projektserier på absoluta kalenderår.** År utan ett projektbidrag behandlas som noll; ett null i ett bidragande projekt gör Corporate-året null.
5. **DCF/NPV/NAV har parallella implementationer.** `computeProjectPhase2`, Corporate aggregation, Lista 2 och `buildValuationTimeline` diskonterar samma typ av FCFF men har olika period-/nodsemantik. Den kanoniska grafen drivs av `buildValuationTimeline`.
6. **Cash-definitionen skiljer sig mellan market-box EV och NAV/multipelgraf.** Aktuellt EV använder post-financing cash; NAV och EV/EBITDA-kurvans equity-brygga använder rapporterad cash för att undvika att construction CAPEX räknas två gånger.
7. **Flera efterfrågade begrepp saknar separat modellpost:** corporate G&A är en separat, i huvudkörningen ej inkopplad overlay; expansion CAPEX, closure, amortization, interest och financing fees saknar egna ekonomiserier.

Den tidigare avgränsade EBITDA-auditen finns i `docs/corporate-ev-ebitda-definition-audit.md`. Den här rapporten utvidgar spårningen till hela beroendeträdet.

---

## 2. End-to-end runtime

```text
project_json_v2
  │
  ├─ time + redan modellerade operations-/payable-/kostnadsserier
  ├─ price keys/overrides ──> resolveProjectPricesToEngineInput
  │
  └─ parseProjectJsonV1
       │
       └─ computeProjectEngineFullProductionV1
            ├─ payable quantity + metal price + streams ──> revenue by metal ──> gross revenue
            ├─ takeItems / royalty detail / manual royalty precedence ──> royalties
            ├─ phase 1 ──> sustaining cost, EBITDA, EBIT, tax, NOPAT, FCFF
            ├─ phase 2 ──> discount factors, CF LOM, NPV, production-start DCF, IRR
            └─ AISC ──> AuEq payable + AISC LOM
                 │
                 └─ runCorporateSnapshotPipeline live reconstruction/context
                      │
                      ├─ align each Project series by absolute calendar year
                      ├─ strict Corporate sums
                      ├─ financing/cash waterfall ──> cash, debt, shares
                      ├─ buildValuationTimeline ──> rolling DCF/NPV/NAV/per share
                      ├─ EBITDA × 5/6/7 + net cash ──> EV/EBITDA equity/share
                      └─ selectors ──> tables, graph, model analysis, diagnostics
```

Den primära orkestreringen framgår av `computeProjectEngineFullProductionV1`: streams/revenue på rader 26–42, national take på 44–56, phase 2 på 58–63 och AISC på 65–71 (`src/lib/project/engineFullProductionV1.ts`). Parsern bygger dess indata från råserierna på rader 1134–1162 (`src/lib/project/jsonv1/parse.ts`).

---

## 3. Del A — tid och periodisering

### 3.1 Project-axeln

| Begrepp | Faktisk definition och kontroll |
|---|---|
| `masterN` | Högsta periodindex. Alla centrala serier har längd `masterN + 1`; parsern läser det och sätter `expectedLength` på rader 724–734 i `parseProjectJsonV1` (`src/lib/project/jsonv1/parse.ts`). |
| `productionStartPeriod` | Lokalt heltalsindex `tp`, måste vara `<= masterN`. Parsern jämför det med första icke-nollvärdet bland ore mined, ore milled och payable-metal-serierna på rader 746–759 (`src/lib/project/jsonv1/parse.ts`). |
| `productionStartYear` | Absolut kalenderår för `tp`. V2-axeln härleds från `(masterN, tp, productionStartYear)` på rad 734 (`src/lib/project/jsonv1/parse.ts`). |
| `periodEndDatesUtc` | Ingår inte i nuvarande v2-schemaobjektets `time`, men kalenderadaptern kan läsa en sådan kompatibilitetskälla, validerar ISO-datum och stämmer av datumår mot `yearsByPeriod` (`src/lib/valuation/projectCalendarAxis.ts`, rader 29–60 och 85–97). |
| Construction | Ingen separat inputserie. Perioder före `tp` märks `construction` av den kanoniska tidslinjen; första positiva pre-production `capexUSD` används också som construction-startmarkör (`src/lib/valuation/canonicalValuationTimeline.ts`, rader 212–223; `src/lib/snapshot/runCorporateSnapshot.ts`, rader 3448–3451). |
| Ramp-up | Ingen fas eller beräkning. Ramp-up kan endast vara inbakad i råa ore/payable/cost-serier. |
| Operation | Tidslinjen märker allt som inte är construction eller sista period som operating; produktionsstart har egen etikett (`src/lib/valuation/canonicalValuationTimeline.ts`, rader 212–223). |
| Closure | Sista period får alltid UI-fasen `closure`, oberoende av om ett closure-cashflow finns. Det är en etikett, inte en closure-beräkning (`src/lib/valuation/canonicalValuationTimeline.ts`, rader 212–223). |
| WC unwind | Ingen automatisk slutpost. Endast det värde som uttryckligen ligger i `workingCapitalDeltaUSD[last]` påverkar sista FCFF. |

`normalizeProjectCalendarAxis` prioriterar `parsedCanonicalYears`, sedan `yearsByPeriod`, `calendarYears` och sist år extraherade ur `periodEndDatesUtc`. Axeln måste vara strikt stigande, FCFF-längden måste matcha, och v2 kräver att `productionStartYear == yearsByPeriod[tp]` (`src/lib/valuation/projectCalendarAxis.ts`, rader 43–97).

### 3.2 Corporate-kalendern och summering

Varje projekt får en `yearToT`-map från sina absoluta år. Corporate-gridens summator söker projektets lokala `t` för varje Corporate-år; saknar projektet året bidrar det inte, ett null i en faktisk bidragsperiod nullar summan, annars summeras värdena (`src/lib/corporate/aggregateProjects.ts`, rader 31–95). Live-snapshoten använder samma princip via `sumStrictAlignedSeries` och `aggregateEconomic`, bland annat för operations- och ekonomiserier (`src/lib/snapshot/runCorporateSnapshot.ts`, rader 679–747 och 826–858).

Den kanoniska Corporate-grafen bygger en sammanhängande årslista från verifierat startår till sista interna år. Saknade interna år fylls med noll i `canonicalSeries`; FCFF, CAPEX och projektbidrag skickas sedan till `buildValuationTimeline` (`src/lib/snapshot/runCorporateSnapshot.ts`, rader 3370–3398). Grafens år kommer slutligen direkt från timeline-periodernas `calendarYear` (`src/lib/valuation/canonicalValuationTimeline.ts`, rader 320–325).

### 3.3 Slutposter

Det finns ingen generell funktion som skapar closure, reclamation eller WC unwind. Reclamation och WC är explicita per-period-inputserier. Stresstestet `closure2x` dubblar endast sista elementet i `reclamationUSD`; det skapar inte en ny period (`src/lib/snapshot/applyStressModifiers.ts`, rader 100–114). UI-etiketten closure betyder därför inte att en ekonomisk slutpost finns.

---

## 4. Del B — produktionskedjan

### 4.1 Vad som faktiskt beräknas

| Värde | Status, enhet och faktisk kodväg | Konsument |
|---|---|---|
| Ore mined | **Rå periodserie**, tonnageenhet deklareras separat. Parsern normaliserar/validerar men räknar inte fram värdet (`src/lib/project/jsonv1/parse.ts`, rader 551–560). Corporate summerar den per kalenderår (`src/lib/snapshot/runCorporateSnapshot.ts`, rader 679–689). | Operationsvisning/diagnostik och tp-alignment; inte revenue. |
| Waste mined | **Saknas i schema och runtime.** | Ingen. |
| Strip ratio | **Saknas; beräknas inte från ore/waste.** | Ingen. |
| Ore milled | **Rå periodserie**, valideras på rader 539–548 (`src/lib/project/jsonv1/parse.ts`) och summeras på rader 691–701 (`src/lib/snapshot/runCorporateSnapshot.ts`). | Operationsvisning/diagnostik och tp-alignment. |
| Throughput | `nameplateThroughput` är en scalar och `throughputUnit` är `tpd`/`tpa`; ingen årlig throughput räknas från ore milled eller dagar (`src/lib/project/jsonv1/schema.ts`, rader 59–68). | Corporate snapshot visar summerad nameplate och enhet om enheterna är konsistenta. |
| Utilization | Rå scalar `0..1`; Corporate visar aritmetiskt medel över projekt, inte tonnageviktat (`src/lib/snapshot/runCorporateSnapshot.ts`, rader 673–678 och 989–993). | UI/diagnostik; driver inte produktion. |
| Head grade | Valfri rå serie per metal och deklarerad enhet (`src/lib/project/jsonv1/schema.ts`, rader 69–73). | Parser/context; ingen revenue- eller payable-formel använder den. |
| Recovery | Valfri rå serie per metal, accepterad som fraction/procent av parsern. | Parser/context; ingen recovered-metal-formel i runtime. |
| Concentrate | **Saknas.** | Ingen. |
| Contained metal | **Saknas.** | Ingen. |
| Recovered metal | **Saknas.** | Ingen. |
| Payable metal | **Rå periodserie per metal** med enhet `toz`, `g`, `kg`, `lb`, `tonne`, `short_ton` eller `long_ton` (`src/lib/project/jsonv1/schema.ts`, rader 45–53). Parsern kräver minst en metal, enhet per metal och icke-negativa värden (`src/lib/project/jsonv1/parse.ts`, rader 937–1015). | Streams, revenue, royalties/take, AuEq/AISC, Corporate production och UI. |
| Treatment/refining quantities | **Saknas.** TC/RC kan finnas som redan monetära breakdown-serier men driver inte payable quantity. | Breakdown/diagnostik. |
| By-products | Varje metal, även by-product, är en likvärdig nyckel i payable/revenue-map. Ingen primär/by-product-klassificering finns i revenue-motorn. | Revenue per metal och total revenue. |
| Annual production | Payable-seriens värde vid `t`; ingen separat kalkyl. | Revenue och Corporate årsserie. |
| LOM production | Summa av relevanta payable-perioder när ett LOM-mått behöver den. AISC summerar AuEq-payable för perioder med positiv payable från `tp` (`src/lib/project/aisc/engine.ts`, rader 44–88). | AISC och efficiency-mått. |

**Konsekvens:** Head grade och recovery kan visas utan att ekonomin förändras. Ekonomin förändras först när payable-serien ändras. Det finns ingen kodkedja `ore × grade × recovery × payable factor`; den måste ha beräknats utanför denna motor.

### 4.2 Streams och payable

Revenue-motorn applicerar streams innan revenue. För varje metal används effective payable quantity till spot revenue och delivered quantity × stream purchase price som stream cash; formeln är:

```text
RevenueMetal[t] = EffectivePayableQty[t] × SpotPrice[t]
                + DeliveredStreamQty[t] × StreamPurchasePrice[t]
```

Uttrycket finns i `computeRevenueByMetalUSD` på rader 93–118 (`src/lib/project/revenue/computeRevenueByMetal.ts`). Null eller negativ quantity/price ger null för metallen; gross revenue blir null om någon inkluderad metal är null på rader 125–138.

---

## 5. Del C — intäktskedjan

### 5.1 Metal prices och FX

Project prices är USD-serier per metal. Parsern kopplar varje metal till en `priceKey`, kräver att Au-nyckeln är konsekvent och tillåter manuella/legacy spot-overrides (`src/lib/project/jsonv1/parse.ts`, rader 1031–1049 och 1089–1132). `resolveProjectPricesToEngineInput` väljer scenariopris/cache/live/fallback och skriver de slutliga `spotPriceUSDByMetal`-serierna innan engine-körningen.

Ingen target-currency FX används i Project revenue, cost, EBITDA, tax eller FCFF: dessa är USD. FX appliceras först på värdemått när `buildValuationTimeline` multiplicerar DCF/NPV med `fxUSDToTarget` (`src/lib/valuation/canonicalValuationTimeline.ts`, rader 184–211). Corporate EV/EBITDA multiplicerar också USD-EBITDA med samma FX före multipeln (`src/lib/snapshot/runCorporateSnapshot.ts`, rader 3421–3424).

### 5.2 Revenue-formler och royaltybas

```text
GrossRevenue[t] = Σ RevenueMetal[m,t]
```

`computeProjectRevenue` validerar exakt samma metalnycklar och längder och returnerar `byMetalRevenueUSD` samt `grossRevenueUSD` (`src/lib/project/revenue/engine.ts`, rader 4–55).

Royalties/take har tre ömsesidigt prioriterade källor i `computeNationalTake`:

1. minst ett giltigt `takeItem` → `totalTakeUSD`;
2. annars en finite manuell `phase1.royaltiesUSD` → den manuella serien;
3. annars `royaltiesDetail`-beräkningen.

Prioriteten implementeras på rader 83–102, och vald royalty plus `extraRoyaltiesUSD` skickas till phase 1 på rader 104–116 (`src/lib/project/nationalTake/engine.ts`). Take använder gross project revenue eller summan av valda metal revenues och beräknar `max(0, baseUSD) × rateAtT` (`src/lib/project/take/computeTakeMvi.ts`, rader 395–438).

### 5.3 By-product-risk

Det finns två oberoende by-product-vägar:

- en by-product metal i `payableQtyByMetal` ingår redan i `grossRevenueUSD`;
- `byproductCreditsUSD` adderas separat i EBITDA.

Ingen kod kontrollerar att de representerar olika ekonomiska belopp. Om samma by-product både ligger som payable metal och credit sker **dubbelräkning av ekonomiskt bidrag**: först i gross revenue, sedan igen som `+bp` i EBITDA. Corporate summerar båda serierna separat och bevarar dubbelräkningen. Detta är en datakontraktsrisk, inte ett villkorligt kodfel.

---

## 6. Del D/E — kostnads- och resultatkedjan

### 6.1 Faktisk periodformel

För varje Project-period använder `computeProjectPhase1` följande kod:

```text
SustainingCost = OperatingCosts + SustainingCAPEX + SiteG&A
               + Royalties + Reclamation - ByProductCredits

EBITDA_model = Revenue - OperatingCosts - SustainingCAPEX - SiteG&A
             - Royalties - Reclamation + ByProductCredits

EBIT = EBITDA_model - Depreciation
TaxableIncome = max(0, EBIT)
Tax = TaxableIncome × TaxRate
NOPAT = EBIT - Tax
TotalCAPEX = CapexUSD + SustainingCAPEX
FCFF = NOPAT + Depreciation - TotalCAPEX - ΔWorkingCapital
```

Indata hämtas på rader 48–80, EBITDA/EBIT på 86–93, skatt/NOPAT på 104–128 och CAPEX/FCFF på 136–152 (`src/lib/project/phase1.ts`). Det finns inget separat “operating cash flow”-output; närmaste brygga är `NOPAT + depreciation - ΔWC`, men den materialiseras inte. FCFF är första publicerade kassaflödesmåttet.

### 6.2 Kostnadsposternas faktiska användning

| Post | EBITDA | EBIT / taxable income | FCFF | NAV/AISC/EV/finansiering |
|---|---|---|---|---|
| Mining, milling, utilities, maintenance, camp | Inte direkt. Dessa är frivilliga breakdown-serier; endast om beloppen också ingår i `operatingCostsUSD` påverkar de ekonomin. | Samma. | Samma. | Breakdown-totalen beräknas separat för presentation på rader 894–944 i `runCorporateSnapshot.ts`. Risk för dubbel visning, inte automatiskt dubbel avdrag. |
| Transport, TC, RC | Inte direkt; monetära selling-breakdowns är diagnostiska. | Inte direkt. | Inte direkt. | Summeras som `totalSellingUSD` för breakdown på rader 903–944, men matas inte in i phase 1. Om redan inbakade i op cost eller payable terms är det den enda ekonomiska effekten. |
| Site G&A | Dras av. | Via EBITDA. | Via NOPAT. | Ingår i `sustainingCost` och AISC. |
| Corporate G&A / SBC | Inte i live Project EBITDA. | Inte i live Project EBIT/skatt. | En separat `computeCorporateOverheadOverlay` kan dra `corpGA_cash_USD + corpSBC_USD` från Corporate FCFF (`src/lib/corporate/overhead/engine.ts`, rader 42–80), men `runCorporateSnapshotPipeline` anropar inte denna motor. | Ej i huvud-DCF/NAV. Detta är en parallell, för närvarande frikopplad implementation. |
| Operating cost | Dras av. | Via EBITDA. | Via NOPAT. | Ingår i sustaining cost/AISC. |
| Cash cost | Ingen separat serie/formel i runtime. | — | — | AISC används i stället. |
| AISC | — | — | — | `Σ sustainingCost / Σ payableAuEqOz`; sustaining cost inkluderar sustaining CAPEX och reclamation (`src/lib/project/aisc/engine.ts`, rader 64–88). |
| Sustaining CAPEX | **Dras av i EBITDA.** | Via EBITDA/tax. | **Dras igen** via `TotalCAPEX`. | Ingår i AISC; driver DCF, finansiering endast indirekt genom cashflow, inte build-need-serien. |
| Initial CAPEX | Inte i EBITDA. | Inte i EBIT/skatt. | `capexUSD` dras i FCFF. | Pre-production CAPEX används också för build funding, shares/debt och grafens initial-CAPEX-brygga. |
| Expansion CAPEX | Ingen separat post. Ett belopp i `capexUSD` behandlas likadant som annan CAPEX. | — | Dras i FCFF. | Om efter `tp` räknas den inte nödvändigtvis som initial build need men finns i DCF. |
| Reclamation | Dras i EBITDA. | Via EBITDA/tax. | Inte explicit igen; kommentaren skyddar mot andra avdraget. | Ingår i sustaining cost/AISC. |
| Closure | Ingen egen serie. Kan endast ligga i sista `reclamationUSD`, `capexUSD` eller WC. | Enligt den serie den lagts i. | Enligt den serie den lagts i. | Sista timelineperioden etiketteras closure även utan kostnad. |
| Royalties | Vald royaltyserie dras i EBITDA. | Via EBITDA/tax. | Via NOPAT. | Ingår i sustaining cost/AISC. |
| Working capital | Inte i EBITDA/EBIT/skatt. | — | `-ΔWC`: positiv uppbyggnad minskar FCFF, negativ unwind ökar FCFF. | DCF/NPV/NAV genom FCFF. Ingen automatisk unwind. |
| Depreciation | Inte i EBITDA; dras i EBIT. | Minskar taxable income och tax. | Läggs tillbaka en gång i FCFF. | Ingen AISC/EV-effekt förutom tax shield/FCFF. |
| Amortization | Ingen separat serie eller avdrag. Schema-kommentaren kallar `depreciationUSD` “depreciation & amortization”, men runtime har bara ett fält. | Endast om manuellt inbakat i depreciation. | Samma. | Definitionsrisk. |
| Interest | Saknas; Project FCFF är unlevered. | Inte i tax. | Inte i FCFF. | Debt påverkar NAV/EV separat. |
| Financing fees | Saknas som kostnad/finansieringspost. | — | — | Ej modellerade. |
| Taxes | Inte i EBITDA/EBIT. `max(0, EBIT) × rate`; inga loss carryforwards. | Själva resultatet. | Dras genom NOPAT. | DCF/NPV/NAV. `taxesDetail` är reference/debug och används inte som default live tax. |

### 6.3 Gross profit och total revenue

`grossProfitUSD` förekommer i identitetsdiagnostik/breakdown men är inte ett kanoniskt mellanled som matar EBITDA. Live-EBITDA rekonstrueras direkt från central gross revenue och kostnadsserier (`src/lib/snapshot/runCorporateSnapshot.ts`, rader 1828–1843). “Total revenue” i Corporate snapshot är summan av metal revenue; take/royalty dras senare och skapar inte en separat net-revenue-output i huvudserien.

### 6.4 FCFF till DCF, NPV, NAV och per share

`computeProjectPhase2` använder:

```text
DF_today[t] = 1 / (1+r)^t
CF_LOM = Σ FCFF[t]
NPV_today = Σ FCFF[t] × DF_today[t]
DCF_at_tp = Σ(t=tp..N) FCFF[t] / (1+r)^(t-tp)
DCF_at_tp_present = DCF_at_tp × DF_today[tp]
IRR = root where NPV(FCFF, rate) = 0
```

Samtliga FCFF måste vara finite för CF LOM, NPV och IRR; post-`tp` måste vara finite för production-start DCF (`src/lib/project/phase2.ts`, rader 30–103).

Den kanoniska timeline-implementationen räknar ett rolling `dcfUSD` från varje period, target currency via FX, `NPV = DCF` idag men för framtida perioder `NPV = rolling DCF - initial CAPEX before period`, och `NAV = NPV + cash - debt`. Alla per-share-värden divideras med `sharesPf` (`src/lib/valuation/canonicalValuationTimeline.ts`, rader 188–239).

```text
DCF_per_share = DCF_Target / shares_post_financing_FD
NPV_per_share = NPV_Target / shares_post_financing_FD
NAV_per_share = (NPV_Target + net cash) / shares_post_financing_FD
```

---

## 7. Del F/H — komplett användnings- och producer/konsumentkarta

| Värde | Produceras i | Viktiga konsumenter | Påverkar |
|---|---|---|---|
| Production / payable metal | Rå JSON → parser | revenue, take, AISC, Corporate sum, UI | Revenue, royaltybas, AISC, production diagnostics |
| Ore mined/milled | Rå JSON → parser | tp-validator, Corporate operations sum, UI | Inte ekonomin direkt |
| Throughput/utilization | Rå scalar → parser/Corporate mean | UI/diagnostik | Inte payable eller revenue |
| Revenue by metal | `computeRevenueByMetalUSD` | gross revenue, metal-specific take, snapshot/UI | Revenue, royalties/take, EBITDA |
| Gross revenue | `computeRevenueByMetalUSD` | national take, phase 1, AISC AuEq, Corporate sum | EBITDA, royaltybas, AISC denominator |
| Operating costs | Rå serie → phase 1 | EBITDA, sustaining cost, Corporate sum | EBIT, tax, FCFF, AISC |
| Royalties | `computeNationalTake` precedence | phase 1, Corporate sum, breakdown/UI | EBITDA, tax, FCFF, AISC |
| Sustaining CAPEX | Rå serie → phase 1 | EBITDA, total CAPEX, sustaining cost, Corporate sum | EBITDA, tax, FCFF två vägar, AISC, DCF |
| Initial/other CAPEX | Rå `capexUSD` | phase 1, build-funding need, timeline | FCFF, DCF/NPV, debt/equity/shares, graph |
| Working capital | Rå serie → phase 1 effective | FCFF, Corporate sum, diagnostics | DCF/NPV/NAV; ingen EBITDA/tax |
| Reclamation | Rå serie → phase 1 | EBITDA, sustaining cost, Corporate sum | Tax, FCFF, AISC |
| Closure | Ingen egen producer | Timeline etikett/stress på reclamation | Ingen effekt utan explicit rå slutpost |
| EBITDA | Phase 1 + likalydande live reconstruction | Corporate yearly sum, EV/EBITDA rows, UI tooltip/tester | EV/EBITDA endast; EBIT/FCFF via Project chain |
| EBIT | EBITDA − depreciation | taxable income, tax, scenario ROCE/diagnostik | Tax/NOPAT/FCFF |
| Tax | `max(0, EBIT) × rate` | NOPAT, Corporate sums, UI | FCFF/DCF/NPV/NAV |
| NOPAT | EBIT − tax | FCFF, project-view metrics | FCFF |
| FCFF | NOPAT + depreciation − capex − sustaining capex − ΔWC | phase 2, Corporate sum, IRR, payback, DCF/timeline, graphs | Nästan alla intrinsic-value-mått |
| DCF | Phase 2 och canonical timeline | Lista 2, Project/Corporate tables, charts | NPV nodes, per share, high curve |
| NPV | Phase 2, Corporate aggregate, Lista 2, canonical timeline | financing, NAV, tables/charts | NAV, financing ratios, market comparisons |
| Net cash | financing: cash − debt; timeline: supplied cash − debt | NAV, EV/EBITDA equity bridge, per share | NAV/equity value |
| NAV | NPV + net cash | per-share, graph low, market box ratios | NAV/share, P/NAV |
| Shares | current shares + financing shares + FD/manual extras | all per-share values | DCF/NPV/NAV/EV-EBITDA per share |
| IRR | `computeIrr` over FCFF; called from phase 2/Lista 3/views | UI, scenario cards, tester | Diagnostic/return metric, inte DCF |
| Payback | Lista 3 och en separat view reconstruction | UI/scenario cards/tester | Diagnostic only |
| Enterprise Value | market-value/view engine | EV/NPV, EV/NAV, market box | Market ratios; inte intrinsic DCF |
| EV/EBITDA | Corporate timeline rows | `ValueRangeSnapshotCard`, tester | Graph overlay and tooltip |
| AISC | `computeProjectAisc` och Corporate recomputation | efficiency metrics, UI | Diagnostic/benchmark; inte FCFF |
| Cash cost | Saknas | — | — |

### Centrala “används i?”-svar

- **EBITDA:** skatt **indirekt via EBIT**, FCFF **indirekt via EBIT/NOPAT**, EV/EBITDA **ja**, NAV **indirekt via FCFF**, market-box EV **nej**, IRR/payback **indirekt via FCFF**, UI/tester **ja**.
- **FCFF:** DCF/NPV/IRR/payback/ROI/grafer **ja**; EV market box och EV/EBITDA **nej**.
- **Net cash:** EBITDA/EBIT/tax/FCFF/IRR/payback **nej**; NAV, per share och multipelns equity bridge **ja**; aktuellt EV använder motsatt tecken som debt minus cash.
- **Payable metal:** revenue, take och AISC **ja**; kostnader och CAPEX **nej** om de inte redan modellerats externt som egna serier.

---

## 8. Del G — beroendegrafer

### 8.1 Huvudkedjan

```text
Raw payable metal[m,t]
  ├─ stream effective qty/delivered qty
  └─ price USD[m,t]
        ↓
Revenue by metal[m,t]
        ↓ Σ metals
Gross revenue[t] ───────────────┐
        ↓ royalty/take base     │
Royalties[t]                    │
        └──────────────┬────────┘
                       ↓
Revenue - op cost - sustaining CAPEX - site G&A - royalties - reclamation + BP credit
                       ↓
                 EBITDA_model
                       ↓ - depreciation
                      EBIT
                       ↓ max(0, EBIT) × tax rate
                      Tax
                       ↓
                     NOPAT
                       ↓ + depreciation - capex - sustaining CAPEX - ΔWC
                      FCFF
                       ├─ Σ / discount ──> DCF / NPV
                       ├─ root ──────────> IRR
                       └─ cumulative ────> Payback

NPV + reported cash - post debt ──> NAV
NAV / post-financing FD shares ───> NAV/share ──> graph low
Rolling DCF / shares ─────────────> graph high
```

### 8.2 EV-kedjor

```text
Current price × current shares = Market Cap
Market Cap + post debt - post cash + adjustments = Current EV (market box)

EBITDA_model_USD × FX × {5,6,7} = Multiple EV
Multiple EV + (reported cash - post debt) = Implied equity value
Implied equity value / post-financing FD shares = EV/EBITDA graph series
```

### 8.3 Multi-project Corporate

```text
Project A local t ──year map──┐
Project B local t ──year map──┼─ strict sum by Corporate calendar year
Project C local t ──year map──┘
                              ↓
Corporate FCFF / EBITDA / revenue / cost / payable series
                              ↓
Corporate financing + canonical valuation timeline
                              ↓
Corporate NAV/DCF/multiples per share → selectors → graph/table
```

---

## 9. Del I — parallella och dubbla implementationer

| Begrepp | Implementationer | Bedömning |
|---|---|---|
| Revenue | `computeRevenueByMetalUSD`; snapshot bygger dessutom `totalRevenue_USD` från aggregerad metal revenue. | Samma ekonomiska källa men åter-summerad. |
| EBITDA/EBIT/FCFF | `computeProjectPhase1`; live snapshot rekonstruerar samma uttryck på rader 1828–1855 i `runCorporateSnapshot.ts`. | Verklig duplicering. Idag likalydande, framtida drift-risk. |
| Project/Corporate sum | Äldre `aggregateProjects`, snapshotens `sumStrictAlignedSeries`, samt `aggregateProjectsToCorporateTotals`. | Tre aggregatorer med närliggande null/out-of-range-semantik. Live snapshot använder främst sin kalenderalignerade serie och en separat totals-helper i stress/delay-vägar. |
| DCF/NPV | `computeProjectPhase2`, `computeStrictValueMetrics`, `lista2CfDcf`, `buildValuationTimeline`, overhead-overlayns lokala `computeNpvStrict`. | Flera formler med olika ankare och outputs. Kanonisk graph/table ska spåras till timeline, inte phase 2-skalaren. |
| IRR | `computeProjectPhase2` anropar `computeIrr`; Lista 3 och project view anropar/rekonstruerar return metrics. | Samma FCFF avses men flera adapters och root-policyer måste hållas synkroniserade. |
| Payback | `computeLista3`, `lista3aProjectEfficiency` och egen loop i `computeProjectPreRevenueView`. | Tre implementationer; initial-investment-definition och interpolation skiljer sig. |
| AISC | Project `computeProjectAisc`; Corporate `computeCorporateAiscLom`; snapshot räknar även `sum(sustainingCost)/sum(Au payable)`. | Samma namn men Project AuEq kan definieras som gross revenue/Au price medan live Corporate föredrar faktisk `payableQtyByMetal.Au`; multi-metal-resultat kan skilja. |
| Net cash | Financing post cash − post debt; NAV uses reported cash − post debt. | Avsiktligt olika definitioner med liknande namn. |
| EV/EBITDA | Corporate modeled EBITDA; Producer Core rapporterad income-statement EBITDA. | Samma label, helt olika serie/definition. |
| Corporate overhead | Fristående overhead-overlay kontra live Corporate pipeline utan overlay. | Parallell men ej inkopplad funktion. |

---

## 10. Del J — dubbelräkningsaudit

| Kandidat | Resultat | Full kedja/risk |
|---|---|---|
| By-product | **Potentiell dubbelräkning** | By-product payable × price ingår i gross revenue; samma ekonomiska bidrag kan åter adderas som `byproductCreditsUSD` i EBITDA. Ingen guard finns. |
| Sustaining CAPEX | **Bekräftad dubbel subtraktion i FCFF-kedjan** | `-sc` i EBITDA → EBIT/NOPAT och därefter `TotalCAPEX = capex + sc` → nytt `-sc` i FCFF. Skatteeffekten gör nettoeffekten per 1 USD ungefär `-(2-taxRate)` när EBIT är skattepliktigt. |
| Royalties | **Ingen automatisk dubbelräkning mellan källorna** | Take/manual/detail väljs med precedence, inte summeras. Risk finns om royalties redan är nettoförda i revenue eller op cost, vilket koden inte kan upptäcka. |
| Reclamation | **Ingen kodmässig dubbel subtraktion i FCFF** | Dras i EBITDA; FCFF-kommentaren undviker separat avdrag. Men den ingår också i AISC, vilket är avsiktligt för ett kostnadsmått. Risk om closure även ligger i capex. |
| Closure | **Datamodellrisk** | Ingen egen post. Samma closure-belopp kan manuellt ligga både i reclamation och capex; ingen kontroll. UI:s closure-etikett lägger inte till värde. |
| Depreciation | **Ingen dubbelräkning i FCFF** | `-dep` i EBIT/tax och `+dep` i FCFF ger tax shield men tar bort non-cash-avdraget. Risk: schema-kommentaren antyder D&A medan fältet heter depreciation. |
| Working capital | **En gång** | Endast `-dWC` i FCFF. Risk: ingen automatisk unwind, och ett externt FCFF som redan inkluderar WC får inte matas in som rå phase1-komponent. |
| Cash | **Två definitioner, inte samma beräkning** | Post cash i current EV; reported cash i NAV/multipel equity bridge. Att kombinera outputs utan definition kan se ut som dubbelräkning. |
| Debt | **Post-financing debt används i både EV och NAV med motsatta tecken** | Korrekt respektive enterprise/equity-brygga; risk om befintlig debt också ingår i `totalDebt_TargetCurrency` input. Pipeline adderar befintlig debt och ny debt på rader 2494–2500 (`src/lib/snapshot/runCorporateSnapshot.ts`). |
| Initial CAPEX/cash used | **Skydd mot dubbelräkning i NAV, men parallella NAV-skalare finns** | FCFF drar full CAPEX. Timeline NAV använder reported cash så cash använd för samma byggnation inte dras igen. Financing-snapshot har samtidigt post-cash-NAV-skalare innan live override; konsument måste använda kanonisk timeline. |
| Breakdown costs | **Potentiell datadubbelräkning, inte live-formeldubbelräkning** | Mining/milling/TC/RC breakdowns summeras för UI men phase 1 drar endast `operatingCostsUSD`. Om UI summerar breakdown + op cost som om de vore additiva blir presentationen fel; ekonomimotorn gör inte det avdraget. |

---

## 11. Del K — Project kontra Corporate

| Område | Samma? | Faktisk avvikelse |
|---|---|---|
| Production definition | Ja, i grunden | Corporate summerar rå Project-serie på kalenderår och kräver enhetskonsistens. Throughput utilization blir enkelt medel, inte produktionsviktat. |
| Revenue | Ja | Project räknar per metal; Corporate åter-summerar kalenderalignerade metal revenues. |
| EBITDA/EBIT/tax/FCFF | Samma Project-definition som källa | Corporate summerar redan beräknade Project-serier. Live reconstruction duplicerar Project-formeln innan summering. |
| Periodisering | Nej | Project använder lokalt `t=0..masterN`; Corporate använder union/sammanhängande absoluta år och noll för år utan bidrag. |
| Valuta | Ja för economics | Project och Corporate economics är USD. Target currency appliceras i valuation/EV rows. |
| Tax | Samma per Project, inte en konsoliderad Corporate tax pool | Varje projekts `max(0, EBIT)×rate` räknas före Corporate sum; vinster och förluster mellan projekt kvittas alltså inte på Corporate-nivå. |
| DCF | Samma FCFF-källa, flera adapters | Project phase 2 diskonterar lokalt från `t=0`; Corporate canonical timeline ankrar vid `valuationYear` och kalenderår. |
| NPV/NAV | Inte helt | Project phase 2 producerar NPV men inte NAV. Canonical Project/Corporate timeline adderar supplied net cash. Corporate använder reported cash/post debt för NAV. |
| FCFF | Ja som serie | Corporate är strikt årssumma, möjligen stress-/delay-shiftad. Corporate G&A-overlay ingår inte i live FCFF. |
| Finansiering | Nej | Project economics är unlevered. Corporate cash waterfall finansierar byggbehov, skapar ny debt/equity/shares och ändrar per-share-denominator. |
| Shares | Nej | Project raw engine saknar shares. Corporate använder current + financing shares + project FD extras/manual extras. |
| AISC | Inte säkert | Project skapar AuEq som gross revenue/Au price; live Corporate föredrar summerad faktisk Au payable. Multi-metal-portföljer kan därför få olika nämnare. |
| EV/EBITDA | Corporate-only modeled curve | Project chart visar inte overlayn. Producer Core har separat rapporterad multipel. |

### Corporate skatt och diversifiering

Eftersom tax beräknas per projekt före aggregering kan Project A:s skattepliktiga vinst inte kvittas mot Project B:s förlust. Corporate `taxUSD` är summan av projektskatter. Detta är en materiell skillnad mot en konsoliderad skatteberäkning och kan ge lägre Corporate FCFF än en juridiskt konsoliderad modell.

---

## 12. Null-, fallback-, enhets- och valutaregler

1. Parsern normaliserar serielängder till `masterN+1` för vissa tillåtna legacyformer och varnar; safe-to-zero-serier kan få null→0 (`src/lib/project/jsonv1/parse.ts`, rader 1124–1126).
2. `computeProjectPhase1` normaliserar non-finite till null men `safeValue` läser null som noll i EBITDA/EBIT. CAPEX är undantaget: null CAPEX gör FCFF null (`src/lib/project/phase1.ts`, rader 9–30 och 70–80, 136–147).
3. Revenue är striktare: null quantity eller price ger null metal revenue, och en null metal nullar gross revenue (`src/lib/project/revenue/computeRevenueByMetal.ts`, rader 93–138).
4. Corporate strict sum: null i ett bidragande projektår nullar Corporate-året; utanför projektets kalender bidrar projektet med ingenting/zero.
5. Economics och physical revenue är USD. Payable-enheten deklareras per metal och måste vara konsekvent över projekt. FX används först i target-currency valuation.
6. DCF/NPV kräver i regel en helt finite relevant FCFF-slice; timeline returnerar null när resterande serie innehåller non-finite.
7. Financing kräver finite cash/debt/price/shares för kompletta EV/per-share outputs. Enterprise adjustments defaultar till noll i financingmotorn (`src/lib/corporate/financing/compute.ts`, rader 130–168).

---

## 13. Prioriterad risklista

### Kritisk

1. **Sustaining CAPEX dubbelräknas i FCFF och ingår felaktigt i namngiven EBITDA.** Detta påverkar tax, FCFF, DCF, NPV, NAV, IRR, payback, AISC och EV/EBITDA.
2. **By-product kan dubbelräknas** om samma metal finns i payable revenue och `byproductCreditsUSD`.

### Hög

3. **Project tax summeras, inte konsolideras.** Ingen cross-project loss offset.
4. **Samma EBITDA/FCFF-formel finns i phase 1 och live reconstruction.** Ändring på bara ett ställe skapar Project/Corporate-drift.
5. **AISC har olika AuEq-nämnare i Project och live Corporate.**
6. **Payback har tre implementationer**, och DCF/NPV har flera; UI måste fortsätta använda dokumenterad kanonisk selector.

### Medel

7. Operationsdetaljer som grade/recovery driver inte payable; UI kan ge sken av en integrerad produktionsmodell.
8. Corporate G&A-overlay finns men är inte kopplad till live Corporate FCFF/DCF.
9. Closure och WC unwind skapas inte automatiskt; sista periodens closure-label kan vara ekonomiskt tom.
10. Amortization, interest, financing fees, expansion CAPEX och cash cost saknar explicita definitioner.
11. Reported-cash NAV och post-cash EV är båda legitima men lätt sammanblandade.

---

## 14. Slutlig modellbeskrivning

Instrumentbrädans modell är en **payable-metal-driven, USD-baserad Project FCFF-motor med kalenderalignerad Corporate aggregation och separat Corporate financing/equity-brygga**. Den är inte en upstream mine-plan-/metallurgimotor. Råa payable-, cost-, CAPEX-, reclamation-, depreciation- och WC-serier är de egentliga ekonomiska inputs.

Den körbara resultatkedjan är:

```text
payable × price (+ stream cash)
→ gross revenue
→ royalties/take
→ icke-konventionell EBITDA
→ EBIT
→ project-level tax
→ NOPAT
→ FCFF
→ calendar-aligned Corporate FCFF
→ DCF/NPV
→ + reported cash - post debt = NAV
→ / post-financing FD shares
→ table/chart
```

Aktuellt enterprise value är en separat market-value-kedja (`market cap + post debt - post cash + adjustments`). Corporate EV/EBITDA-grafen skapar i stället ett hypotetiskt enterprise value från den icke-konventionella EBITDA-serien och bryggar till equity med reported cash minus post debt. Dessa två EV-relaterade vyer får därför inte beskrivas som samma beräkning.

Ingen produktionskod har ändrats i denna audit; enda leveransen är teknisk dokumentation.

---

## 15. Normativ producer–consumer-tabell (full leverans)

Tabellen nedan är den kompletta centrala inventeringen. “Saknas” betyder att det inte finns någon producerande runtime-funktion; ett liknande namn i JSON eller UI är inte bevis för en beräkning. Radangivelser avser funktionens faktiska uttryck, inte typdeklarationen, om inget annat sägs.

| Värde | Produceras i | Formel/källa | Konsumeras i | Påverkar |
|---|---|---|---|---|
| Ore mined | `parseOperations`, `src/lib/project/jsonv1/parse.ts:551–560`; Corporate `buildCorporateSeries`, `runCorporateSnapshot.ts:679–689` | Rå `operations.oreMinedTonnes[t]`, endast normalisering/strict årssumma | `buildProductionDriverFirstNonZeroMap` för tp-validering; snapshot `series.oreMinedTonnes`; operations-UI/tester | **Beräkning:** endast tidsvalidering. **Presentation:** ja. Ingen revenue/FCFF. |
| Ore milled | `parseOperations`, `parse.ts:539–548`; Corporate `runCorporateSnapshot.ts:691–701` | Rå `operations.oreMilledTonnes[t]` | tp-validering, snapshot/operations-UI/tester | Tidsvalidering och presentation; ingen payable-formel. |
| Throughput | `parseCapacity`, `parse.ts:510–535`; Corporate snapshot `runCorporateSnapshot.ts:673–678,989–993` | Rå `nameplateThroughput`; Corporate summerar scalars, behåller enhet endast om konsistent | Operations-grid/UI/diagnostik | Endast presentation; påverkar inte production/revenue. |
| Head grade | `parseOperations`, `parse.ts:562–610` | Rå `gradeByMetal[m][t]` + unit | Parser context och operationspresentation där data finns | Endast validering/presentation. |
| Recovery | `parseOperations`, `parse.ts:611–619` | Rå `recoveryPctByMetal[m][t]` | Parser context/operationspresentation | Endast validering/presentation. |
| Contained metal | **Produceras inte** | Ingen formel `ore × grade` | Ingen runtime-konsument | Saknas helt. |
| Recovered metal | **Produceras inte** | Ingen formel `contained × recovery` | Ingen runtime-konsument | Saknas helt. |
| Payable metal | Rå JSON → `parseProjectJsonV1`, `parse.ts:937–1015`; streams justerar effective/delivered quantity i `applyStreamsMVI` | Deklarerad rå quantity per metal/enhet; streamväg delar upp effective och delivered | revenue engine; take/royalties; production start-validator; AISC; Corporate strict sum `runCorporateSnapshot.ts:703–747`; UI/tester | Production, revenue, take, AISC, Corporate/UI. |
| Metal price | `resolveProjectPricesToEngineInput`, `src/lib/project/jsonv1/resolvePrices.ts`; parser overrides `parse.ts:1089–1132` | Resolverad USD price series per price key; override/fixed/live/cache/fallback enligt resolver | streams/revenue; tiered take; AuEq/AISC; snapshot price diagnostics; scenario cards/tester | Revenue, royalties/take, AISC och alla downstream values. |
| FX | `resolveFx`/snapshot FX-resolution i `runCorporateSnapshotPipeline`; manuell input eller resolver | `fx_USD_to_TargetCurrency` | financing, canonical timeline `canonicalValuationTimeline.ts:184–211`, EV/EBITDA rows `runCorporateSnapshot.ts:3421–3424`, UI | Valutaomräkning av value/financing; aldrig physical production eller USD FCFF. |
| Revenue per metal | `computeRevenueByMetalUSD`, `revenue/computeRevenueByMetal.ts:93–118` | `effectiveQty×spot + deliveredQty×streamPurchasePrice` | gross revenue sum; metal-specific take; snapshot; UI/tester | Revenue/take/EBITDA downstream. |
| Gross/total revenue | `computeRevenueByMetalUSD`, rader 125–138; Corporate `runCorporateSnapshot.ts:816–824` | `Σ revenueByMetal` | `computeNationalTake`; phase 1; AISC AuEq; Corporate series; scenario/efficiency/UI/tester | Royalties, EBITDA, tax/FCFF, AISC. |
| By-product revenue | Ingen separat klass; produceras som valfri `RevenueMetal` | `payableByproduct×price` | Gross revenue, metal take, snapshot/UI | Samma som annan metal revenue. |
| By-product credits | Rå `series.byproductCreditsUSD` → phase 1 | `+bp` i EBITDA och `-bp` i sustaining cost, `phase1.ts:86–92` | EBITDA, sustaining cost, Corporate sum, AISC, UI/tester | EBITDA→tax→FCFF→valuation och AISC. Potentiell dubbelräkning mot by-product revenue. |
| Royalties | `computeNationalTake`, `nationalTake/engine.ts:83–116` | Precedence: takeItems, annars manual series, annars detail; plus extra royalties | phase 1 EBITDA/sustaining cost; Corporate sum; royalty breakdown/UI/tester | EBITDA, tax, FCFF, AISC. |
| TC | Endast raw monetary breakdown, parser economicsBreakdown; Corporate `runCorporateSnapshot.ts:903–933` | `treatmentChargesUSD`; kan kombineras med RC till `tcRcUSD` | Breakdown totals/diagnostik/UI | Endast presentation om inte manuellt inbakat i op cost/payable. |
| RC | Samma som TC | `refiningChargesUSD`; `tcRc = explicit tcRc ?? TC+RC` | Breakdown totals/diagnostik/UI | Endast presentation om inte inbakat externt. |
| Operating costs | Rå serie → `computeProjectPhase1`, `phase1.ts:48–50,72,86–92`; Corporate sum `runCorporateSnapshot.ts:836` | `-op` i EBITDA; `+op` i sustaining cost | EBITDA/EBIT/tax/FCFF; AISC; Corporate/UI/tester | Beräkning och värdering. |
| Site G&A | Rå serie → phase 1, `phase1.ts:51,74,86–92` | `-ga` i EBITDA; `+ga` i sustaining cost | Samma som operating costs; breakdown kan dessutom ha en presentationsserie | Beräkning, AISC, värdering, UI. |
| Corporate G&A | `computeCorporateOverheadOverlay`, `corporate/overhead/engine.ts:42–80` | `overhead=corpGA_cash+corpSBC`; `fcffAfter=fcff-overhead` | Overlay-tester; **inte** live `runCorporateSnapshotPipeline` | Frikopplad alternativberäkning, inte live valuation/UI. |
| Sustaining CAPEX | Rå serie → phase 1, `phase1.ts:50,73,86–92,142–151` | `-sc` i EBITDA och `-(capex+sc)` i FCFF | EBITDA/EBIT/tax/FCFF; AISC; Corporate; stress; UI/tester | Beräkning, värdering och presentation; verifierad dubbel subtraktion. |
| Initial CAPEX | Rå `capexUSD` före tp; phase 1/timeline/financing | `-capex` i FCFF; pre-tp capex summeras för funding need/initial capex | FCFF; financing waterfall; DCF/NPV; Lista 2/3; graph/tester | Beräkning, finansiering, värdering, UI. |
| Expansion CAPEX | Ingen separat serie; eventuellt `capexUSD[t≥tp]` | Samma `-capex` i FCFF | FCFF/DCF; inte automatiskt initial build need | Beräkning/värdering; saknar separat UI-definition. |
| Reclamation | Rå serie → phase 1 `phase1.ts:53,76,86–92` | `-rec` i EBITDA; inte separat i FCFF | Tax/FCFF; sustaining cost/AISC; Corporate; closure stress/UI/tester | Beräkning och värdering. |
| Closure | Ingen separat producer | Eventuellt manuellt sista reclamation/capex/WC; timeline etiketterar sista period closure | Stress modifier och phase-label/UI | Endast presentation utan explicit input; annars effekten från vald råserie. |
| Working capital | Rå serie → phase 1 `phase1.ts:57,79,84,151` | `FCFF -= ΔWC` | Corporate sum; DCF/IRR/payback; diagnostics/UI/tester | Beräkning/värdering; inte tax/EBITDA. |
| Depreciation | Rå optional serie → phase 1 `phase1.ts:56,78,89,151` | `EBIT=EBITDA-dep`; `FCFF += dep` | taxable income/tax; Corporate sum; UI/tester | Tax shield och valuation; non-cash addback. |
| EBITDA | `computeProjectPhase1`, `phase1.ts:88–92`; duplicerad live reconstruction `runCorporateSnapshot.ts:1828–1838` | `revenue-op-sc-ga-roy-rec+bp` | EBIT; Corporate strict sum; EV/EBITDA rows; UI/tooltips/tester | Tax/FCFF indirekt samt multiple valuation. |
| EBIT | phase 1 `phase1.ts:89–93`; live reconstruction `runCorporateSnapshot.ts:1839–1843` | `EBITDA-depreciation` | taxable income/tax; NOPAT; scenario ROCE; Corporate/UI/tester | Tax och FCFF. |
| Taxable income | phase 1 `phase1.ts:104–106`; live `runCorporateSnapshot.ts:1844` | `max(0, EBIT)` per project/period | Tax; Corporate sum/debug/tester | Tax och FCFF. |
| Tax | phase 1 `phase1.ts:108–118`; live `runCorporateSnapshot.ts:1845–1846` | `taxableIncome×taxRate` | NOPAT; Corporate sum; tax diagnostics/UI/tester | FCFF och valuation. |
| NOPAT | phase 1 `phase1.ts:126–128` | `EBIT-tax` | FCFF; Project-view metrics/tests | FCFF/valuation. |
| FCFF | phase 1 `phase1.ts:142–152`; live `runCorporateSnapshot.ts:1847–1855` | `NOPAT+dep-capex-sc-ΔWC` | Project phase 2; Corporate sum; cash waterfall; DCF/NPV; IRR; payback; ROI; charts/UI/tester | Huvudsaklig intrinsic-value-serie och operating financing cash. |
| Cumulative FCFF | Produceras lokalt i payback-implementationerna, inte som kanonisk snapshotserie | Odiscounterad löpande summa, t.ex. `computeLista3`, `metrics/lista3.ts:328–355` | Payback debug/UI/tester | Payback endast. |
| DCF | `computeProjectPhase2`, `phase2.ts:61–79`; Lista 2; canonical timeline `canonicalValuationTimeline.ts:198–228` | Summa remaining FCFF diskonterad till nod; present-value multiplicerar nod-DF | NPV nodes, graph High, tables, per share, UI/tester | Värdering/presentation. |
| NPV | phase 2; Corporate strict aggregate; Lista 2; canonical timeline | Idag `ΣFCFF/(1+r)^t`; framtida timeline-node `rolling DCF-initial capex before node` | financing NAV; timeline NAV; ratios; UI/tester | Finansiering och värdering. |
| NAV | financing engine och canonical timeline | `NPV+cash-debt`; live canonical använder reported cash och post debt | NAV/share, graph Low, P/NAV, market box, UI/tester | Equity valuation/presentation. |
| IRR | `computeIrr`, `metrics/lista3.ts:71–174`; anrop från phase 2/Lista 3/views | Rötter till `ΣFCFF/(1+r)^t=0`; vald root-policy nedan | Project/Corporate Lista 3, scenario cards/UI/debug/tester | Return metric, ingen downstream DCF. |
| Payback | `computeLista3`, `metrics/lista3.ts:297–355`; parallellt Lista3A och Project view | Odiscounterad cumulative FCFF med investment deficit och linjär interpolation | Project/Corporate model analysis, scenario cards/UI/debug/tester | Return metric endast. |
| Enterprise value | `computeCorporateMarketValue`, `corporate/marketValue/engine.ts:46–60`; Project view `computeProjectPreRevenueView.ts:417–420` | `marketCap+debt-cash+adjustments` | EV/NPV, EV/NAV, EV/share, market box/UI/tester | Market valuation/ratios. |
| Net cash | Financing `compute.ts:130–168`; canonical timeline `canonicalValuationTimeline.ts:184–211` | `cash-debt`; olika cash-baser beroende på consumer | NAV; multiple equity bridge; financing/UI/tester | Equity bridge/per share. |
| Shares current | Market input; resolver/validation | Extern current share count | market cap; financing base; market box; UI/tester | EV/market cap och finansiering. |
| Shares post financing | `computeCorporateFinancing`, `compute.ts:114–128`; pipeline lägger FD extras | `sharesCurrent + equityRaised/raisePrice + FD extras` | canonical per-share denominator; graph/table/multiples/UI/tester | Alla modeled per-share values. |
| EV/EBITDA 5/6/7 | `runCorporateSnapshot.ts:3417–3442` | `EV=EBITDA_Target×multiple`; equity/share=`(EV+netCash)/sharesPf` | `ValueRangeSnapshotCard`; Corporate chart/tooltips/tests | Graf/presentation; inte FCFF/NAV. |
| Per-share values | canonical timeline `canonicalValuationTimeline.ts:230–236`; multiple rows | target-currency absolute value / canonical `sharesPf` | selectors, project/corporate tables, charts, market comparison UI/tester | Presentation/equity interpretation. |

---

## 16. Fullständig direktläsningsaudit per central serie

Detta avsnitt skiljer uttryckligen **direkta läsningar** från indirekt downstream-påverkan. Testläsningar listas som testfamiljer i stället för varje enskild assertion; de ändrar inte runtime.

### 16.1 Production och revenue

| Serie | Project runtime-läsningar | Corporate runtime-läsningar | UI-läsningar | Testläsningar | Klass |
|---|---|---|---|---|---|
| `oreMinedTonnes` | tp-alignment och parser diagnostics | calendar strict sum till `snapshot.series` | Project operations grid/diagnostik | parser/alignment/snapshot-series tester | Validation + presentation |
| `oreMilledTonnes` | tp-alignment och parser diagnostics | calendar strict sum | Operations grid/diagnostik | samma familjer som ore mined | Validation + presentation |
| grade/recovery | parsern validerar/lagrar context | Ingen ekonomisk Corporate-läsning | Operationsdata när exponerad | parse/validation | Presentation only |
| `payableQtyByMetal` | streams; revenue; take base; AISC/tp validation | unit check + calendar sum; price/revenue diagnostics; efficiency inputs | production/metal diagnostics och tables | revenue, stream, take, parser, snapshot, AISC | Calculation |
| `priceUSDByMetal` | streams/revenue; tiered take; AuEq | calendar price diagnostics/scenarios | metal-price panels/scenario info | resolver, units, revenue, take | Calculation |
| `revenueByMetalUSD` | gross sum; metal-specific take | Corporate sum and revenue diagnostics | metal revenue diagnostics | revenue/take/snapshot | Calculation + presentation |
| `grossRevenueUSD` | national take; phase 1; Project AISC | Corporate total, scenario/efficiency calculations | project economics, diagnostics, modeled scenarios | engine, take, AISC, snapshot | Calculation |

### 16.2 Resultat och kassaflöde

| Serie | Direkta beräkningskonsumenter | Financing/valuation | UI | Tester | Anmärkning |
|---|---|---|---|---|---|
| Operating cost/site G&A/royalty/reclamation/BP credit | phase 1 EBITDA och sustaining cost | Endast via EBITDA/FCFF | economics breakdown/project grid | phase1/full-engine/snapshot | Breakdown-serierna är inte samma som phase1-serierna. |
| Sustaining CAPEX | phase1 EBITDA, sustaining cost och total CAPEX | Via FCFF/DCF; stress modifiers | economics/project grid/scenario | phase1, stress, snapshot, Corporate integration | Två direkta avdrag i cashflow-kedjan. |
| CAPEX | total CAPEX/FCFF | build funding, cash waterfall, initial-capex timeline bridge | Project/Corporate tables/financing debug | phase1, financing, Lista2/3, timeline | `capexUSD` kan omfatta initial och expansion. |
| Depreciation | EBIT, taxable income, FCFF addback | Via tax/FCFF | project economics/debug | phase1/snapshot identities | Ingen explicit amortization. |
| Working capital | FCFF | DCF/IRR/payback via FCFF | debug/economics | phase1/snapshot identity | Ingen separat OCF och ingen auto-unwind. |
| EBITDA | EBIT; identity diagnostics | 5/6/7 multiple valuation | EV/EBITDA overlay/tooltip | phase1, snapshot multiple/identity | Market box läser inte EBITDA. |
| EBIT | taxable income; scenario ROCE | via tax/FCFF | economics/model analysis | phase1, scenarios, identities | Corporate skatt räknas inte om från Corporate EBIT. |
| Taxable income/tax | tax respektive NOPAT | via FCFF | tax debug/tables | phase1, identities, snapshot | TaxesDetail är reference-only. |
| NOPAT | FCFF | via FCFF | model-analysis metrics | Project-view tests | Snapshot publicerar inte alltid en separat Corporate NOPAT-total. |
| FCFF | phase2, IRR, payback, ROI, cash waterfall operating cash | canonical DCF/NPV/NAV | graph/table/scenario/debug | omfattande valuation/snapshot/view tests | Samma intended enterprise cashflow, men adapters kopierar arrays. |

### 16.3 Value, financing och UI

| Värde | Direkta consumers | UI-komponenter/ytor | Testfamiljer | Endast presentation? |
|---|---|---|---|---|
| DCF/NPV/NAV timeline periods | canonical selectors och modeled rows | `ValueRangeSnapshotCard`, Project/Corporate valuation tables, graph render model, model analysis | canonical timeline, chart presentation, Corporate integration | Nej: NPV matar NAV/financing; graph values är presentation. |
| IRR/payback | scenario metric adapters och view model | Project model analysis, “Allt gick fel”/spot range, debug panels | Lista3, Lista3A, Project-view, snapshot series | Ja som slutmått; matar inte DCF. |
| Market Cap/EV | EV ratios och market comparison | market box/financing consistency debug | market value/project view | Slutligt market metric. |
| Cash/debt/net cash | NAV, EV och multiple equity bridge | financing table, market box, graph/tooltips/debug | financing/cash waterfall/timeline/integration | Nej, equity bridge. |
| Shares current/post financing | market cap, financing, every division | market box, dilution rows, all per-share tables/charts | financing/perShare/timeline/integration | Current shares påverkar financing; post shares påverkar presentation/equity unit. |
| EV/EBITDA rows | graph-map per year | `ValueRangeSnapshotCard` overlay, band, peak annotation, tooltip | `runCorporateSnapshot.series`, chart integration | Ja, slutlig relativvärderingspresentation. |

---

## 17. Produktionsaudit: explicit bruten kedja

Den begärda konceptuella kedjan och den faktiska runtime-kedjan är inte samma:

```text
Förväntad:
ore mined → ore milled → grade → contained → recovery → recovered → payable → revenue

Faktisk:
ore mined ───────┐
ore milled ──────┼─> tp validation + UI/Corporate display only
grade ───────────┤
recovery ────────┘

contained: MISSING
recovered: MISSING

raw payable ──> optional stream transformation ──> payable×price ──> revenue
```

### Verifieringssvar

1. **Hoppas nivåer över? Ja.** Contained och recovered produceras inte. Ore/grade/recovery kopplas inte till payable.
2. **Blandas contained/recovered/payable?** Nej i kod, eftersom de två första inte finns; men ett JSON-värde under `payableQtyByMetal` tas som redan fullt payable utan metallurgisk kontroll.
3. **Samma Project/Corporate production?** Corporate summerar Project payable/ore-serier efter kalenderår; den räknar inte om metallurgi. Stream-adjusted payable används för Project revenue, medan Corporate snapshotens publicerade `payableQtyByMetal` kommer från parserns rå payable context. Därmed kan publicerad Corporate payable och den effective stream quantity som skapade revenue skilja sig vid streams.
4. **Räknas produktion om?** Endast stream-transformation för revenue. Corporate gör strict sum; ingen ore→metal-recalculation.
5. **Throughput ekonomiskt?** Nej. Nameplate och utilization är presentation/diagnostik och används inte till ore milled, payable, cost eller revenue.

Det sista stream-fyndet är en viktig definitionsskillnad: revenue-outputet bär stream economics, men Corporate physical payable-serien aggregerar den ursprungliga payable-serien. Den är därför en physical inputserie, inte nödvändigtvis den effective quantity som prissattes till spot.

---

## 18. Prisresolver, overrides och FX: faktisk precedence

`parseProjectJsonV1` skapar först price-key-mapp och null/fallback-serier. Explicit `priceOverrides` har företräde framför legacy `metals.spotPriceUSDByMetal`; Au override behandlas likadant (`src/lib/project/jsonv1/parse.ts:1089–1132`). `resolveProjectPricesToEngineInput` fyller därefter varje price key från requestens scenario/fixed deck eller price service och normaliserar units innan `computeProjectEngineFullProductionV1` körs. Snapshoten loggar `priceSourceUsed` per metal och markerar missing/expired sources (`src/lib/snapshot/runCorporateSnapshot.ts:2195–2208`).

### Pris och enhet

- Quantity och price måste ha kompatibla kanoniska units. Revenue-motorn multiplicerar numeriskt och gör ingen intern unit conversion; conversion måste vara klar före anropet.
- AuEq använder Au price key som parsern tvingar att matcha `priceKeyByMetal.Au` (`parse.ts:1031–1049`).
- Fixed scenario i request ersätter resolverat spot för den körningen; low/high-scenarier skalar spot deck i snapshoten.
- Null price ger null metal revenue, inte zero.

### FX

```text
Project production/revenue/cost/tax/FCFF = USD
Project/Corporate NPV_Target = NPV_USD × FX_USD_to_Target
EBITDA_Target = EBITDA_USD × FX_USD_to_Target
BuildNeed_Target = BuildNeed_USD × FX_USD_to_Target
```

Cash, debt, market price, market cap, raise price och shares-finansiering är target-currency/börsenhetsvärden. Ingen FX appliceras på shares. Corporate aggregerar USD-serier före FX; den summerar inte target-currency Project values.

---

## 19. Kostnads-/CAPEX-matris med direkta tecken

Legend: `−` direkt avdrag, `+` direkt tillägg, `I` indirekt via föregående resultat, `F` financing input, `P` presentation only, `—` ingen användning.

| Kostnad | EBITDA | EBIT | Taxable income | FCFF | AISC | Finansiering | NAV | UI |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Operating costs | − | I | I | I | + numerator | — | I via FCFF | Ja |
| Site G&A | − | I | I | I | + numerator | — | I | Ja |
| Corporate G&A | — live | — | — | — live; − endast overlay | — | — | — live | Overlay/testdiagnostik |
| TC | — | — | — | — | — | — | — | P breakdown |
| RC | — | — | — | — | — | — | — | P breakdown |
| Royalties | − | I | I | I | + numerator | — | I | Ja |
| Sustaining CAPEX | **−** | I | I | **− igen** | + numerator | — direct | I | Ja |
| Initial CAPEX (`capexUSD`, pre-tp) | — | — | — | − | — | F build need/waterfall | I via NPV; initial-capex node bridge | Ja |
| Expansion CAPEX (`capexUSD`, post-tp) | — | — | — | − | — | Inte default build need | I | Ingen separat label |
| Reclamation | − | I | I | I, inte separat igen | + numerator | — | I | Ja/stress |
| Closure | — om ej input | enligt placerad serie | enligt placerad serie | enligt placerad serie | enligt reclamation | ev. om capex pre-tp | I | Phase label |
| Working capital | — | — | — | `−ΔWC` | — | operating cash via FCFF | I | Debug |
| Depreciation | — | − | I | + addback | — | — | I via tax/FCFF | Ja/debug |
| Interest | — | — | — | — | — | Debt stock only, ingen ränta | — | Ingen modeled cost |
| Financing fees | — | — | — | — | — | — | — | Saknas |
| Taxes | — | — | resultat | − via NOPAT | — | operating cash via FCFF | I | Ja/debug |

TC/RC-breakdownens `totalOperatingCostsUSD` är presentation/identity data. Den ersätter eller adderas inte automatiskt till phase1 `operatingCostsUSD`. Därför måste upstream-data säkerställa att TC/RC antingen redan är reflekterade i payable/revenue/op cost eller medvetet exkluderade.

---

## 20. Skatteaudit

### 20.1 Faktisk formel och tax shield

```text
EBIT[t] = EBITDA_model[t] - depreciation[t]
TaxableIncome[t] = max(0, EBIT[t])
Tax[t] = TaxableIncome[t] × taxRate
NOPAT[t] = EBIT[t] - Tax[t]
```

- Depreciation ger ett periodvis tax shield `depreciation × taxRate` så länge EBIT före depreciation är tillräckligt positivt.
- Depreciation läggs därefter tillbaka i FCFF, så endast skatteffekten återstår.
- Det finns **ingen loss carry-forward**, loss carry-back, tax pool, accelerated depreciation, interest shield eller deferred tax. Negativ EBIT ger helt enkelt taxable income och tax lika med noll samma period.
- `taxesDetail.federalIncomeTaxUSD` och `municipalRevenueTaxUSD` aggregeras för reference/debug men live-koden loggar uttryckligen att de inte är default tax source (`runCorporateSnapshot.ts:1885–1897`).

### 20.2 Vilka värden påverkar tax?

Direkt genom EBIT: revenue `+`; operating cost, sustaining CAPEX, site G&A, royalties, reclamation `−`; by-product credit `+`; depreciation `−`. Initial/expansion CAPEX, working capital, cash, debt, interest och financing fees påverkar inte taxable income.

### 20.3 Project kontra Corporate

Tax räknas per Project och period innan `aggregateEconomic('taxUSD')`. Corporate summerar projektskatt och räknar **inte** `max(0, Σ Corporate EBIT)×Corporate rate`. Följder:

- inga förluster kvittas mellan projekt;
- olika Project tax rates bevaras implicit i de summerade beloppen;
- Corporate `effectiveTaxRate` summeras också som en serie via generisk aggregator, vilket matematiskt inte är en viktad Corporate rate. En summa av procentsatser är inte en meningsfull koncernskattesats och bör behandlas som ett verifierat definitionsfel om den visas som Corporate rate.

---

## 21. FCFF-audit och kassaflödesidentitet

### 21.1 Exakt formel och tecken

```text
FCFF[t]
= EBIT[t]
- Tax[t]
+ Depreciation[t]
- CapexUSD[t]
- SustainingCapexUSD[t]
- WorkingCapitalDeltaUSD[t]
```

Eftersom `EBITDA_model` redan innehåller `-SustainingCapex`, blir den fullständigt expanderade formeln vid positiv taxable income:

```text
FCFF = (Revenue - OpCost - SC - G&A - Royalties - Reclamation + BP - Dep) × (1-taxRate)
       + Dep - Capex - SC - ΔWC
```

Det innebär två sustaining-CAPEX-vägar. Reclamation finns bara i första vägen. Depreciation neutraliseras före skatt och lämnar tax shield. Positive `ΔWC` är cash use; negative `ΔWC` är cash release. Closure påverkar endast om explicit i någon inputserie.

### 21.2 Samma FCFF till DCF, IRR och payback?

- `phase1Out.fcffUSD` skickas direkt till Project phase 2 (`engineFullProductionV1.ts:58–63`).
- Live reconstructionens `fcffByCentralEbit` lagras i `ProjectSeriesContext.economics.fcffUSD` och strict-summeras till Corporate `snapshotSeries.fcffUSD` (`runCorporateSnapshot.ts:1847–1855,2017–2023,826–858`).
- Corporate canonical timeline, Lista 2, Lista 3, scenario metrics och cash waterfall får denna Corporate-serie eller scenario-variant av samma serie.
- IRR och payback adapters gör array-slices/copies; de avser samma värden men är inte samma JavaScript-arrayreferens i alla kodvägar.
- Cash waterfall grossar upp construction CAPEX ur FCFF före den betalar capex en gång i waterfall (`cashWaterfall.ts:6–36`). Det ändrar financing cash roll-forward, inte intrinsic FCFF/DCF.

---

## 22. DCF/NPV/NAV-definitioner och grafsemantik

| Output | Cashflow, t0 och exponent | CAPEX | Cash/debt/shares | Consumer |
|---|---|---|---|---|
| Project `NPV_today` phase 2 | Project FCFF `t=0..N`, exponent `t`, rate `r` | Redan i FCFF | Ingen cash/debt/shares | Engine snapshot/diagnostik |
| Project `DCF_prodStart_exCapex` | Project FCFF `tp..N`, exponent `t-tp` | Post-tp FCFF innehåller all post-tp capex; pre-tp ignorerad | Ingen | Project metrics |
| Project `DCF_prodStart_present` | Föregående × `1/(1+r)^tp` | Samma | Ingen | Project table/high selector |
| Canonical DCF idag | Remaining Corporate/Project FCFF från `todayPeriod`; exponent tail index; sedan nod-DF | All CAPEX i FCFF | FX; per share använder sharesPf | Today high/NPV/table |
| Canonical future rolling DCF | Remaining FCFF från nod, exponent `0..tail` | All future CAPEX i FCFF | FX/sharesPf | Graph High |
| Canonical future NPV | `rolling DCF - initialCapexBefore(node)` | Drar dessutom pre-node initial capex enligt timeline-semantik | FX/sharesPf | Graph/table node metrics |
| NAV today/future | `NPV node + reported cash - post debt` | Reported cash väljs för att undvika CAPEX/cash-use dubbelräkning | sharesPf för NAV/share | Graph Low, tables, P/NAV |
| Market-box NAV | Canonical/project-view NAV input | FCFF/NPV-baserad | reported cash/post debt | Market box och P/NAV |
| Current EV | Market cap + post debt − post cash + adjustments | Ingen intrinsic CAPEX-formel | current shares för market cap | Market box ratios |

### Graph High och Low

`selectTimelineChartSeries` sätter `high=dcfPerShareTarget` och `low=navPerShareTarget` (`canonicalValuationTimeline.ts:320–325`). Presentation-adaptern har en särskild today-semantik: today High kan vara production-start DCF present value, medan senare High är rolling DCF. Därför är en grafkoordinat inte alltid samma scalar som periodens vanliga `dcfPerShareTarget`; `selectValuationChart`/render model är den slutliga källan för ritad punkt.

### P/NAV

`P_over_NAV = MarketCap_current / NAV_today`; current shares/current price skapar numerator, medan modeled FCFF + reported cash − post debt skapar denominator. Den är inte `price/NAV_per_share` via en separat formel, även om algebraisk likhet gäller när share-denominatorerna är konsistenta.

---

## 23. IRR- och payback-audit

### 23.1 IRR

`computeIrr` kräver finite cashflows med minst ett positivt och ett negativt värde. NPV-funktionen är `Σ CF[t]/(1+rate)^t` (`src/lib/metrics/lista3.ts:90–100`). Den skannar ett definierat rate-intervall, bracketar alla teckenbyten, löser varje bracket med bisection, deduplicerar och sorterar rötterna (`lista3.ts:102–153`).

**Root selection:** lägsta positiva root som ligger över project discount rate; om ingen sådan finns, lägsta icke-negativa root; annars null (`lista3.ts:155–172`). Multiple roots exponeras i debug som `roots`, tillsammans med sign-change count, selection reason och residual (`lista3.ts:268–279`). IRR är odiskonterad i den meningen att discount rate endast styr root selection; själva IRR-ekvationen använder sin kandidatränta.

### 23.2 Payback

Lista 3 approximate payback är `abs(initialCapex)/average annual FCFF from tp` när ratio-mode används. Real payback startar cumulative på `-investmentAbs`, adderar **odiskonterad** FCFF från `tp` och interpolerar inom första positiva crossing-period (`lista3.ts:297–355`). Live Corporate anropar den med `paybackRealUseInitialCapex: true` och `paybackApproxAsRatio: true` (`runCorporateSnapshot.ts:2768–2769`).

Paralleller:

1. `computeLista3` — Corporate huvudmått och scenario nodes.
2. `computeLista3aProjectEfficiencyMetrics` — FCFF-deficit-baserad variant.
3. `computeProjectPreRevenueView` — egen cumulative loop och debug, med guard att payback/IRR/ROI använder samma enterprise FCFF.

UI-konsumenter är Project/Corporate model-analysis listor, spot-range scenario table, “Allt gick fel”-scenario och payback/IRR debugpaneler i `SingleStockDashboard.tsx`; tester finns i `metrics/__tests__/lista3.test.ts`, `snapshot/__tests__/lista3aProjectEfficiency.test.ts`, Project-view tests och Corporate snapshot-series tests.

---

## 24. Finansieringsaudit: komplett stock-and-flow-kedja

```text
reported cash
  ↓ minus reserve/cash-use limits
usable initial cash
  ↓ cash-first mot periodens construction capex
remaining external funding need
  ├─ × debt fraction   → new debt
  └─ × equity fraction → equity raised / raise price → new shares

post cash = reported cash - initial cash used
post debt = existing debt + new debt
shares PF = shares current + new shares + project FD extras
net cash post = post cash - post debt

Intrinsic NAV bridge: NPV + reported cash - post debt
Current EV bridge: Market Cap + post debt - post cash + adjustments
Per share: intrinsic/relative equity value ÷ shares PF FD
```

### 24.1 Build need och waterfall

`deriveBuildFundingNeedUSD` identifierar tidigaste Project production year och summerar pre-production CAPEX enligt sin signkonvention (`deriveBuildFundingNeed.ts:26–68`). Live waterfall får per-project non-negative capex needs. För varje period:

```text
operatingCashGenerated = FCFF + constructionCapex addback
available = openingCash + operatingCashGenerated - reserve
internalCashUsed = min(available, capex need), project priority by construction start/id
externalNeed = capex need - internal cash used
debt/equity = externalNeed × project/default fractions
closingCash = opening + operating + debt + equity - capex
```

Formlerna finns på rader 20–45 i `src/lib/corporate/financing/cashWaterfall.ts`. Addbacken är nödvändig eftersom FCFF redan drog construction CAPEX; waterfall betalar den en gång som financing need.

### 24.2 Cash-definitioner

| Namn | Definition | Användning |
|---|---|---|
| Reported/latest quarterly cash | Balance-sheet input före byggfinansiering | Cash-first pool; canonical NAV; multiple equity bridge |
| Usable initial cash | `(reported-reserve)×cashUsePercent`, capped | Waterfall funding |
| `cash_t0_post` | Reported cash minus cash used for build | Current EV, liquidity/financing outputs |
| Closing Corporate cash | Waterfall roll-forward efter alla modeled periods | Financing debug; inte canonical NAV today |
| `cash_for_nav` | Reported cash | Canonical NAV för att full CAPEX redan finns i FCFF |
| Net cash post | post cash − post debt | Financing diagnostics/current EV additive inverse |
| Net cash NAV | reported cash − post debt | NAV och EV/EBITDA equity bridge |

### 24.3 Shares

`newShares = equityRaised / raisePrice`; `sharesPost = sharesCurrent + newShares` (`corporate/financing/compute.ts:114–128`). Pipeline summerar project-specific equity raises/shares och lägger `fdExtraShares` innan canonical denominator (`runCorporateSnapshot.ts:2490–2514`). Manual extra shares i UI läggs utan proceeds och räknar om alla per-share metrics (`canonicalValuationTimeline.ts:271–295`).

---

## 25. Corporate serie-för-serie-aggregering

| Corporate output | Färdig Project-serie eller omräkning? | Calendar/FX/tax/financing |
|---|---|---|
| Ore mined/milled | Färdig raw Project operations-serie, strict sum | Map local year→Corporate year; ingen FX |
| Payable per metal | Färdig raw Project payable, strict sum | Unit consistency required; ingen stream recomputation |
| Price per metal | Rekonstrueras/valideras på Corporate år från Project context/scenario | Inte summerad på samma sätt som quantities; används för diagnostics/revenue identity |
| Revenue per metal/total | Project revenue per metal aggregeras; total åter-summeras över metals | USD; kalenderalignerad |
| Op cost, SC, G&A, royalties, reclamation, BP, depreciation, WC, capex | Färdiga Project economics-input/outputserier, strict sum | USD; calendar map |
| EBITDA/EBIT/taxable/tax/FCFF | Live Project reconstruction skapar serien; Corporate `aggregateEconomic` strict-summerar | Ingen ny Corporate skatt; USD |
| Effective tax rate | Generisk sum av Project effective-rate-serier | Inte viktad; definitionsrisk |
| Sustaining cost/AISC | Project sustaining cost summeras; Corporate AISC räknas om från totals | AISC denominator kan avvika från Project AuEq |
| DCF/NPV/NAV | Räknas om från Corporate FCFF i canonical timeline/Lista 2 | Target FX efter aggregation; financing cash/debt/shares appliceras |
| IRR/payback | Räknas om från Corporate FCFF | Corporate cashflow return metrics |
| Financing | Separat waterfall på Corporate/project build needs | Target currency; ändrar cash/debt/shares, inte USD FCFF |
| EV/EBITDA | Räknas från Corporate EBITDA total | Target FX, net cash NAV, shares PF |

Delay/stress kan först modifiera raw project JSON eller skifta Corporate totals innan valuation. Därför måste audit av en scenario-output följa `aggregationEffective`, inte den ursprungliga `aggregation` eller parser context.

---

## 26. Alternativa och parallella kodvägar i en komplett graf

```text
RAW JSON
 ├─ time ──> resolveV2TimeAxis ─────────────┐
 ├─ operations raw ──> parser/tp validator  │ (display branch)
 ├─ payable raw ────────────────────────────┼─> streams ─> revenue engine
 ├─ price keys/overrides ─> price resolver ─┘
 └─ economics raw ─────────────────────────────────────────────┐
                                                               v
                 ┌─ takeItems engine ─┐
revenue ─────────┼─ manual royalties ─┼─ precedence ─> royalties
                 └─ royalty detail ───┘
                                 │
                                 v
              computeProjectPhase1 ─────────────> phase2 DCF/NPV/IRR (Project scalar branch)
                       │
                       └─ duplicated live reconstruction in runCorporateSnapshot
                                              │
                             calendar strict aggregation
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    v                         v                         v
          Lista2/Lista3 adapters     canonical timeline       cash waterfall/financing
          DCF/NPV/IRR/payback        rolling DCF/NPV/NAV       cash/debt/new shares
                    │                         │                         │
                    └─────────────────────────┼─────────────────────────┘
                                              v
                                  canonical selectors/view model
                                      │                 │
                                      v                 v
                              table/model analysis   graph High/Low
                                                        │
Corporate EBITDA total ─> ×5/6/7 + NAV net cash / PF shares ─> graph multiple overlay

SEPARATA PARALLELLER:
 ├─ corporate/aggregateProjects.ts (äldre/full Corporate aggregator)
 ├─ aggregateProjectsToCorporateTotals.ts (totals/stress helper)
 ├─ corporate overhead overlay (ej livekopplad)
 ├─ Project-view egen payback loop
 ├─ Lista3A payback
 └─ Producer Core reported EV/EBITDA (annan datadomän)
```

---

## 27. Numeriskt end-to-end-spårningstest: Abra Minimal 2028

Testet kopierade `scripts/fixtures/snapshot-requests/abra_minimal.json`, markerade kopian i minnet som v2 och satte det redan implicita produktionsstartåret 2028. Ingen fixture eller produktionskod skrevs om. Requesten kördes genom `runCorporateSnapshotPipeline({refresh:false, debug:true})`.

### 27.1 Produktion → revenue

| Led | Värde 2028 | Formel |
|---|---:|---|
| Payable Au | 120 000 toz | rå fixture |
| Au price | USD 2 100/toz | fixed price deck |
| Au revenue | USD 252 000 000 | `120 000×2 100` |
| Payable Cu | 25 000 000 lb | rå fixture |
| Cu price | USD 4,10/lb | fixed price deck |
| Cu revenue | USD 102 500 000 | `25 000 000×4,10` |
| Gross revenue | **USD 354 500 000** | `252 000 000+102 500 000` |

Fixture saknar ore/grade/recovery för den ekonomiska beräkningen; spårningen börjar därför, precis som runtime, vid payable quantities.

### 27.2 Revenue → tax → FCFF

| Led | USD | Kontroll |
|---|---:|---|
| Revenue | 354 500 000 | ovan |
| Operating cost | −180 000 000 | input |
| Sustaining CAPEX i EBITDA | −15 000 000 | input |
| Site G&A | −9 000 000 | input |
| Royalties | −5 000 000 | manual royalty precedence |
| Reclamation | −1 000 000 | input |
| By-product credit | +10 000 000 | input |
| EBITDA_model | **154 500 000** | exakt summa |
| Depreciation | 0 effektivt (`null→0`) | phase1 `safeValue` |
| EBIT | **154 500 000** | EBITDA−0 |
| Taxable income | **154 500 000** | `max(0, EBIT)` |
| Tax 27 % | **−41 715 000** | `154 500 000×0,27` |
| NOPAT | **112 785 000** | EBIT−tax |
| Depreciation addback | +0 | — |
| Initial/expansion capex 2028 | −0 | `capexUSD[2]=0` |
| Sustaining CAPEX i total capex | **−15 000 000** | andra avdraget |
| Working capital build | **−2 000 000** | `ΔWC[2]=+2m` |
| FCFF | **USD 95 785 000** | `112 785 000−15 000 000−2 000 000` |

### 27.3 FCFF → DCF/NAV/per share

- Valuation year/t0 är 2026; 2028 har exponent `2` och discount factor `1/1,1² = 0,826446281`.
- 2028 års FCFF-bidrag till today NPV är `95 785 000×0,826446281 = USD 79 161 157,02`.
- Hela Corporate FCFF-seriens DCF idag är USD 163 506 887,68, vilket vid FX 1,35 blir **CAD 220 734 298,36**.
- Reported cash CAD 5 000 000 minus post debt CAD 10 000 000 ger NAV net cash `−5 000 000`; canonical NAV idag blir **CAD 215 734 298,36**.
- Construction funding sker helt med equity efter CAD 5m cash-first: equity raised CAD 427 000 000, new shares 341 600 000 vid CAD 1,25 och shares PF **441 600 000**.
- DCF/NPV idag per share är `220 734 298,36/441 600 000 = CAD 0,499851`.
- NAV idag per share är `215 734 298,36/441 600 000 = CAD 0,488529`.
- Vid 2028 är EBITDA target `154,5m×1,35 = CAD 208,575m`; 5× EV är CAD 1 042,875m och equity/share efter `−5m` net cash är **CAD 2,350260**. 7× ger **CAD 3,294894**.
- Real payback output är **3,3 år** från production start enligt Lista 3:s odiskonterade cumulative/interpolation-definition.

Detta test verifierar med en enda faktisk period hela runnable-kedjan payable → revenue → EBITDA/EBIT → taxable income/tax → NOPAT → FCFF → discounted contribution → DCF/NPV → NAV → financing shares → per-share och EV/EBITDA graph value.

---

## 28. Klassificerat fel- och riskregister

| Klass | Serie/fynd | Kodställe | Downstream-påverkan | Grad | Rekommenderat kontrolltest |
|---|---|---|---|---|---|
| **A Verifierat fel** | Sustaining CAPEX subtraheras i EBITDA och igen i FCFF | `phase1.ts:88,142–151`; live `runCorporateSnapshot.ts:1837,1851–1855` | EBITDA, tax, FCFF, DCF, NPV, NAV, IRR, payback, AISC, multiples | Kritisk | Isolera 1 USD SC med positiv/negativ EBIT och verifiera delta `2-taxRate`; definiera korrekt expected. |
| **A Verifierat fel** | Corporate `effectiveTaxRate` aggregeras med summa av Project rates | `runCorporateSnapshot.ts:826–855` (`aggregateEconomic('effectiveTaxRate')`) | Corporate tax presentation/diagnostics och consumers som tolkar den som rate | Hög | Två samtidiga lönsamma projekt med 25 % och 30 %; kontrollera att output nu blir 55 % och ersätt senare med tax/EBIT-viktning. |
| **B Definitionsskillnad** | EBITDA är efter sustaining CAPEX/reclamation | `phase1.ts:86–92` | EV/EBITDA jämförbarhet | Kritisk | Reconciliation mot standard EBITDA för fixture/extern peer. |
| **B Definitionsskillnad** | Net cash post kontra NAV net cash | `compute.ts:130–168`; `runCorporateSnapshot.ts:2516–2525` | Current EV vs NAV/multiple equity | Hög | Fixture med partiell cash-first; assert varje cash bridge separat. |
| **B Definitionsskillnad** | Project AuEq AISC denominator vs live Corporate Au payable | `project/aisc/engine.ts:21–88`; `runCorporateSnapshot.ts:2219–2268` | AISC för multi-metal cases | Hög | Au+Cu fixture: jämför project och single-project Corporate AISC identity. |
| **B Definitionsskillnad** | Raw Corporate payable vs stream-effective revenue quantity | `computeRevenueByMetal.ts:68–118`; `runCorporateSnapshot.ts:703–747` | Physical production displayed vs revenue | Medel | Stream fixture: reconcile displayed payable, effective qty, delivered qty och revenue. |
| **B Definitionsskillnad** | Tax per Project, ingen Corporate netting | `phase1.ts:104–118`; Corporate sum `runCorporateSnapshot.ts:847–854` | Corporate tax/FCFF/NAV | Hög | Ett vinstprojekt + ett förlustprojekt; jämför summerad Project tax med consolidated tax. |
| **C Potentiellt fel** | By-product revenue och credit kan vara samma belopp | Revenue engine + `phase1.ts:77,88` | EBITDA/tax/FCFF/AISC/valuation | Kritisk om datan duplicerar | Fixture med by-product payable och credit; definiera datakontrakt och reconcile metal economics. |
| **C Potentiellt fel** | Closure kan ligga i reclamation och capex | Inget separat schemafält | FCFF/AISC/DCF | Hög | Fixture med explicit closure schedule; source-to-series reconciliation. |
| **C Potentiellt fel** | TC/RC breakdown visas utan ekonomisk koppling | `runCorporateSnapshot.ts:903–944` | UI reconciliation; risk upstream omission/dubbelräkning | Medel | Fixture med endast TC/RC breakdown; verifiera expected revenue/FCFF och märk presentation-only. |
| **C Potentiellt fel** | Expansion CAPEX kan ingå i funding need beroende på kalender/sign path | `deriveBuildFundingNeed.ts`; waterfall project need construction window | Debt/equity/shares | Hög | Pre-/post-tp expansion cases med positiva och negativa legacy sign conventions. |
| **C Potentiellt fel** | Flera payback/DCF adapters kan divergera | Lista3, Lista3A, Project view, phase2, timeline | UI return/value metrics | Hög | Golden fixture identity test över alla adapters och exakta noddefinitioner. |
| **D Medvetet modellval** | Reported cash i NAV undviker CAPEX double count | `runCorporateSnapshot.ts:2519–2525` | NAV/multiple equity | Dokumentera | Cash-first sensitivity med invariant intrinsic NPV och tydliga EV/NAV bridges. |
| **D Medvetet modellval** | No loss carryforward/interest shield | `phase1.ts:104–118` | Tax/FCFF | Materiell förenkling | Multi-year loss→profit fixture jämfört med tax-pool benchmark. |
| **D Medvetet modellval** | UI closure = last period | `canonicalValuationTimeline.ts:212–223` | Phase label | Låg | Last-period fixture utan closure cashflow; snapshot/UI assertion. |
| **D Medvetet modellval** | Corporate G&A overlay ej livekopplad | `corporate/overhead/engine.ts`; inget pipeline-anrop | Corporate FCFF/NAV | Hög model scope | Fixture med corporate G&A input och explicit expected inclusion policy. |
| **E Namngivning** | `depreciationUSD` kommenteras som D&A | `project/jsonv1/schema.ts:37–39` | EBITDA→EBIT reconciliation | Medel | Amortization-only case och schema-contract test. |
| **E Namngivning** | “Total revenue” är gross metal revenue före royalties | Revenue/national take | UI/analyst interpretation | Medel | Tooltip/schema naming test med royalty case. |
| **E Namngivning** | EV/EBITDA curve output är equity/share efter net cash | `runCorporateSnapshot.ts:3423–3441` | Chart interpretation | Hög | Assert tooltip distinguishes EV from implied equity/share. |

### Registerslutsats

Verifierade fel ska inte blandas ihop med förenklingar. Sustaining-CAPEX-behandlingen och summerad Corporate effective tax rate är kodmässigt verifierbara fel. By-product/closure/TC-RC-frågorna kräver datakontrakt eller kontrollfixtures innan de kan klassas som faktiska fel i ett visst case. Reported-cash-NAV är däremot ett uttryckligt designval som skyddar mot en annan CAPEX-dubbelräkning, men måste namnges tydligt.
