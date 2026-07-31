# Fas 1 — korrigering av EBITDA och sustaining CAPEX

## Verdict: **FIXED**

Produktionskoden motsvarade den tidigare auditens beskrivning exakt: serien `ebitdaUSD` drog sustaining CAPEX, EBIT/skatt byggdes från serien, och FCFF drog sedan `totalCapexUSD = capexUSD + sustainingCapexUSD`. Korrigeringen är nu implementerad och testad.

## 1. Namnval

Det tidigare måttet heter nu:

```text
Sustaining-adjusted operating earnings
kodfält: sustainingAdjustedOperatingEarningsUSD
```

Namnet anger att sustaining investment redan har dragits av, innehåller inte EBITDA och gör inte anspråk på att vara EBIT, operating cash flow eller free cash flow. Måttet är ett projektspecifikt driftresultat efter sustaining CAPEX och används fortsatt som bas för EBIT och skatt.

## 2. Gammal och ny faktisk formel

### Före korrigeringen

```text
ebitdaUSD (fel namn)
= Revenue
- Operating costs
- Sustaining CAPEX
- Site G&A
- Royalties
- Reclamation
+ By-product credits

EBIT = ebitdaUSD - Depreciation
TotalCAPEX = capexUSD + SustainingCAPEX
FCFF = NOPAT + Depreciation - TotalCAPEX - ΔWC
```

Sustaining CAPEX påverkade därmed FCFF först genom det felbenämnda EBITDA/EBIT/skatteledet och sedan en gång till genom `TotalCAPEX`.

### Efter korrigeringen

```text
EBITDA
= Revenue
- Operating costs
- Site G&A
- Royalties
- Reclamation operating expense
+ By-product credits

Sustaining-adjusted operating earnings
= EBITDA
- Sustaining CAPEX

EBIT
= Sustaining-adjusted operating earnings
- Depreciation

Taxable income = max(0, EBIT)
Tax = Taxable income × tax rate
NOPAT = EBIT - Tax

FCFF
= NOPAT
+ Depreciation
- capexUSD
- ΔWorking capital
```

`totalCapexUSD = capexUSD + sustainingCapexUSD` behålls som kostnads-/rapporteringsserie, men används inte längre som FCFF-avdrag. FCFF drar endast `capexUSD`; sustaining CAPEX finns redan exakt en gång i `sustainingAdjustedOperatingEarningsUSD`.

## 3. Klassificering av kostnader

| Post | EBITDA | Sustaining-adjusted operating earnings | Kommentar |
|---|---:|---:|---|
| Operating costs | − | − | Direkt period-OPEX. |
| Site G&A | − | − | Direkt Project-period-OPEX. |
| Royalties | − | − | Vald take/manual/detail-serie. |
| Reclamation | − | − | Nuvarande modell behandlar serien som periodvis operating accrual: den ingår i sustaining cost/AISC och hade uttryckligt skydd mot separat FCFF-avdrag. Klassificeringen behålls; closure-CAPEX kräver ett separat framtida datakontrakt. |
| By-product credits | + | + | Separat periodcredit. |
| Sustaining CAPEX | — | − | Investment; exkluderas ur EBITDA men behålls i driftmåttet/AISC/periodtabeller. |
| Depreciation/amortisation | — | — | `depreciationUSD` dras först vid EBIT. Ingen separat amortisationserie finns. |
| Initial/expansion CAPEX | — | — | `capexUSD` dras i FCFF. |
| Working capital | — | — | Dras först i FCFF. |
| Tax | — | — | Dras via NOPAT. |
| TC/RC/transport/treatment/refining | Ingen separat direkt term | Ingen separat direkt term | Breakdown-serierna är presentation/diagnostik; ekonomisk effekt finns endast om upstream har lagt dem i operating costs, payable economics eller annan central serie. |

## 4. Ekonomisk separation

Den nya `ebitdaUSD` är en parallell informations- och värderingsserie. Den kalenderaggregeras och driver EV/EBITDA, tabeller och debug-output, men den används **inte** för EBIT, taxable income, tax, NOPAT, FCFF, DCF, NPV, NAV, IRR eller payback.

Den befintliga ekonomiska kedjan fortsätter från `sustainingAdjustedOperatingEarningsUSD`. Detta bevarar skattens tidigare sustaining-CAPEX-effekt och tar endast bort det andra nominella CAPEX-avdraget.

## 5. Exakt korrigerade kodställen

| Fil/funktion | Ändring |
|---|---|
| `src/lib/project/phase1.ts`, `computeProjectPhase1` | Producerar båda serierna; EBIT bygger från sustaining-adjusted operating earnings; FCFF drar `cx`, inte `totalCapexUSD`. |
| `src/lib/project/types.ts`, `ProjectPhase1Output` | Exponerar `sustainingAdjustedOperatingEarningsUSD`. |
| `src/lib/snapshot/runCorporateSnapshot.ts`, Project live reconstruction | Samma två serier rekonstrueras; EBIT/FCFF/loggar/identity checks använder rätt definition. |
| `src/lib/snapshot/runCorporateSnapshot.ts`, `buildSnapshotSeries` | Kalenderaggregerar båda serierna; `aggregationEffective` exponerar båda totalerna. |
| `src/lib/corporate/snapshot/types.ts` | Snapshottypen exponerar det nya driftmåttet. |
| `src/pages/projectGridPnl.ts` | UI-fallbacks skiljer EBITDA från driftmåttet och använder rätt EBIT/taxable/FCFF-bryggor. |
| `src/pages/projectOperationsGrid.ts`, `ProjectsPage.tsx` | Visar båda serierna med separata labels. |
| `src/components/SingleStockDashboard.tsx` | Walkthrough, formler, sources och FCFF-debug har korrigerats. |
| Project/snapshot/UI-tester | Nya definitioner och numeriska invariants verifieras. |

## 6. Tidigare consumers och ny routing

| Tidigare `ebitdaUSD`-consumer | Efter ändringen |
|---|---|
| EBIT och tax chain | Använder `sustainingAdjustedOperatingEarningsUSD`. |
| FCFF indirekt via EBIT | Använder driftmåttet; inget andra sustaining-CAPEX-avdrag. |
| Corporate kalenderaggregering | Aggregerar både verklig EBITDA och driftmåttet. |
| Corporate EV/EBITDA 5×/6×/7× | Använder verklig `ebitdaUSD`. |
| Project/Corporate P&L-tabeller | Visar “EBITDA” för nya serien och “Sustaining-adjusted operating earnings” för gamla definitionen. |
| Audit-/identity-loggar | EBITDA identity testar nya formeln; EBIT identity testar driftmått minus depreciation. |
| Producer Core rapporterad EV/EBITDA | Oförändrad; detta är en separat reported-data-domän. |

## 7. Producer–consumer-tabell

| Värde | Producer | Formel | Consumers |
|---|---|---|---|
| Revenue | Revenue engine/live central revenue | Σ metal revenue | Båda rörelsemåtten, royalties, UI. |
| Verklig EBITDA | Phase 1/live reconstruction | `R-op-ga-roy-rec+bp` | Corporate aggregation, EV/EBITDA, UI/debug. |
| Sustaining-adjusted operating earnings | Phase 1/live reconstruction | `EBITDA-sc` | EBIT, tax chain, UI/debug. |
| EBIT | Phase 1/live reconstruction | `operating earnings-dep` | Taxable income, tax, NOPAT. |
| Tax | Phase 1/live reconstruction | `max(0, EBIT)×rate` | NOPAT/FCFF. |
| NOPAT | Phase 1 | `EBIT-tax` | FCFF. |
| Sustaining CAPEX | Raw Project periodserie | Input; `−` i driftmåttet | Driftmått, AISC, cost tables, diagnostics; inte separat FCFF-avdrag. |
| Initial/other CAPEX | Raw `capexUSD` | Input | FCFF, financing build need, DCF. |
| FCFF | Phase 1/live reconstruction | `EBIT-tax+dep-capex-ΔWC` | Corporate sum, DCF/NPV/NAV, IRR, payback, financing waterfall. |

## 8. Numeriskt definitionstest

Input: Revenue 100, operating costs 40, site G&A 5, royalties 3, reclamation 2, by-product credits 4, sustaining CAPEX 10, depreciation 6 och tax rate 25 %.

```text
EBITDA = 100-40-5-3-2+4 = 54
Sustaining-adjusted operating earnings = 54-10 = 44
EBIT = 44-6 = 38
Tax = 38×25% = 9.5
NOPAT = 28.5
FCFF före initial CAPEX/WC = 28.5+6 = 34.5
```

Utan sustaining CAPEX är FCFF 42. En ökning med 10 minskar driftmåttet med 10, minskar tax med 2.5 och minskar FCFF med **7.5**. Det finns inte längre ett ytterligare avdrag om 10. Ett separat initial CAPEX om 7 minskar FCFF från 34.5 till 27.5.

## 9. Abra Minimal före/efter

| Mått | Före | Efter | Förändring |
|---|---:|---:|---:|
| EBITDA 2028 USD | 154 500 000 (felbenämnt) | 169 500 000 | +15 000 000; sustaining CAPEX exkluderas |
| Sustaining-adjusted operating earnings USD | 154 500 000 (under EBITDA-namn) | 154 500 000 | 0 |
| EBIT USD | 154 500 000 | 154 500 000 | 0 |
| Tax USD | 41 715 000 | 41 715 000 | 0 |
| FCFF 2028 USD | 95 785 000 | 110 785 000 | +15 000 000 |
| NPV today CAD | 220 734 298.36 | 318 945 439.73 | +98 211 141.37 |
| NAV today CAD | 215 734 298.36 | 313 945 439.73 | +98 211 141.37 |
| IRR | 21.0517 % | 25.3186 % | +4.2669 pp |
| Real payback | 3.3 år | 2.9 år | −0.4 år |
| EV/EBITDA 5×/share 2028 CAD | 2.350260 | 2.579540 | +0.229280 |
| EV/EBITDA 7×/share 2028 CAD | 3.294894 | 3.615885 | +0.320992 |

DCF/NPV/NAV/IRR/payback ändras därför att FCFF rättas. EV/EBITDA ändras av ett annat avsiktligt skäl: den använder nu verklig EBITDA. EBIT och skatt är oförändrade eftersom de uttryckligen fortsätter från det omdöpta driftmåttet.

## 10. Tester

- Definitionstest för 54/44/38 och 25-procentig skatt.
- Isolerad sustaining-CAPEX-känslighet: FCFF-delta 7.5, inte 17.5.
- Initial CAPEX-regression: fullt separat avdrag om 7.
- Single-project Corporate identity: Corporate EBITDA, driftmått och FCFF följer samma Project-serie utan corporate-only adjustment.
- EV/EBITDA multiplier identity använder nya EBITDA.
- Regressioner för timeline/NPV/NAV, IRR/payback, cash waterfall/financing, AISC, Corporate integration och UI grids.

## 11. Kvarstående osäkerheter

1. `reclamationUSD` saknar explicit OPEX/accrual kontra closure-CAPEX-tag. Nuvarande befintliga behandling som period-OPEX har bevarats.
2. TC/RC/transport-breakdowns är inte direkt inkopplade i phase 1.
3. `totalCapexUSD` inkluderar fortsatt sustaining CAPEX för rapportering; consumers får inte anta att serien är det faktiska FCFF-avdraget.
4. `depreciationUSD` bär i praktiken eventuell D&A; amortisation saknar eget fält.
5. Parallella implementationer och wrappers dokumenteras separat i Fas 2.

## Slutverdict

**FIXED.** Verklig EBITDA är separerad från det projektspecifika driftmåttet, EV/EBITDA använder rätt serie, EBIT/skatt behåller avsedd historisk bas, och sustaining CAPEX påverkar FCFF exakt en gång.
