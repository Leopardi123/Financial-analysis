# Read-only audit: EBITDA, by-product credits och reclamation

**Auditbas:** källträdet efter `597a048` (den granskade ändringen finns i nuvarande HEAD).
**Metod:** faktisk exekveringsväg, tre incheckade projekt-fixtures och deterministiska isoleringstest. Ingen runtime-kod har ändrats.

## Executive verdict

| Område | Verdict | Kort skäl |
|---|---|---|
| Ny EBITDA | **CORRECT WITH DATA-CONTRACT CAVEATS** | Formeln exkluderar sustaining CAPEX, depreciation, skatt, initial CAPEX och WC, men `byproductCreditsUSD` saknar kontrakt mot metallrevenue och `reclamationUSD` blandar closure och periodkostnad. |
| Sustaining-adjusted operating earnings | **CORRECTLY DEFINED BUT NAME IMPRECISE** | Serien är exakt EBITDA minus sustaining CAPEX, men ordet “earnings” döljer att ett investeringsutflöde ingår. |
| By-product credits | **NOT VERIFIED** | Runtime tillåter bevisligen dubbelräkning. Abra har både all-metall-revenue och positiva credits, men fixture anger inte vilken ekonomisk post credits representerar; samma intäkt kan därför varken bevisas eller frias. |
| Reclamation | **MIXED/AMBIGUOUS DATA CONTRACT** | Abra fördelar posten över driftåren medan Los Ricos South uttryckligen lägger en “Closure cost” i sista perioden i samma fält. Båda behandlas identiskt som EBITDA-/skatte-/AISC-post. |
| Total cash-flow bridge | **CORRECT WITH CAVEATS** | Den kodade bryggan drar sustaining CAPEX en gång och återlägger depreciation korrekt. Ekonomisk klassificering av credits/reclamation samt några UI-fallbacks är osäker/felvisande. |

## 1. Faktisk kodkedja och formelverifiering

### Project-producenter

| Serie | Producent, rader | Faktisk formel; inputs | Output/enhet/period | Null/fallback och consumers |
|---|---|---|---|---|
| `revenueByMetalUSD`, `grossRevenueUSD` | `computeRevenueByMetalUSD`, `src/lib/project/revenue/computeRevenueByMetal.ts:31-146`, anropad via revenue engine | För varje överlappande metall: `effective payable qty × spot price + streamed delivered qty × purchase price`; gross = strikt summa av samtliga metallserier | USD per projektperiod | Saknad metall/price-overlap diagnostiseras; invalid/negativ qty eller price ger `null`; en null metall gör gross null. Konsumeras av royalties, phase1 revenue, AISC-denominator, Project/UI och snapshot. |
| `ebitdaUSD` | `computeProjectPhase1`, `src/lib/project/phase1.ts:48-101` | `revenue - operatingCosts - siteG&A - royalties - reclamation + byproductCredits` | USD/projektperiod | Alla utom `capexUSD` läses med `safeValue` (null/icke-tal blir 0); icke-finit resultat blir null. Endast informations-/värderingsserie: UI, Corporate aggregation och EV/EBITDA. |
| `sustainingAdjustedOperatingEarningsUSD` | samma, `phase1.ts:59-100` | EBITDA `- sustainingCapex` | USD/projektperiod | Samma safe-zero-policy. Direkt bas för EBIT; UI och Corporate. |
| `ebitUSD` | samma, `phase1.ts:94-101` | sustaining-adjusted operating earnings `- depreciation` | USD/projektperiod | safe-zero depreciation; bas för taxable income, tax, NOPAT och FCFF. |
| `taxableIncomeUSD`, `taxUSD` | samma, `phase1.ts:103-136` | `max(0, EBIT)`; därefter `taxable × taxRate` | USD/projektperiod | Null tax rate ger null tax/NOPAT/FCFF. Ingen loss carry-forward eller projektkvittning. |
| `nopatUSD`, `fcffUSD` | samma, `phase1.ts:134-162` | `NOPAT=EBIT-tax`; `FCFF=NOPAT+depreciation-capexUSD-ΔWC` | USD/projektperiod | `capexUSD=null` ger null; övriga inputs safe-zero. FCFF går till phase2 DCF/NPV/IRR/payback, finansiering, Corporate och UI. |
| `totalCapexUSD` | samma, `phase1.ts:150-151` | `capexUSD+sustainingCapexUSD` | USD/projektperiod, rapportering | Är **inte** FCFF-avdraget; UI/diagnostik måste inte beskriva det som sådant. |

`operatingCostsUSD` är redan en sammanställd input till phase1. TC/RC, transport, mining och processing är därför inte separata avdrag här: om de ingår gör de det uppströms i operating-cost-serien. Varken phase1 eller revenue-resolvern klassificerar en metall som primary/by-product.

### Formelstatus

| Påstående | Status | Bevis/precisering |
|---|---|---|
| EBITDA = Revenue − op cost − site G&A − royalties − reclamation + credits | **VERIFIED** | `phase1.ts:93`; live reconstruction `runCorporateSnapshot.ts:1817-1825`. |
| Sustaining-adjusted operating earnings = EBITDA − sustaining CAPEX | **VERIFIED** | Algebraisk identitet mellan `phase1.ts:90` och `:93`; isoleringstest A/E. |
| EBIT = sustaining-adjusted operating earnings − depreciation | **VERIFIED** | `phase1.ts:94`; live `runCorporateSnapshot.ts:1826-1830`. |
| Taxable income = max(0, EBIT) | **VERIFIED** | `phase1.ts:112-114`; ingen förlustframföring. |
| Tax = taxable income × rate | **VERIFIED** | `phase1.ts:116-125`; null rate avbryter kedjan. |
| NOPAT = EBIT − tax | **VERIFIED** | `phase1.ts:134-136`. |
| FCFF = NOPAT + depreciation − capexUSD − ΔWC | **VERIFIED** | `phase1.ts:157-162`. `capexUSD` är initial/expansion/annan icke-sustaining-serie, inte rapportfältet `totalCapexUSD`. |

### Snapshot och Corporate

Snapshotens live-väg **duplicerar matematiken** i `runCorporateSnapshot.ts:1806-1842`: den bygger SAOE, EBITDA, EBIT, tax och FCFF på nytt med null revenue som null men övriga poster `?? 0`. Den är numeriskt lik phase1 för normala/safe-zero inputs, men är en separat implementation.

`buildSnapshotSeries` räknar däremot inte om ekonomin: `aggregateEconomic` kalendermappar och summerar projektens färdiga serier (`runCorporateSnapshot.ts:802-835`). Revenue summeras separat per metall (`:792-800`). Null-policy skiljer sig: strikt aligned series kan göra Corporate-perioden null, medan total revenue använder `?? 0`; royalties och tax normaliseras dessutom delvis till noll. `effectiveTaxRate` går felaktigt genom samma summationsfunktion (`:827`) och är därför inte en meningsfull koncernprocentsats.

EV/EBITDA läser endast `aggregationEffective.ebitdaUSD_total`, konverterar valuta och använder samma serie för 5×/6×/7× (`runCorporateSnapshot.ts:3413-3433`). Equity-per-share-kurvan är `EBITDA×multiple + net cash`, dividerad med post-financing shares.

## 2. Revenue och by-product credits

### Bevisad runtime-semantik

1. `grossRevenueUSD` innehåller **alla** keys som finns i både `payableQtyByMetal` och `priceUSDByMetal` (`computeRevenueByMetal.ts:38-40,53-55,125-138`). Au, Ag, Cu, Zn och Pb behandlas lika om serierna finns.
2. Det finns ingen primary/by-product/co-product-klassificering i revenue-funktionen.
3. `byproductCreditsUSD` är en oberoende phase1-input. Den härleds inte från `revenueByMetalUSD` och valideras inte mot den.
4. Runtime kan därför lägga samma ekonomiska bidrag i gross revenue och ännu en gång med `+ byproductCreditsUSD`.
5. Ingen schema-guard, assertion eller reconciliation förhindrar detta.

Audit-test B bevisar mekanismen: Au-revenue 80 + Cu-revenue 20 ger gross 100; credit 0 ger EBITDA 100, credit 20 ger EBITDA 120. Det bevisar **kapacitet till dubbelräkning**, inte att ett visst datafält avser exakt Cu-beloppet.

### Tillgängliga data (ingen kategori har fabricerats)

Repo innehåller bara tre användbara projekt-fixtures. Det finns inget separat verkligt guldprojekt med dokumenterad by-product, inget silvercase med betalbara Au/Cu/Pb/Zn, och inget kopparcase med dokumenterade Au/Ag-credits. Det är en explicit täckningslucka.

| Case/period | Metall/post | Payable qty × price | Metallrevenue | I gross? | Även credit? | Slutsats |
|---|---|---:|---:|---|---|---|
| Abra Minimal, t2 | Au | 120,000 oz × $2,100 | $252.0m | Ja | Creditfält +$10m, ej metallallokerat | Ej möjligt att bevisa samma post |
| Abra Minimal, t2 | Cu | 25.0m lb × $4.10 | $102.5m | Ja | Creditfält +$10m, ej metallallokerat | **Data-contract risk**; gross $354.5m och EBITDA får dessutom +$10m |
| Los Ricos North | Au och Ag | Qty-serier finns; runtime-pris kommer utifrån snapshot-request | Båda summeras när priser finns | Ja | `byproductCreditsUSD=0` samtliga perioder | Ingen faktisk dubbelräkning i fixture |
| Los Ricos South | Ag, Au och Cu | Qty-serier finns; price keys resolveras externt | Alla tre summeras när priser finns | Ja | Credits är null och safe-zero i phase1 | Ingen positiv credit; Pb/Zn price choices finns men inga payable-serier |

**Klassificering:** **DATA-CONTRACT RISK** i den detaljerade femgradiga klassificeringen; slutverdict **NOT VERIFIED** eftersom alternativen inte innehåller “runtime allows + current data unresolved”. Abra är inte bevisligen clean och inte bevisligen dubbelräknad: dess `meta.notes` säger endast fixture och ger ingen credit-proveniens.

## 3. Reclamation, closure och slutposter

`reclamationUSD` kommer direkt från Project JSON phase1. Motorn skapar ingen automatisk closure expenditure, salvage eller decommissioning-serie. Den enda automatiska slutmekanismen i den granskade kedjan är att working-capital delta kan vara negativt (unwind); dess placering bestäms av inputserien. En UI-period kan heta closure utan att detta skapar ett kassaflöde.

Reclamation påverkar:

* EBITDA, SAOE och EBIT direkt med minus, därmed skatt och FCFF indirekt.
* `sustainingCostUSD = op + sustaining capex + G&A + royalties + reclamation − credits` (`phase1.ts:87`) och därmed AISC numerator (`src/lib/project/aisc/engine.ts:64-88`).
* Inte ett andra separat FCFF-avdrag. Om samma belopp även ligger i `capexUSD` dras den senare serien separat och resultatet blir dubbel effekt.

| Projekt | Källdata/post | Period | JSON-serie | EBITDA | FCFF | AISC | Risk |
|---|---|---|---|---:|---:|---:|---|
| Abra Minimal | Fixture, ingen rapportproveniens; $1m/år | t2–t9 operations | `reclamationUSD` | −1m/år | − efter skatt | + numerator | Ser ut som periodkostnad men kontrakt saknas |
| Los Ricos North | PEA-fixture; ingen reclamation | alla | noll | 0 | 0 | 0 | Ingen slutsats om klassificering |
| Los Ricos South | `meta.notes`: “Closure cost: $3.7M” | sista t18 | `reclamationUSD=3.7m` | −3.7m | − efter eventuell tax shield | + numerator om payable AuEq positiv | Faktisk closure cash expenditure behandlas som EBITDA expense; `capexUSD=0.8m` samma period men data bevisar inte att det är samma kostnad |

Los Ricos South bevisar en blandad semantik: en explicit closure cost ligger i fältet som EBITDA behandlar som operating expense. En faktisk, separat framtida closure-utbetalning bör normalt behandlas som closure cash flow utanför EBITDA; huruvida skatteavdrag medges och när måste vara en uttrycklig policy. Nuvarande kod ger omedelbart skattesköld om terminal EBIT förblir positiv och inkluderar posten i AISC.

Salvage/asset recovery har inget identifierat dedikerat fält i dessa fixtures eller phase1. Ett positivt värde kan tekniskt kodas i revenue/WC men det finns inget verifierat kontrakt.

**Klassificering:** **MIXED DEFINITION / MIXED/AMBIGUOUS DATA CONTRACT**. Ingen verifierad dubbelräkning i de tre fixtures, men schema tillåter samma closurebelopp i reclamation och capex.

## 4. Post-för-post-matris

Legend: `+` direkt tillägg, `−` direkt avdrag, `I` indirekt, `P` presentation, `—` ingen påverkan, `?` ej verifierat. “NAV” betyder påverkan via FCFF/DCF om inte annat anges.

| Post | Revenue | EBITDA | SAOE | EBIT | Taxable | FCFF | AISC | Financing | NAV |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Revenue/all metal revenue | + | + | + | + | I | I | I (AuEq denominator) | I | I |
| By-product metal revenue | + | + | + | + | I | I | I | I | I |
| By-product credits | — | + | + | + | I | I | − numerator | I | I |
| Operating costs | — | − | − | − | I | I | + numerator | I | I |
| Mining/processing/transport/TC/RC | — | I | I | I | I | I | I | I | I |
| Site G&A | — | − | − | − | I | I | + numerator | I | I |
| Corporate G&A | — | — | — | — | — | ? corporate-only | — | I/? | I/? |
| Royalties | — | − | − | − | I | I | + numerator | I | I |
| Reclamation operating expense | — | − | − | − | I | I | + numerator | I | I |
| Closure cash expenditure i reclamation | — | − (nuvarande kod) | − | − | I | I | + numerator | I | I |
| Sustaining CAPEX | — | — | − | − | I | I, netto efter skatt | + numerator | I | I |
| Initial/expansion `capexUSD` | — | — | — | — | — | − | — | + need | I |
| Depreciation/amortisation | — | — | — | − | I | − via NOPAT och + återläggning | — | — | I skattesköld |
| WC build (`ΔWC>0`) | — | — | — | — | — | − | — | I | I |
| WC unwind (`ΔWC<0`) | — | — | — | — | — | + | — | I | I |
| Tax | — | — | — | — | I | − | — | I | I |
| Interest | — | — | — | — | — | — (FCFF unlevered) | — | financing-only/? | — |
| Financing fees | — | — | — | — | — | — | — | − | I via net cash/shares |
| Salvage | ? | ? | ? | ? | ? | ? | — | ? | ? |

Mining, processing, transport och TC/RC markeras indirekta eftersom phase1 endast ser den färdiga `operatingCostsUSD`; separata ekonomiska effekter beror på uppströms kostnadsbygge. “Expansion” saknar separat phase1-fält och delar `capexUSD`-behandling med initial/annan CAPEX.

## 5. Deterministiska isoleringstest

Det isolerade verktyget `scripts/debug/ebitdaByproductReclamationAudit.ts` anropar produktionskärnorna utan att ändra runtime. Resultat:

| Test | Verifierat resultat |
|---|---|
| A | EBITDA 54; SAOE 44; EBIT 38; tax 9.5; NOPAT 28.5; FCFF 34.5. |
| B | Au 80 + Cu 20 = gross 100. Credit 0 → EBITDA 100; credit 20 → EBITDA 120. |
| C | Reclamation +10: EBITDA/SAOE/EBIT −10; tax −2.5; FCFF −7.5; AISC +10 vid denominator 1. |
| D | Terminal FCFF base/reclamation/capex/båda = 60/52.5/50/42.5. NPV vid 10% = 4.132/−2.066/−4.132/−10.331; IRR = 13.066%/8.422%/6.811%/1.764%; AISC = 20/25/20/25. |
| E | Sustaining +10: EBITDA 0 delta; SAOE −10; tax shield 2.5; FCFF −7.5, inget andra avdrag. |
| F | `capexUSD` +10: EBITDA/SAOE/EBIT/tax oförändrade; FCFF −10; cash-waterfall external funding need +10. |
| G | ΔWC +10 → FCFF −10; ΔWC −10 → FCFF +10; P&L/skatt oförändrade. |

Test D visar att “reclamation som closure” och capex inte är ekonomiskt utbytbara: reclamation passerar EBIT/skatt och AISC, capex gör inte det; båda tillsammans ger summan av effekterna.

## 6. Project kontra Corporate

* Project producerar serierna i phase1.
* Snapshot live reconstruction räknar separat om samma Project-matematik (`runCorporateSnapshot.ts:1806-1842`). Detta är en divergensrisk, även om formlerna nu matchar.
* Corporate summerar färdiga project-serier per kalenderår (`:802-835`); den konsoliderar inte taxable losses och applicerar ingen ny koncernskatt.
* Revenue aggregeras från metallserier medan economics revenue/EBITDA/etc aggregeras från context. Olika null-normalisering kan ge första divergerande period om ett projekt saknar metallpris eller har null economics.
* By-product credits och reclamation ändrar inte definition vid aggregation; de summeras som givna.
* Ett normalt single-project case utan adjustments är därför identiskt periodvis för revenue, EBITDA, SAOE, EBIT, tax och FCFF **när kalendern är 1:1 och inga nuller förekommer**. Det är inte ett generellt identitetslöfte vid nuller, eftersom revenue path använder nollfallback medan strict economics aggregation kan ge null.
* `effectiveTaxRate` summeras som om den vore USD-serie; för flera projekt är procentsatsen feldefinierad. Tax-USD summeras däremot och används som färdig projektpost.

## 7. UI och EV/EBITDA

| Consumer | Datasource/beteende | Bedömning |
|---|---|---|
| Corporate valuation rows / graf | `aggregationEffective.ebitdaUSD_total`, samma värde för 5/6/7× | Korrekt ny EBITDA. |
| `SingleStockDashboard` project walkthrough | explicit project series; visar EBITDA och SAOE separat; FCFF-brygga | Huvudvägen korrekt. Producer Core reported EBITDA är separat under `producerCore.value.multiples`. |
| `projectGridPnl` | backend-first `ebitdaUSD`; korrekt component fallback inklusive G&A/reclamation/credits; SAOE fallback = EBITDA−sustaining | Korrekt för dessa serier. Gross-profit-raden subtraherar credits och har en annan, namngiven definition. |
| `projectOperationsGrid` | backend-first EBITDA; fallback endast `revenue−operatingCost−royalties`; SAOE saknar fallback | **Verifierad presentation-risk:** om explicit series saknas, fallback utelämnar G&A, reclamation och credits men etiketten är EBITDA. |
| `ProjectsPage` debug/audit panel | visar `projectGridPnl`-outputs men hårdkodade formelsträngar | **Verifierat label-/tooltip-fel:** EBITDA-texten anger bara revenue−op−royalties; EBIT-texten saknar sustaining/depreciation/reclamation; FCFF-texten är en expanderad brygga. Värdena kommer normalt från korrekta backend-first serier, men förklaringen är inte source of truth. |

Ingen funnen consumer kallar själva `sustainingAdjustedOperatingEarningsUSD` EBITDA. Namnet visas konsekvent som “Sustaining-adjusted operating earnings”. Däremot kan operations-gridens EBITDA-fallback återintroducera en äldre/partiell definition när backendfältet saknas. `totalCapexUSD` är reporting (`capex+sustaining`), medan direkt FCFF-avdrag endast är `capexUSD`; UI bör alltid uttrycka skillnaden.

## 8. Namnbedömning

Formeln är exakt `EBITDA − sustaining CAPEX`, men serien innehåller även royalties, reclamation och credits genom EBITDA-definitionen. “Operating earnings” kan tolkas som EBIT (trots att depreciation inte dragits), operating cash flow (trots att WC saknas), eller free cash flow (trots att initial CAPEX saknas). Verdict är därför **CORRECTLY DEFINED BUT NAME IMPRECISE**.

Högst tre bättre framtida alternativ, utan namnändring i denna audit:

1. **Project operating result after sustaining investment**
2. **Mine operating margin after sustaining investment**
3. **Pre-depreciation project margin after sustaining CAPEX**

## 9. Fel, risker och rekommenderade nästa steg

### Verifierade fel/presentationsfel

1. `ProjectsPage` formeltexter motsvarar inte alltid producerade värden (`ProjectsPage.tsx:684-725`). Downstream: användaren kan misstolka EBITDA/EBIT/FCFF, men normal backend-serie ändras inte.
2. `projectOperationsGrid` EBITDA-fallback har annan definition (`projectOperationsGrid.ts:234-242`). Downstream: felvisning när explicit economics EBITDA saknas.
3. Corporate `effectiveTaxRate` summeras (`runCorporateSnapshot.ts:827`) i stället för att viktas/beräknas från summerad tax/base. Downstream: diagnostik/presentation, inte tax-USD.

### Risker, inte bevisade kodfel

1. By-product credit saknar ekonomiskt datakontrakt och reconciliation mot all-metall-revenue.
2. Reclamationfältet används både för operationsliknande periodposter och explicit terminal closure cost.
3. Snapshot live reconstruction duplicerar phase1 och har något annorlunda null-policy.
4. Ingen incheckad data täcker alla efterfrågade metall-/projekttyper; extern källdokumentation saknas för Abra credits och reclamation.

### Exakta nästa steg

1. Inför (i separat framtida ändring) ett validerat kontrakt: antingen gross revenue exkluderar credit-metaller eller `byproductCreditsUSD` måste vara en annan specificerad post med source-id; avvisa/flagga överlapp.
2. Dela framtida schema i `reclamationOperatingExpenseUSD` och `closureCashExpenditureUSD`, med explicit tax/AISC-policy och källdokumentreferens.
3. Lägg parity-test mellan phase1 och snapshot reconstruction inklusive null, samt single-/multi-project calendar cases.
4. Korrigera UI-formelmetadata/fallbacks separat; ändra inte ekonomimotorn samtidigt.
5. Skaffa verkliga fixtures för guld+by-product, silver Au/Cu/Pb/Zn och koppar Au/Ag med källtabeller innan verdict för aktuell data skärps.

## 10. Evidens per slutverdict

| Verdict | Kodbevis | Testbevis | Data granskad | Kvarstår |
|---|---|---|---|---|
| EBITDA: correct with caveats | `phase1.ts:87-101`; snapshot `1817-1825` | A, B, C, E | Abra, Los Ricos North/South | Credit- och reclamationkontrakt |
| SAOE: definition correct/name imprecise | `phase1.ts:90,93-94` | A, E | samma | Terminologi/policy |
| By-products: not verified | revenue sum `computeRevenueByMetal.ts:125-138`; credit `phase1.ts:93` | B bevisar tillåtet överlapp | Abra positiv; LR North 0; LR South null | Credit provenance och fler riktiga cases |
| Reclamation: mixed/ambiguous | `phase1.ts:87-94`; AISC `engine.ts:64-88` | C/D | terminal closure i LR South, periodisk Abra, noll LR North | Rapporter/källtabeller, tax policy |
| Cash bridge: correct with caveats | `phase1.ts:112-162` | A, C–G | samma | Datakontrakt och duplicated live parity |

Auditens resultat är medvetet begränsat till vad kod, exekvering och incheckade data faktiskt bevisar. Kommentarer och UI-labels har inte använts som bevis för ekonomisk innebörd.
