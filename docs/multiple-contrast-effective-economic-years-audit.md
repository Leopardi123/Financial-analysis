# Multipelkontrast: Effective Economic Years — audit

## Slutsats

Ändringen är avgränsad till livslängdsfaktorn i kvalitetsmotorn. DCF, NAV, FCFF,
EBITDA, Revenue, EV, Equity Value, de statiska 5x/6x/7x-serierna, Combined 70/30,
Project View och den kanoniska värderingstidslinjen är fortsatt producenter eller
parallella konsumenter och ändras inte. De fyra andra kvalitetsfaktorerna behåller
sina funktioner, gränser och indata.

## Gammal och ny definition

Den borttagna **Remaining Economic Years**-policyn räknade antalet återstående
kalenderår där både Revenue och EBITDA var positiva. Varje sådant år vägde `1`,
oavsett EBITDA-nivå.

Den nya **Effective Economic Years**-faktorn använder samma återstående
kalender-tail och samma ekonomiskt giltiga år, men beräknar

```text
peakPositiveEbitda = max(positiveEbitda_i)
EffectiveEconomicYears = sum(positiveEbitda_i / peakPositiveEbitda)
```

Noll och negativa EBITDA-år bidrar med noll. Null i den obligatoriska tailen
propageras utan noll-fallback. `COMPUTABLE`, fullt femårsfönster och korta fönster
har samma regler som tidigare.

Policyn är deterministiskt halvt öppen: `<3: -1,50x`, `[3,5): -1,00x`,
`[5,7): -0,50x`, `[7,10): 0,00x`, `[10,13): +0,25x`, `[13,16): +0,50x`,
`[16,20]: +0,75x`, och `>20: +1,00x`.

## Matematiskt exempel och före/efter

För `10 × 280` följt av `7 × 60` gav den gamla faktorn 17 år och `+0,75x`.
Den nya ger `10 × 1 + 7 × (60 / 280) = 11,5` Effective Economic Years och
`+0,25x`. En jämn serie `17 × 280` ger däremot 17,0 och `+0,75x`. Den svaga
tailen får alltså `0,50x` mindre bonus än en lika lång, uthållig period.

## Producer–consumer-karta

1. Corporate snapshot producerar kanoniska kalenderjusterade serier för EBITDA,
   Revenue, sustaining CAPEX, net cash och fullt utspädda aktier.
2. `computeCorporateQualityMultiples` konsumerar serierna. Endast den tidigare
   livslängdsjusteringen ersätts; motorn publicerar `peakPositiveEbitda`,
   `effectiveEconomicYears` och `effectiveEconomicYearsAdjustment` per år.
3. Snapshot-fältet `corporateQualityMultipleTimeSeries` transporterar resultatet
   additivt.
4. Multipelkontrastpanelen konsumerar diagnostiken och overlay-presentationen
   konsumerar de redan bryggade quality-värdena. Den statiska värderingsmotorn,
   Combined 70/30 och Project View konsumerar inte det nya måttet.

## Fixture-audit

Första `COMPUTABLE`-raden i de befintliga fixture-pipelines gav:

| Fixture | År | Aktiva år | Peak EBITDA (USD) | Effective years | Gammal faktor | Ny faktor | Quality mid före → efter |
|---|---:|---:|---:|---:|---:|---:|---:|
| Abra | 2026 | 8 | 169 500 000 | 8,0000 | 0,00x | 0,00x | 6,25x → 6,25x |
| Los Ricos (North + South) | 2025 | 7 | 54 543 602,5 | 1,9036 | −0,50x | −1,50x | 3,75x → 3,00x (clamp) |

Los Ricos visar den avsedda effekten: flera nominellt aktiva men ekonomiskt små
år behandlas inte som fullvärdiga toppår.

## Clamp-audit

Råmultipeln summeras som tidigare från bas 6x och exakt fem justeringar. Mid
clampas fortsatt till `[3x, 10x]`; low/high använder fortsatt ±1x och samma
yttergränser. Gränstester täcker både policytrösklarna och att bandet inte lämnar
3x–10x. Los Ricos-raden ovan verifierar den nedre clampen numeriskt.

## Korrelationsaudit mot 5Y EBITDA concentration

Faktorerna använder relaterad EBITDA men mäter olika saker: Effective Economic
Years normaliserar varje positivt tail-år mot tailens topp, medan concentration
jämför första fönstrets andel av all positiv tail-EBITDA med en jämn profil som
fortfarande använder aktiva år. Pearson-korrelation över rader där båda måtten
finns var `−0,5512` för Abra (`n=8`) och `−0,0846` för Los Ricos (`n=12`). Det
finns därför ingen identisk eller mekaniskt perfekt faktor; concentration-kod och
policy har inte modifierats.

## Oförändrade kvalitetsfaktorer och regression

Kod- och fixture-audit verifierar oförändrade beräkningar för **Quality
Concentration**, **Stability**, **Sustaining Intensity** och **EBITDA Margin**.
Regressionstestet serialiserar och jämför snapshotens befintliga series,
aggregation, financing, canonical valuation timeline, corporate valuation time
series, Lista 2 och corporate-output före/efter ett separat quality-anrop. Det
verifierar även exakt EV- och per-share-paritet för 5x/6x/7x. Full testsvit täcker
dessutom DCF, NAV, FCFF, EBITDA, Revenue, Equity Value, Combined 70/30 och Project
View via deras befintliga regressionstester. Verdict: **PASS — ingen ekonomisk
logik utanför den riktade kvalitetsfaktorn har ändrats.**
