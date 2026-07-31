# Audit: Corporate EV/EBITDA-definition

> **Historisk pre-fix-audit.** Dokumentet beskriver implementationen före korrigeringen i `docs/ebitda-and-sustaining-capex-correction.md`. Den tidigare felbenämnda EBITDA-serien heter nu `sustainingAdjustedOperatingEarningsUSD`; `ebitdaUSD` är den nya parallella EBITDA-serien.

## Sammanfattning

**Corporate använder inte konventionell EBITDA.** Den serie som heter `ebitdaUSD` är i praktiken ett projektrörelseresultat **efter sustaining CAPEX och reclamation**, men före depreciation, ränta och skatt:

```text
EBITDA_modell[t] = Revenue[t]
                  - Operating costs[t]
                  - Sustaining CAPEX[t]
                  - Site G&A[t]
                  - Royalties[t]
                  - Reclamation[t]
                  + By-product credits[t]
```

Projektserien räknas i `computeProjectPhase1`, där indata normaliseras och periodvärdena hämtas (`src/lib/project/phase1.ts`, rader 33–80), varefter uttrycket ovan exekveras (`src/lib/project/phase1.ts`, rader 86–93). Corporate summerar sedan projektens redan beräknade `ebitdaUSD` strikt per kalenderår i `buildCorporateSeries` via `aggregateEconomic('ebitdaUSD')` (`src/lib/snapshot/runCorporateSnapshot.ts`, rader 826–858). Det finns också en explicit live-pipeline-rekonstruktion med samma uttryck (`src/lib/snapshot/runCorporateSnapshot.ts`, rader 1828–1843).

## Faktisk beräkningskedja

1. Projektets periodserier läses och normaliseras; saknat/null/non-finite blir `null`, men `safeValue` gör sedan sådana komponenter till noll i själva formeln (`src/lib/project/phase1.ts`, rader 9–30 och 48–80).
2. För varje projekt och period beräknas `ebitdaValue = r - op - sc - ga - roy - rec + bp` (`src/lib/project/phase1.ts`, rader 86–92).
3. Den live-kodväg som bygger snapshotens centrala ekonomiserie räknar åter samma formel från `grossRevenueForRoyalties` och kostnadsserierna (`src/lib/snapshot/runCorporateSnapshot.ts`, rader 1828–1838).
4. Corporate-serien kalenderjusterar och summerar varje projekts `economics.ebitdaUSD` med `sumStrictAlignedSeries`; den räknas inte om från Corporate FCFF (`src/lib/snapshot/runCorporateSnapshot.ts`, rader 826–858).
5. Snapshoten publicerar exakt denna serie som `aggregationEffective.ebitdaUSD_total` (`src/lib/snapshot/runCorporateSnapshot.ts`, rader 2211–2219).
6. EV/EBITDA-raderna hämtar samma `aggregationEffective.ebitdaUSD_total`, växlar den till målvaluta och multiplicerar med 5, 6 eller 7 (`src/lib/snapshot/runCorporateSnapshot.ts`, rader 3417–3442).

## Post-för-post-spårning

| Post | Ingår? | Tecken och exakt kodställe |
|---|---|---|
| Revenue | **Ingår** | `r` hämtas på rad 71 och adderas som startvärde i `r - ...` på rad 88 i `computeProjectPhase1` (`src/lib/project/phase1.ts`). Live-vägen använder `revenue` på rader 1828–1837 i `runCorporateSnapshotPipeline` (`src/lib/snapshot/runCorporateSnapshot.ts`). |
| Operating costs | **Ingår** | `op` hämtas rad 72 och subtraheras rad 88 (`src/lib/project/phase1.ts`). Live: rader 1831 och 1837 (`src/lib/snapshot/runCorporateSnapshot.ts`). |
| Site G&A | **Ingår** | `ga` hämtas rad 74 och subtraheras rad 88 (`src/lib/project/phase1.ts`). Live: rader 1833 och 1837 (`src/lib/snapshot/runCorporateSnapshot.ts`). |
| Royalties | **Ingår** | `roy` hämtas rad 75 och subtraheras rad 88 (`src/lib/project/phase1.ts`). Live: rader 1834 och 1837 (`src/lib/snapshot/runCorporateSnapshot.ts`). |
| By-product credits | **Ingår** | `bp` hämtas rad 77 och adderas rad 88 (`src/lib/project/phase1.ts`). Live: rader 1836–1837 (`src/lib/snapshot/runCorporateSnapshot.ts`). |
| Sustaining CAPEX | **Ingår** | `sc` hämtas rad 73 och subtraheras direkt i EBITDA rad 88 (`src/lib/project/phase1.ts`). Live: rader 1832 och 1837 (`src/lib/snapshot/runCorporateSnapshot.ts`). Detta är den direkta orsaken till observationen. |
| Initial CAPEX | **Ingår inte** | `capexUSD` läses rad 54 men förekommer inte i EBITDA-uttrycket rad 88. Det läggs först till total CAPEX på rader 136–143 och dras från FCFF rad 151 (`src/lib/project/phase1.ts`). |
| Expansion CAPEX | **Ingår inte som separat post** | Modellen har ingen separat expansion-CAPEX-term i EBITDA. Om den ligger i `capexUSD` följer den samma väg som initial CAPEX: total CAPEX rader 136–143 och FCFF rad 151, inte EBITDA rad 88 (`src/lib/project/phase1.ts`). |
| Reclamation | **Ingår** | `rec` hämtas rad 76 och subtraheras rad 88 (`src/lib/project/phase1.ts`). Kommentaren på rader 150–151 hindrar ett andra avdrag i FCFF. Live: rader 1835, 1837 och 1854–1855 (`src/lib/snapshot/runCorporateSnapshot.ts`). |
| Closure | **Ingår inte som separat post** | Ingen `closure`-term finns i EBITDA-uttrycket. Endast belopp som matats in som `reclamationUSD` kommer in via `rec` på rader 76 och 88 (`src/lib/project/phase1.ts`). |
| Working capital | **Ingår inte** | `dWC` hämtas rad 79 men finns inte i EBITDA rad 88; den subtraheras först i FCFF rad 151 (`src/lib/project/phase1.ts`). Live: rader 1853 och 1855 (`src/lib/snapshot/runCorporateSnapshot.ts`). |
| Depreciation | **Ingår inte** | `dep` hämtas rad 78 och subtraheras först från EBITDA för att få EBIT på rad 89 (`src/lib/project/phase1.ts`). Live: rader 1839–1842 (`src/lib/snapshot/runCorporateSnapshot.ts`). |
| Amortization | **Ingår inte / saknar separat serie** | Det finns ingen amortization-term i `ProjectPhase1Input`-normaliseringen eller EBITDA-uttrycket på rader 48–57 och 86–89 (`src/lib/project/phase1.ts`). Om amortering har bakats in i `depreciationUSD` påverkar den EBIT, inte namngiven EBITDA. |
| Taxes | **Ingår inte** | Skatt beräknas först från `max(0, EBIT) * taxRate` på rader 104–118 och påverkar NOPAT/FCFF på rader 126–152, inte EBITDA (`src/lib/project/phase1.ts`). |
| Interest | **Ingår inte** | Ingen räntepost läses eller används i `computeProjectPhase1`; EBITDA, EBIT, skatt och FCFF byggs utan interest på rader 33–167 (`src/lib/project/phase1.ts`). Modellen är därmed unlevered på denna punkt. |
| Net cash | **Ingår inte i EBITDA** | Net cash skapas separat som cash minus debt i finansieringen (`src/lib/corporate/financing/compute.ts`, rader 130–168) och adderas först när multipel-EV omvandlas till equity value (`src/lib/snapshot/runCorporateSnapshot.ts`, rader 3423–3441). |

## Faktisk EV-formel

Det finns två närliggande men olika beräkningar som måste hållas isär.

### Aktuellt Corporate Enterprise Value (market box/modellanalys)

```text
Market Cap = shares_current × price_current
Enterprise Value_current = Market Cap
                         + debt_t0
                         - cash_t0
                         + EnterpriseAdjustments
```

Detta exekveras i `computeProjectViewMetrics` på rader 417–420 i `src/lib/projectView/computeProjectPreRevenueView.ts`. Samma fristående Corporate market-value-motor visar uttrycket på rader 46–60 i `src/lib/corporate/marketValue/engine.ts`.

- **Market Cap:** current shares × current price.
- **Debt:** post-financing debt när Corporate-vyn byggs; `SingleStockDashboard` skickar Corporate financing inputs vidare på rader 3104–3118 (`src/components/SingleStockDashboard.tsx`).
- **Cash:** post-financing cash för aktuellt EV; samma anrop sätter `cashForEvIsPostFinancing: true` på rader 3114–3116 (`src/components/SingleStockDashboard.tsx`).
- **Net cash:** algebraisk motsvarighet är `cash - debt`; EV använder alltså `-net cash`.
- **Financing adjustments:** ny skuld och använd kassa byggs in i post-financing debt/cash. `computeCorporateFinancing` räknar cash efter byggfinansiering på rad 107, ny skuld på rader 109–112 och post debt på rader 130–132 (`src/lib/corporate/financing/compute.ts`).
- **Enterprise adjustments:** separat additiv term; financing-motorn sätter den till `0` på rad 167 (`src/lib/corporate/financing/compute.ts`), medan vyn accepterar och adderar ett market-value-värde.

### EV/EBITDA-kurvans implicita equity value

```text
Enterprise Value_multiple[t] = EBITDA_modell_Target[t] × multiple
Net cash_NAV = reported cash_t0 - debt_post
Equity Value_multiple[t] = Enterprise Value_multiple[t] + Net cash_NAV
Value/share[t] = Equity Value_multiple[t] / shares_post_financing_FD
```

Multipelkurvan använder alltså inte Market Cap för att skapa sina 5×–7× scenariovärden. `ev5xTarget`–`ev7xTarget` är EBITDA × multipel på rader 3429–3431, och `multipleValue` adderar `row.netCashTarget` på rader 3423–3425 (`src/lib/snapshot/runCorporateSnapshot.ts`). Viktigt: tidslinjens net cash kommer från **reported cash**, inte post-financing cash: `cashForNavTarget = balanceSheet.cash_t0` och `netCashForNavTarget = cashForNavTarget - debtPostTarget` på rader 2519–2525; detta skickas till värderingen på rad 2636 (`src/lib/snapshot/runCorporateSnapshot.ts`). Därför är multipelkurvans cash-brygga inte identisk med market-box-EV:s post-financing cash-brygga.

## Används samma EBITDA-serie överallt?

- **Corporate-grafens EV/EBITDA-overlay:** ja. Backendens rader hämtar `aggregationEffective.ebitdaUSD_total` på rader 3421–3422, och `ValueRangeSnapshotCard` mappar exakt dessa rows per år och ritar 5×/6×/7× på rader 122–179 (`src/components/project/ValueRangeSnapshotCard.tsx`).
- **EV/EBITDA High och Low:** ja, om High/Low avser grafens 7×/5× gränser. Båda använder samma `ebitdaTarget`; endast multipeln skiljer sig på rader 3429–3441 (`src/lib/snapshot/runCorporateSnapshot.ts`).
- **Modellanalysens Corporate market box:** den använder **ingen EBITDA-serie** för aktuellt EV; den räknar Market Cap + debt − cash + adjustments (`src/lib/projectView/computeProjectPreRevenueView.ts`, rader 417–420). Det är därför inte en alternativ EBITDA-serie.
- **Revenue-mode Producer Core EV/EBITDA:** är en separat rapporterad-datafunktion, inte Corporate-projektmodellen. Den hämtar `income.ebitda` och dividerar aktuellt EV med senaste rapporterade EBITDA (`api/_producer_core.ts`, rader 117, 143, 225). Den serien ska inte blandas ihop med Corporate `ebitdaUSD_total`.

## Kontrolltest: verkligt Corporate-case

Testet kopierade den incheckade `Abra Minimal`-requesten. Caset har 100 miljoner aktier, CAD 1,25 per aktie, CAD 5 miljoner cash, CAD 10 miljoner debt, 27 % skatt och 1,35 USD/CAD (`scripts/fixtures/snapshot-requests/abra_minimal.json`, rader 1–29 och 58–60). Sustaining CAPEX är USD 15 miljoner per produktionsår (`scripts/fixtures/snapshot-requests/abra_minimal.json`, rader 86–97). För att köra genom nuvarande validator märktes kopian i minnet som v2 och fick `productionStartYear = 2028`; ingen repository-kod eller fixture ändrades.

Produktionsåret 2028 och totalvärderingen blev:

| Mått | Bas | Sustaining CAPEX halverad | Förändring |
|---|---:|---:|---:|
| Revenue 2028 (USD) | 354 500 000 | 354 500 000 | 0 |
| Operating costs 2028 (USD) | 180 000 000 | 180 000 000 | 0 |
| Sustaining CAPEX 2028 (USD) | 15 000 000 | 7 500 000 | −7 500 000 |
| EBITDA_modell 2028 (USD) | 154 500 000 | 162 000 000 | **+7 500 000** |
| FCFF 2028 (USD; inkluderar WC-rörelse) | 95 785 000 | 108 760 000 | **+12 975 000** |
| DCF idag / NPV today (CAD) | 220 734 298,36 | 305 686 935,65 | **+84 952 637,29** |
| DCF vid produktionsstart, ex CAPEX (CAD) | 771 988 501,02 | 874 781 192,13 | **+102 792 691,12** |
| EV/EBITDA Low, 5× equity value/share 2028 (CAD) | 2,350260 | 2,464900 | **+0,114640** |
| EV/EBITDA High, 7× equity value/share 2028 (CAD) | 3,294894 | 3,455389 | **+0,160496** |

FCFF ökar mer än EBITDA därför att sustaining CAPEX räknas två gånger i kassaflödeskedjan: först i EBITDA på rad 88 och därefter igen i `totalCapexValue = cx + sc` samt FCFF-avdraget på rader 142–151 (`src/lib/project/phase1.ts`). Dessutom ökar skatten när det namngivna EBITDA/EBIT ökar.

**Förändrades EBITDA? Ja.** Den direkta orsaken är `const ebitdaValue = r - op - sc - ga - roy - rec + bp;` på rad 88 i `src/lib/project/phase1.ts` (och den likalydande live-beräkningen på rad 1837 i `src/lib/snapshot/runCorporateSnapshot.ts`).

## Jämförelse med konventionell EBITDA

Konventionell EBITDA är revenue minus operating costs och SG&A, justerad för normala rörelseposter, men före depreciation, amortization, interest och taxes.

Implementationens avvikelser är:

1. **Sustaining CAPEX dras av.** Det är en investering/kassaflödespost och hör normalt inte hemma i EBITDA.
2. **Reclamation dras av direkt.** Detta kan vara rimligt endast om serien representerar periodens normala rörelsekostnad/accrual; namnet och kassaflödesbehandlingen gör definitionen icke-standard och kräver normalisering mot externa multiplar.
3. **Sustaining CAPEX dras dessutom av igen i FCFF.** Det ändrar inte själva EBITDA-definitionen ytterligare men visar att den namngivna serien inte fungerar som ett konventionellt EBITDA-mellansteg.
4. **Amortization saknar egen serie.** Modellen kan inte explicit visa den vanliga EBITDA→EBIT-bryggan för D&A; endast `depreciationUSD` dras av.
5. **Null/non-finite komponenter kan bli noll i periodformeln** genom `safeValue`, vilket kan skapa ett numeriskt EBITDA trots ofullständig underliggande data (`src/lib/project/phase1.ts`, rader 9–30 och 70–80).

Royalties, by-product credits och normal site G&A är däremot rimliga rörelseposter i en gruv-EBITDA, förutsatt konsekvent presentation och ingen dubbelräkning i revenue/operating costs.

## Bedömning

### 1. Använder Corporate en konventionell EBITDA?

**Nej.**

### 2. Vad använder modellen egentligen?

Ett egenkonstruerat **revenue-minus-“sustaining cost” resultat före depreciation och skatt**, där “sustaining cost” omfattar operating costs, sustaining CAPEX, site G&A, royalties och reclamation, reducerat med by-product credits. Ekonomiskt ligger måttet närmare ett EBITDA-liknande kassamarginalmått efter maintenance investment än redovisnings-EBITDA, men det är inte heller FCFF eftersom skatt, total CAPEX och working capital hanteras senare.

### 3. Är det korrekt att använda externa EV/EBITDA-multiplar 5×–7× mot definitionen?

**Nej.** Externa EV/EBITDA-multiplar förutsätter i normalfallet en EBITDA före CAPEX. Att applicera dem på ett lägre resultat efter sustaining CAPEX blandar definitioner och ger en systematiskt lägre enterprise valuation än en like-for-like extern multipelanalys. Reclamation-klassificeringen och frånvaron av explicit amortization-brygga försämrar jämförbarheten ytterligare. Antingen måste nämnaren normaliseras till konventionell EBITDA, eller så måste multiplarna hämtas/kalibreras mot exakt samma efter-sustaining-CAPEX-definition och benämnas därefter.

## Slutsats

Observationen är verifierad. Sustaining CAPEX påverkar Corporate EV/EBITDA eftersom den subtraheras direkt i den serie som koden kallar EBITDA. Samma felbenämnda Corporate-serie driver grafens 5×, 6× och 7× värden. Aktuellt market-box-EV använder däremot den normala balansbryggan Market Cap + debt − cash + adjustments och har ingen EBITDA-nämnare. Ingen produktionskod ändrades i denna audit.
