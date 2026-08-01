# Multipelkontrast — 5Y EBITDA concentration audit

## Verdict och definition

**FIXED / IMPLEMENTED AND VERIFIED.** Auditen genomfördes först read-only mot den
befintliga motorn. Den gamla poängsatta kvoten var positiv EBITDA under de första
fem kalenderåren dividerad med all återstående positiv EBITDA. Eftersom en jämn
profil gav ungefär `5 / remainingActiveEconomicYears` överlappade den med
livslängdsfaktorn.

Den implementerade faktorn behåller den faktiska andelen men poängsätter i stället:

```text
actual   = positiveEbitdaFirstFiveYears / positiveRemainingEbitda
expected = min(5, remainingActiveEconomicYears) / remainingActiveEconomicYears
deviation = actual - expected
```

Noll är neutral jämn koncentration. Positiv avvikelse är mer front-loaded och får
penalty; negativ avvikelse får högst +0,25x. Exakta gränser `-0,20`, `-0,10`,
`+0,10`, `+0,20`, `+0,30` och `+0,40` täcks av deterministiska tester. Avvikelsen
normaliseras till tolv decimaler före policyn så att matematiskt exakta gränser
inte byter intervall på grund av binär flyttalsrepresentation.

Strict-null, kalenderfönster, 3–4 års short window, negativa EBITDA-tailar och den
obligatoriska null-propagationen är oförändrade i princip. Ett eller två år är
fortsatt `INSUFFICIENT_REMAINING_PERIODS`. Saknad EBITDA eller revenue i den
obligatoriska återstående perioden nullar koncentrationsfaktorn utan fallback.

## Producer–consumer-karta

1. `runCorporateSnapshotPipeline` levererar aggregerad Corporate revenue, EBITDA,
   sustaining CAPEX, canonical net cash och snapshot shares till
   `computeCorporateQualityMultiples`.
2. Motorn producerar faktisk andel, jämn referensandel, avvikelse, positiva summor,
   koncentrationsjustering och övrig diagnostik. Endast koncentrationsjusteringen
   ersatte den gamla front-loading-justeringen i den additiva quality-multipeln.
3. `corporateQualityMultipleTimeSeries.rows` är snapshot-kontraktet.
4. `ValueRangeSnapshotCard` väljer annual eller forward-average basis och skickar
   rader samt `canonicalSharesForPerShare` till presentationsbyggaren.
5. `buildQualityMultipleContrastSeries` kräver positiv vald basis, positiv årlig
   ekonomisk EBITDA, `COMPUTABLE`, finita low/mid/high-multiplar, finita absoluta
   equity values och finita positiva canonical fully diluted shares. Annars blir
   hela bandet null. Inga år interpoleras eller fylls.
6. `MultipleContrastPanel` visar de nya diagnostikfälten och den svenska labeln
   **5-årig EBITDA-koncentration**. Combined target konsumerar endast den synliga
   quality-midpointen och dess 70/30-formel ändrades inte.

Sökning efter de gamla kodfälten efter implementation gav inga producer- eller
consumer-träffar i `src`; historiska audittexter undantogs avsiktligt.

## Deterministisk designkontroll

| Profil | Actual | Expected | Deviation | Justering |
|---|---:|---:|---:|---:|
| Jämn 10 år | 0,500 | 0,500 | 0,000 | 0,000x |
| Jämn 20 år | 0,250 | 0,250 | 0,000 | 0,000x |
| Front-loaded 10 år | 0,700 | 0,500 | +0,200 | -0,500x |
| Back-loaded 10 år | 0,300 | 0,500 | -0,200 | +0,250x |
| Jämn 5 år | 1,000 | 1,000 | 0,000 | 0,000x |
| Jämn 3 år | 1,000 | 1,000 | 0,000 | 0,000x; short window |
| Jämn 2 år | null | null | null | null; insufficient periods |

Gap-testet `[100,100,0,100,100,100,100,100]` använder exakt de första fem
kalenderåren: first-five positive EBITDA = 400, remaining positive EBITDA = 700,
sju aktiva år och ett gapår. Negativ-tail-testet ger actual = expected = 1,
avvikelse 0 och exponerar samtidigt `negativeEbitdaTailShare = 0,5`.

## Fixture-audit

Auditkörningen använder oförändrad `Abra Minimal` request samt de två incheckade
Los Ricos-projektfixturerna. V1-fixturer märks v2 och deras befintliga kalenderdatum
används på samma sätt som regressionstesterna. Viscaria har ingen komplett
snapshot-request eller projektfixture i repositoryt; endast en fristående debugserie
och ett Viscaria-liknande presentationsfall finns, varför ingen konstruerad
Viscaria-fixture användes.

Förkortningar: `A/E/D` = actual/expected/deviation, `old/new adj`, `stab`, `years`
är justeringar, `raw`, `mid`, `band` och annual midpoint/share visas före → efter.
Noll-EBITDA-år redovisas för motor-audit men klipps från både naturlig och quality
overlay.

### Abra Minimal

| År | Annual / fwd EBITDA USD | Rem | A / E / D | Adj old→new | Stab / years | Raw old→new | Mid old→new | Band old→new | Mid/share old→new | Clamp |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 2026 | 0 / 101,700,000 | 8 | .375/.625/-.250 | 0→+.25 | -.75/0 | 6→6.25 | 6→6.25 | 5–7→5.25–7.25 | klippt | – |
| 2027 | 0 / 135,600,000 | 8 | .500/.625/-.125 | 0→+.125 | -.50/0 | 6.25→6.375 | 6.25→6.375 | 5.25–7.25→5.375–7.375 | klippt | – |
| 2028 | 169,500,000 / 169,500,000 | 8 | .625/.625/0 | +.25→0 | +.50/0 | 7.50→7.25 | 7.50→7.25 | 6.50–8.50→6.25–8.25 | 3.8750→3.7454 | – |
| 2029 | 169,500,000 / 169,500,000 | 7 | .714/.714/0 | 0→0 | +.50/-.50 | 6.75→6.75 | 6.75→6.75 | 5.75–7.75→5.75–7.75 | 3.4863→3.4863 | – |
| 2030 | 169,500,000 / 169,500,000 | 6 | .833/.833/0 | 0→0 | +.50/-.50 | 6.75→6.75 | 6.75→6.75 | 5.75–7.75→5.75–7.75 | 3.4863→3.4863 | – |
| 2031 | 169,500,000 / 169,500,000 | 5 | 1/1/0 | -.25→0 | +.50/-.50 | 6.50→6.75 | 6.50→6.75 | 5.50–7.50→5.75–7.75 | 3.3568→3.4863 | – |
| 2032 | 169,500,000 / 169,500,000 | 4 | 1/1/0 | -.25→0 | +.50/-1 | 6→6.25 | 6→6.25 | 5–7→5.25–7.25 | 3.0977→3.2273 | – |
| 2033 | 169,500,000 / 169,500,000 | 3 | 1/1/0 | -.25→0 | +.50/-1 | 6→6.25 | 6→6.25 | 5–7→5.25–7.25 | 3.0977→3.2273 | – |

### Los Ricos North + Los Ricos South

| År | Annual / fwd EBITDA USD | Rem | A / E / D | Adj old→new | Stab / years | Raw old→new | Mid old→new | Band old→new | Mid/share old→new | Clamp |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 2025 | 0 / 3,117,270 | 7 | .150/.714/-.564 | -.50→+.25 | -.75/-.50 | 3→3.75 | 3→3.75 | 3–4→3–4.75 | klippt | – |
| 2026 | 0 / 14,025,991 | 7 | .675/.714/-.039 | +.25→0 | -.75/-.50 | 4.50→4.25 | 4.50→4.25 | 3.50–5.50→3.25–5.25 | klippt | – |
| 2027 | 0 / 16,009,143 | 7 | .771/.714/+.057 | 0→0 | -.75/-.50 | 3.50→3.50 | 3.50→3.50 | 3–4.50→3–4.50 | klippt | – |
| 2028 | 0 / 19,020,217 | 7 | .916/.714/+.202 | -.25→-.50 | -.75/-.50 | 3.25→3 | 3.25→3 | 3–4.25→3–4 | klippt | 3x new |
| 2029 | 15,586,351 / 19,583,391 | 7 | .943/.714/+.229 | -.25→-.50 | -.75/-.50 | 3.25→3 | 3.25→3 | 3–4.25→3–4 | .1291→.1184 | 3x new |
| 2030 | 54,543,603 / 16,963,370 | 6 | .961/.833/+.128 | -.25→-.25 | -.75/-.50 | 3→3 | 3→3 | 3–4→3–4 | .4398→.4398 | 3x |
| 2031 | 9,915,764 / 5,693,978 | 5 | .898/1/-.102 | -.25→+.125 | -.75/-.50 | 3→3.375 | 3→3.375 | 3–4→3–4.375 | .0716→.0818 | – |
| 2032 | 15,055,367 / 4,396,058 | 4 | 1/1/0 | -.25→0 | -.75/-1 | 2.50→2.75 | 3→3 | 3–4→3–4 | .1140→.1140 | 3x båda |

## Clamp- och korrelationsaudit

| Fixture | Beräkningsbara | New 3x | New 10x | Raw ändrad, clamp samma | Concentration + stability penalty | Tre samtidiga penalties | Monoton decline med concentration + CV penalty |
|---|---:|---:|---:|---:|---:|---:|---:|
| Abra Minimal | 8 | 0 | 0 | 0 | 0 | 0 | 0 |
| Los Ricos N+S | 8 | 4 | 0 | 1 | 3 | 3 | 0 |
| Totalt | 16 | 4 | 0 | 1 | 3 | 3 | 0 |

De tre Los Ricos-raderna med samtidiga negativa concentration-, stability- och
remaining-years-justeringar är 2028–2030. Ingen av deras femåriga EBITDA-profiler
är monotont fallande, så dessa fixtures bevisar inte dubbel penalty på en helt
jämn, förutsägbar decline. Däremot använder CV rå nivåvariation och kan därför
inte skilja trend från oförutsägbar variation. De deterministiska jämna profilerna
visar att den nya koncentrationsfaktorn är neutral; en framtida separat testmatris
för linjära declines bör ligga till grund för eventuell trendjusterad stability.
Stability-policyn ändrades inte.

## Overlay-klippning

Både natural och quality presentation kräver positiv vald EBITDA-basis och positiv
årlig ekonomisk EBITDA. Quality kräver dessutom full computability, tre finita
multiplar, tre finita absoluta equity values och positiv canonical denominator.
Tester verifierar gemensamt första synliga annual-år, verkligt avbrott vid senare
nollår, inget värde efter `NOT_COMPUTABLE`, forward-average construction-klippning,
null equity values och ogiltiga canonical shares. Detta innebär inga quality-punkter
före produktion, inga interpolerade gap och inget 6x-fallbackvärde.

## Icke-regressionsverdict

Snapshot-regressionen fryser och jämför befintliga `series`, aggregation,
financing, canonical valuation timeline, Corporate valuation time series, listor
och Corporate-output före/efter ett separat quality-motoranrop. Den verifierar
också exakt statisk 5x/6x/7x bridge-paritet. Quality-, presentations- och
snapshot-regressionerna samt production build är gröna. Repositoryts fulla
`npm test` fortsätter förbi samtliga ändringsnära tester men stoppas av det
befintliga pris-testet `resolvePrices.test.ts`: testet förväntar källan `live` men
den aktuella miljön returnerar `fmp`. Felet ligger utanför denna ändringsyta och
ändrar inte nedanstående numeriska icke-regressionsverdict. Därmed är EBITDA,
revenue, sustaining CAPEX, EBIT, skatt, FCFF, DCF, NPV,
NAV, IRR/payback-output, financing, net cash, canonical shares, annual/forward
basis, combined 70/30, statisk overlay, tabell och Project View oförändrade.
Endast quality-multipel, dess diagnostik/per-share-serier och den begärda
presentationsklippningen ändras.
