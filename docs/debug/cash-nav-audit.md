# Audit: kvartalskassa, finansiering och NAV

## Slutsats och första divergens

**Klassificering före rättning: E (blandade kassabegrepp), med B i både Project och
Corporate samt D i Corporate-milstolparna.** Den första exakta divergensen i Project
var `cashForNav = cashCurrent` i `computeProjectViewMetrics`, omedelbart efter att
samma funktion hade räknat `cashT0 = cashCurrent - cashUsedTarget`. Den första
Corporate-divergensen var motsvarande `cashForNavTarget =
balanceSheet.cash_t0_TargetCurrency` i `runCorporateSnapshotPipeline`, efter att
`cashAfterInitialFundingTarget` redan hade beräknats. Därmed minskade kassan externa
finansieringen men låg kvar till 100 % i NAV. Ingen separat `-cashUsed`-term fanns.

Corporate produktionsstarts-NAV använde dessutom samma statiska
`netCashForNavTarget` vid varje `tp`, trots att `corporate_cash_waterfall.rows`
redan innehöll periodiserad kassa och skuld. Det var en tidpunktsavvikelse (D).

Efter rättningen är Project `cashForNav = cashT0`. Corporate today använder
`cashAfterInitialFundingTarget`; varje Corporate värderingsperiod använder periodens
`closingCash` minus rapporterad öppningsskuld och kumulativ skuld till och med
perioden. Det finns fortfarande inget separat cash-used-avdrag.

## Faktiska kassabegrepp

| Faktiskt namn | Källa, valuta, tid | Ekonomisk typ/reserv | Project | Corporate | NAV/box |
|---|---|---|---|---|---|
| `cashAndCashEquivalents` | senaste finita kvartalsserien, rapportvaluta/target, t0 | rapporterad balanspost, före finansiering | ja | ja | input och “Latest Quarterly Cash” |
| `latestQuarterlyCash` / `latestQuarterlyCashTarget` | ovanstående; Corporate konverteras till USD före waterfall | rapporterad t0-kassa | ja | ja | finansiering, inte direkt canonical NAV efter rättning |
| `cash_t0_TargetCurrency` | requestens `balanceSheet` | rapporterad t0-balans | snapshot-input | ja | input/diagnostik |
| `minimumCashReserveTarget` | Project financing-input, UI sänder 0 | target, skyddad balans | ja | nej | finansiering |
| `minimum_cash_reserve_TargetCurrency` | financing plan | target; konverteras till USD | snapshot/Project-request = 0 | ja | waterfall |
| `cashAvailableAboveReserve` | `max(0, reported-reserve)` | finansieringskapacitet före procent | ja | motsv. `usableInitialCash` | finansiering |
| `usableInitialCash` | `(reported-reserve)*cashPercent` om checkbox på | USD, t0, exkluderar reserv | nej | ja | waterfall |
| `cashUsedTarget` / `cash_used_Target` | `min(available*percent, initialCapex)` | target, CAPEX-finansieringsflöde | ja | nej | Project box |
| `totalInitialCashUsed` / `cash_used_for_build_TargetCurrency` | summa `row.initialCashUsed` | USD/target, rapporterad kassa faktiskt använd | nej | ja | Corporate box |
| `internallyGeneratedCashUsed` | waterfall: användning utöver initial cash pool | USD, periodflöde | nej | ja | Corporate box |
| `cashT0` / `cash_t0` | `reportedCash-cashUsedTarget` | target, post-finance balans | ja | nej | Project NAV, EV och box |
| `cashAfterInitialFundingTarget` / `cash_t0_post_TargetCurrency` | reported minus total initial cash used | target, post-finance t0-balans | snapshot | ja | Corporate today NAV och box |
| `row.openingCash`, `row.closingCash` | waterfall roll-forward | USD, periodiserade balanser; reserv ingår | nej | ja | framtida Corporate NAV använder closing |
| `closing_corporate_cash_TargetCurrency` | sista waterfall-raden | target, slutbalans | nej | ja | Corporate box, inte automatiskt alla NAV-tider |
| `cash_for_nav_TargetCurrency` | canonical post-finance t0-kassa | target, balans | nej | ja | Corporate NAV today/diagnostik |
| `debtAddedTarget` / `Debt_Added_Target` | remaining need × debt fraction | target finansieringsflöde | ja | nej | Project NAV/box |
| `row.debtAdded`, `new_debt_TargetCurrency` | waterfall per period/kumulativt | USD/target finansieringsflöde | nej | ja | Corporate box |
| `debtT0` / `debt_t0_post_TargetCurrency` | reported debt + added debt | target balans | ja | ja | NAV och box |
| `netCashForNavTarget` | post-finance t0 cash minus post-finance debt | target balans | nej | ja | Corporate NAV today |
| `netCashAtValuationPeriodTarget(t)` | closing cash(t) − opening debt − cumulative debt(t) | target, tidsriktig balans | nej | ja | Corporate NAV vid t |
| `financingSnapshot` / `snapshot.financing` | samlad output från financing + waterfall | blandar tydligt namngivna t0-, period- och kumulativa fält | läses indirekt | ja | Corporate box och downstream |

Begreppsmappningen är därför: **reported cash** = senaste
`cashAndCashEquivalents`; **available** = cash över reserv gånger vald procent;
**used** = min(available, CAPEX-behov); **remaining** = reported-used;
**cash in NAV today** = remaining; **debt added** = extern need × debtandel;
**debt outstanding** = reported debt + debt added; **net cash in NAV** = canonical
cash balance − outstanding debt.

## FCFF, NPV, CAPEX och exakta NAV-formler

Project använder den centrala `fcfUSD`-serien. Den innehåller construction CAPEX som
negativ FCFF. Formlerna är:

* `Project NPV today (target) = FX * Σ fcfUSD[t]/(1+r)^(t+offset)` för
  icke-historiska perioder. Initial CAPEX ingår alltså i NPV.
* `DCF production start ex CAPEX = FX * Σ(t=tp..N)
  fcfUSD[t]/(1+r)^(t-tp)`; eftersom byggperioderna ligger före `tp` ingår de inte.
* `NPV production start = DCF production start ex CAPEX - |Initial CAPEX|`.
* `Project NAV today = Project NPV today + cashT0 - debtT0`.
* `Project NAV production start = NPV production start + cashT0 - debtT0`.
* Alla Project per-share-mått divideras med `sharesPf = sharesCurrent +
  equityRaise/issuePrice + extraShares`.

Initial CAPEX förekommer således en gång i NPV today via FCFF. I den alternativa
produktionsstartsbasen börjar DCF efter byggfönstret och CAPEX läggs därför tillbaka
som ett separat avdrag för att konstruera jämförbart NPV; det är inte ett extra
avdrag ovanpå samma seriesumma. `cashUsed` dras aldrig separat: dess enda NAV-effekt
är att canonical cash balance är lägre.

Corporate använder aggregerad `fcffUSD_total`:

* `Corporate NPV today = FX * Σ corporateFCFF[t]/(1+r)^t`; varje projekts initiala
  CAPEX ingår i serien.
* `Corporate NAV today = Corporate NPV today + cashAfterInitialFundingTarget -
  (reportedDebt + totalDebtAdded)`.
* För milstolpe/period `t`: `NPV_t = DCF_t_exCapex - incrementalCapex(window)` och
  `NAV_t = NPV_t + closingCorporateCash[t]*FX - (reportedDebt +
  cumulativeDebtAdded[0..t]*FX)`.
* High/Low/spot-scenarier ändrar FCFF/prisbasen men inte cash-bridge-definitionen.
  De absoluta pre-finance-värdena är finansieringsinvarianta; per-share-värdena
  använder samma post-finance FD denominator.

## Corporate waterfall

För varje period gäller implementationens hårda identitet:

`closingCash[t] = openingCash[t] + operatingCashGenerated[t] + debtAdded[t] +
 equityRaised[t] - projectCapexNeed[t]`.

När projekt-FCFF innehåller construction CAPEX grossas periodens FCFF upp med just
periodens CAPEX till `operatingCashGenerated`; CAPEX betalas sedan en gång i
waterfallen. `openingCash[t+1]=closingCash[t]`. Tillgänglig intern kassa är
`max(0, opening + operating - reserve)`. Projekten allokeras kronologiskt (och med
stabilt projekt-id vid samma start). Därför kan A:s FCFF finansiera B endast om den
har genererats senast i B:s finansieringsperiod; en senare A-start kan inte göra det.

Samma reported cash finns både som input till waterfall och i financing snapshot,
men efter rättningen är snapshotens NAV-fält härledda från waterfallens canonical
balans; det separata reported-fältet är endast ursprung/presentation.

## Kontrollmatris (deterministisk 300 MSEK build, 100 MSEK reported cash)

NPV står för samma pre-finance NPV i samtliga Project-rader; öppningsskuld är noll,
emissionskurs 3 och 100 % equity om inget annat anges.

| View | Tid | Reported | Available | Used | Remaining | Debt added/outstanding | Cash i NAV | Net cash | NPV basis/CAPEX | separat CAPEX | separat cash-used | NAV |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|
| Project, av | today | 100 | 0 | 0 | 100 | 0/0 | 100 | 100 | FCFF, ja | nej | nej | NPV+100 |
| Project, 50 % | today | 100 | 50 | 50 | 50 | 0/0 | 50 | 50 | FCFF, ja | nej | nej | NPV+50 |
| Project, 100 % | today | 100 | 100 | 100 | 0 | 0/0 | 0 | 0 | FCFF, ja | nej | nej | NPV |
| Project, cash > need | today | 400 | 400 | 300 | 100 | 0/0 | 100 | 100 | FCFF, ja | nej | nej | NPV+100 |
| Project, reserv 150 | today | 400 | 250 | 250 | 150 | 0/0 | 150 | 150 | FCFF, ja | nej | nej | NPV+150 |
| Corporate 2 projekt | today | R | `(R-res)*p` | waterfall initial | R-used | kumulativ | R-used | cash-debt | agg FCFF, ja | nej | nej | NPV+net cash |
| Corporate, A FCFF före B | B-start | R | periodisk | A+B-allokering | closing[B] | kumulativ t.o.m. B | closing[B] | tidsriktig | agg FCFF/window | ja, window | nej | NPV_B+net cash_B |
| Corporate, A för sen | B-start | R | periodisk | ingen framtida A-FCFF | closing[B] | extern B-finansiering | closing[B] | tidsriktig | agg FCFF/window | ja, window | nej | NPV_B+net cash_B |

Före rättningen var Project-radernas cash i NAV alltid reported (100/100/100/400/400)
och Corporate today reported; samtliga Corporate framtidspunkter använde samma
statiska t0-net cash. Eftervärdena är tabellens remaining/periodiserade värden.

## Isolerat A/B-test: reported cash 0 → 100 MSEK

Buildbehov 300 MSEK, emissionskurs 3, 300 miljoner befintliga aktier och oförändrad
pre-finance NPV. `Δ` är Case B minus Case A.

| Checkbox/mix | ΔNPV | Δcash used | Δremaining need | Δequity | Δdebt | Δnew shares / sharesPF | Δcash NAV | Δdebt i NAV | Δabsolut NAV | Förklaring |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| av, 100 % eq | 0 | 0 | 0 | 0 | 0 | 0 / 0 | +100 | 0 | +100 | kassan förbrukas inte |
| på, 100 % eq | 0 | +100 | -100 | -100 | 0 | -33,333m / -33,333m | 0 | 0 | 0 | lägre utspädning, ingen kvarvarande cash |
| på, 100 % debt | 0 | +100 | -100 | 0 | -100 | 0 / 0 | 0 | -100 | +100 | skuldbridge förbättras |
| på, 60/40 | 0 | +100 | -100 | -60 | -40 | -20m / -20m | 0 | -40 | +40 | 60 av värdet syns som minskad utspädning, 40 som lägre skuld |

Testet visar varför absolut NAV inte ensamt ska förväxlas med per-share-värde eller
utspädning. I inget fall uppstår +200 eller ett oidentifierat avdrag. Före rättningen
blev Δcash i NAV felaktigt +100 även när cash-first var på, vilket gav +100 extra
utöver skuld-/utspädningseffekten.

## Verifierade feltyper och begränsningar

* **Fel A:** fanns i Project och Corporate today; rättat.
* **Fel B:** fanns inte; ingen direkt eller indirekt separat `-cashUsed`-term.
* **Fel C:** den syntaktiska kedjan `DCF - CAPEX + net cash` finns, men är inte ett
  dubbelavdrag: DCF exkluderar byggperioderna och CAPEX-avdraget skapar NPV-basen;
  post-finance net cash är därefter equity bridge. Cash används inte ytterligare.
* Project-UI har ingen reservkontroll och sänder uttryckligen noll. Motorn stödjer nu
  reservdefinitionen `(reported-reserve)*cash_use_percent`; Corporate hade redan
  samma definition och testskydd.
* Waterfallen modellerar bara de uttryckliga FCFF-, CAPEX- och externa
  finansieringsflödena. Ränta/amortering eller andra corporate-flöden ska inte
  antas om de saknas i input. Inom den begränsningen används en faktisk dynamisk
  kassabalans vid framtida Corporate värderingstidpunkter; Project har bara en enkel
  post-finance t0-balans och gissar inte framtida kassagenerering.

Regressionerna stämmer av reported = used + remaining, reservgolv,
finansieringsidentiteten, waterfallens periodidentitet, oförändrad absolut NPV,
canonical cash i NAV, tidsriktig Corporate cash/debt samt alla per-share-denominatorer.
