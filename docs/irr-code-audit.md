# Kodgranskning av IRR-kedjan

> **Status:** Problemen som identifierades i den ursprungliga granskningen är nu rättade.
> Lista 3 skannar hela intervallet −99,9–1 000 %, returnerar alla rötter och väljer den
> lägsta positiva roten över projektets diskonteringsränta. Projektvyn använder samma
> resultat utan negativ fallback, och reclamation räknas endast en gång genom EBIT.

## Slutsats

Skärmens kombination av positiv NPV/NAV, kort återbetalningstid och `IRR = -65 %`
kommer inte från formatteringen. UI multiplicerar den redan beräknade kvoten med 100 men
ändrar inte tecken. Den mest sannolika kodförklaringen är i stället att den kanoniska
`fcffUSD_total`-serien har en **omvänd kassaflödesprofil** (positiva flöden före ett sent
negativt flöde, exempelvis återställning/reclamation), samtidigt som Payback beräknas med
ett separat positivt `initialCapexUSD_main` och en syntetisk negativ startsaldo. Då kan
Payback bli kort trots att IRR-funktionen ser en annan ekonomisk investeringsprofil.

En negativ IRR är matematiskt möjlig tillsammans med positiv NPV vid 10 procent om
kassaflödena går från positiva till negativa. För den vanliga profilen (negativ investering
följd av positiva inflöden) innebär positiv NPV vid 10 procent däremot att IRR ska ligga
över 10 procent. Därför bör den faktiska debug-arrayen
`snapshot.corporate.lista3Debug.perMetric.IRR.inputs.fcfUSD_total` kontrolleras först.

## Sökresultat

Följande sökning gjordes skiftlägesokänsligt i hela repot, med `node_modules` och `.git`
undantagna:

```bash
rg -n -i --glob '!node_modules/**' --glob '!.git/**' \
  '(IRR|XIRR|MIRR|internalRateOfReturn|rateOfReturn|newton|bisection|brent|npv|discount|cash.?flow|fcff|freeCashFlow)' .
```

Det finns ingen XIRR-, MIRR-, Newton- eller Brent-implementation i produktionskedjan.
Den aktiva lösaren är bracket + bisection. `freeCashFlow` i börsbolagens historiska
financial statements är en separat analysfunktion och matar inte projekt-IRR.
Det finns nu en gemensam IRR-lösare i Lista 3. Projektvyn och projektmotorns Phase 2
återanvänder den, så rotvalet kan inte längre divergera mellan vyerna.

## Hela anropskedjan

### Corporate-skärmen (kedjan som visar NPV, NAV, Payback, CF LOM, EV/NPV och IRR)

```text
Projekt-JSON (databasradens rawJson; alternativt request.body.projects)
  -> POST /api/snapshot/corporate (api/index.ts)
  -> runCorporateSnapshotPipeline(body)
  -> validateSnapshotRequest
  -> loadProjectsForSymbol(symbol) eller body.projects
  -> parseProjectJsonV1 / resolveProjectPricesToEngineInput
  -> projektmotor, revenue och kostnadsserier
  -> fcffByCentralEbit[t]
       = EBIT - tax + depreciation - sustaining capex
         - initial/development capex - delta working capital - reclamation
  -> projektserier linjeras mot corporateYearsByPeriod och summeras
  -> aggregationEffective.fcffUSD_total
       (för ett projekt: snapshotSeries.fcffUSD;
        för flera: aggregateProjectsToCorporateTotals + eventuell periodförskjutning)
  -> NPV: discountedSum(aggregationEffective.fcffUSD_total, discountRate)
  -> IRR: computeLista3({ fcfUSD: aggregationEffective.fcffUSD_total, ... })
  -> computeIrr(enterpriseCashflows)
  -> buildCorporateSnapshot
  -> snapshot.corporate.lista3Metrics.IRR
  -> fetch-response -> React state corporateSnapshotData
  -> corporateViewMetrics.list3.IRR
  -> formatIrrMetricValue -> UI
```

### Projektvyn

```text
projectSnapshotData.series.fcffUSD
  -> getProjectInputs / asSeries
  -> computeProjectViewMetrics
  -> buildCanonicalEnterpriseCashflows(fcfUSD[0..masterN])
  -> shared computeLista3(...).IRR (primärt värde)
     samt lokal computeIrr(irrSeries) (diagnostik/fallback)
  -> projectViewMetrics.list3.IRR
  -> formatIrrMetricValue -> UI
```

Projektvyn använder den gemensamma Lista 3-lösarens resultat och debugdata. Den tidigare
lokala fallback-lösaren är borttagen.

## Exakt array till IRR

Corporate-anropet skickar exakt:

```ts
enterpriseCashflows = aggregationEffective.fcffUSD_total.slice(
  0,
  aggregationEffective.corporateMasterN + 1,
);
computeIrr(enterpriseCashflows);
```

Värdena kan inte anges numeriskt utan runtime-state eller den aktuella projekt-JSON:en.
Koden exponerar dock exakt array i debugsvaret som:

```text
snapshot.corporate.lista3Debug.perMetric.IRR.inputs.fcfUSD_total
```

och även som `snapshot.corporate.lista3Debug.series.fcfUSD_total`. Projektvyn skickar
`input.fcfUSD.slice(0, masterN + 1)` efter kontroll att varje element är finit.

## Kontroller

1. **Samma kassaflöden som NPV:** Ja på corporate spot-kedjan: både NPV och IRR får
   `aggregationEffective.fcffUSD_total`. NPV hoppar dock över `null` i `discountedSum`,
   medan IRR returnerar `null` om något värde inte är finit. För scenario-range används
   motsvarande scenario-FCFF till båda.
2. **Diskonterade kassaflöden till IRR:** Nej. IRR får rå FCFF och räknar sin egen NPV
   för varje prövad ränta. NPV10 får samma råserie men diskonterar med användarens ränta.
3. **Teckeninvertering:** Ingen generell invertering i IRR-kedjan. Kostnader och CAPEX
   lagras positivt och subtraheras i FCFF-generatorn. `initialCapexUSD_main` summeras
   positivt; Payback gör `Math.abs` och skapar därefter ett negativt startsaldo. Detta
   påverkar Payback men inte IRR och är den viktiga semantiska skillnaden.
4. **Sortering efter datum:** IRR-arrayen sorteras inte. Projekten mappas först till en
   stigande heltalsaxel från minsta till största år. Milstolpsår sorteras separat men
   ändrar inte FCFF-arrayens ordning. Inga explicita datum eller delårsintervall används;
   detta är IRR med lika långa årsperioder, inte XIRR.
5. **Cache:** Inget cacheat IRR-fält används. Corporate-UI gör en POST, lagrar svaret i
   React-state och läser snapshotvärdet. Servern räknar IRR under varje snapshotkörning.
   Projekt-JSON/priser kan laddas från persistens/cache i omgivande kod, men inget separat
   IRR-cachelager hittades.
6. **Fel UI-fält:** Corporate-UI läser rätt fält,
   `corporate.lista3Metrics.IRR`; projekt-UI läser `projectViewMetrics.list3.IRR`.
   Range-korten läser korrekt `range.low/spot/high.irr`. Ingen sammanblandning med
   ROCE, ROI eller NPV hittades.
7. **Formattering/konvertering:** `formatIrrMetricValue` gör endast
   `(value * 100).toFixed(1)`. Range-komponenterna gör samma sak. `toMetricValue` och
   `asSeries` bevarar tecken. JSON-serialisering/deserialisering bevarar tecken. De enda
   teckenändrande operationerna nära måttet är kostnadssubtraktionerna i FCFF och
   `Math.abs` i Payback/CAPEX-kvoter; ingen av dem kan ensam göra ett positivt lagrat IRR
   negativt i UI.

## Sannolikt fel och rekommenderad verifiering

**Misstanke A (hög): Payback och IRR beskriver olika investeringsdefinitioner.** IRR
använder hela FCFF-serien såsom den genererats. Corporate Payback använder däremot ett
separat `initialCapexUSD_main = sum(capex före tp)`, sätter startsaldot till dess negativa
absolutbelopp och adderar sedan FCFF från `tp`. Den korta Payback-tiden bevisar därför inte
att IRR-seriens första signifikanta flöde är negativt.

**Misstanke B (hög om arrayen börjar positivt): period-/CAPEX-alignment.** En serie som
börjar med positiva produktionsflöden och slutar med reclamation kan ge exakt negativ IRR
samt positiv NPV10. Kontrollera `yearsByPeriod`, `capexUSD_total`, `reclamationUSD` och
`fcffUSD_total` sida vid sida, särskilt efter `shiftSeries` och multi-project-aggregering.

**Åtgärdat:** Lösaren söker nu samtliga brackets mellan −99,9 och 1 000 procent, löser och
deduplicerar rötterna och väljer den lägsta positiva roten över projektets ordinarie
diskonteringsränta. Om ingen sådan finns väljs den lägsta icke-negativa roten.

## Fil- och funktionsinventering

| Fil | Radnummer | Funktion | Vad den gör | Misstänkt fel |
|---|---:|---|---|:---:|
| `api/index.ts` | 38–55, 311–315 | `handleCorporateSnapshot` | Tar JSON-requesten till snapshot-pipelinen och returnerar snapshot-JSON. | Nej |
| `src/lib/snapshot/runCorporateSnapshot.ts` | 1359–1424 | `runCorporateSnapshotPipeline` | Validerar requesten och laddar projekt-JSON från symbol eller request. | Nej |
| `src/lib/project/phase1.ts` | 70–151 | `computeProjectPhase1` | Bygger FCFF; CAPEX/kostnader/WC/reclamation subtraheras. | Ja – kontrollera kostnadstecken |
| `src/lib/snapshot/runCorporateSnapshot.ts` | 1816–1844 | central FCFF-builder | Räknar den FCFF-serie som snapshoten faktiskt använder. | Ja – separat FCFF-formel måste hållas synkad |
| `src/lib/corporate/aggregateProjects.ts` | 194–236 | `aggregateProjects` | Skapar stigande årsaxel och summerar projekt per år. | Nej, men alignment bör verifieras |
| `src/lib/snapshot/runCorporateSnapshot.ts` | 2199–2244 | `aggregationEffective` | Väljer/summerar/förskjuter den slutliga corporate-FCFF-serien. | Ja – möjlig periodförskjutning |
| `src/lib/snapshot/runCorporateSnapshot.ts` | 1139–1148 | `discountedSum` | Beräknar NPV från rå FCFF; hoppar över null. | Ja – null-regeln skiljer sig från IRR |
| `src/lib/snapshot/runCorporateSnapshot.ts` | 2564–2567 | `initialCapexUSD_main` | Summerar positiv CAPEX före första produktionsmilstolpen. | Ja – annan investeringsdefinition |
| `src/lib/snapshot/runCorporateSnapshot.ts` | 2639–2648 | `computeLista3`-anrop | Skickar `aggregationEffective.fcffUSD_total` till KPI-motorn. | Nej |
| `src/lib/metrics/lista3.ts` | 65–176 | `computeIrr` | Hittar alla rötter från -99,9 % till 1000 % och väljer ekonomiskt relevant positiv rot. | Nej |
| `src/lib/metrics/lista3.ts` | 217–228, 287–291 | `computeLista3` | Skivar exakt `[0..masterN]`, loggar arrayen och anropar IRR. | Nej |
| `src/lib/metrics/lista3.ts` | 258–285 | Payback real | Skapar separat negativ investering och adderar FCFF från tp. | Ja – inte samma ekonomi som IRR |
| `src/lib/project/phase2.ts` | 88–92 | `computeProjectPhase2` | Återanvänder den gemensamma IRR-lösarens valda rot. | Nej |
| `src/lib/corporate/snapshot/buildCorporateSnapshot.ts` | 127–151 | `buildCorporateSnapshot` | Lagrar IRR under `corporate.lista3Metrics.IRR`. | Nej |
| `src/lib/projectView/computeProjectPreRevenueView.ts` | 192–205 | `buildCanonicalEnterpriseCashflows` | Skapar projektvyns `[0..masterN]`-array utan sortering/teckenbyte. | Nej |
| `src/lib/projectView/computeProjectPreRevenueView.ts` | 466–494, 582–620 | `computeProjectViewMetrics` | Delar samma array mellan Payback/IRR/ROI och använder endast gemensam vald IRR. | Nej |
| `src/components/SingleStockDashboard.tsx` | 1854–1935 | `runCorporateSnapshot` effect | POST:ar request och lagrar snapshot-svaret i React-state. | Nej |
| `src/components/SingleStockDashboard.tsx` | 3000–3047 | `corporateViewMetrics` | Läser rätt snapshotfält och bygger UI-måttet. | Nej |
| `src/components/SingleStockDashboard.tsx` | 124–127 | `formatIrrMetricValue` | Multiplicerar kvoten med 100 och lägger till procenttecken. | Nej |
| `src/components/SingleStockDashboard.tsx` | 5715–5718, 6490–6492 | metric rendering | Använder IRR-formattering i corporate- respektive projektvy. | Nej |
| `src/components/project/NpvSpotRangeComparisonCard.tsx` | 34–38, 136–140 | range-formattering | Läser scenariofältet `irr` och formatterar procent. | Nej |
| `src/components/project/AlltGickFelCard.tsx` | 33–37, 73–77 | stress-range-formattering | Läser scenariofältet `irr` och formatterar procent. | Nej |
