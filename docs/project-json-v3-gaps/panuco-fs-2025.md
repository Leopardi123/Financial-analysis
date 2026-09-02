# Överlämning: Panuco FS 2025 och project_json_v3

**Status: EJ VERIFIERAD – ENGINE_GAP**

Detta dokument beskriver pilotkörningen som gjordes efter PR #517. Syftet var att prova det nya automatiska arbetsflödet på en teknisk rapport från Google Drive och, om rapporten kunde mappas utan antaganden, skapa samma två nya filer som vid manuellt arbete:

1. en `project_json_v3`-fixtur;
2. ett tillhörande avstämningstest.

Arbetsflödet får aldrig merga, ändra befintlig kod eller pressa fram en JSON med gissningar.

## Vad som gjordes

Rapporten `Vizsla_Silver_Panuco_NI43-101_FS_2025-12-02.pdf` hämtades från Google Drive och dess ekonomiska modell granskades mot nuvarande V3-schema och avstämningsmotor.

Följande kontrollerades:

- rapportens exakta perioder;
- metallproduktion och betalbar metall;
- metallpriser;
- intäkter, driftkostnader och royalties;
- initial CAPEX, expansion, sustaining CAPEX, closure och salvage;
- rörelsekapital och skatt;
- årligt kassaflöde före och efter skatt;
- rapporterad NPV och IRR.

## Vad rapporten visar

Källa: Panuco FS, effektiv 4 november 2025, daterad 2 december 2025.

- Tabell 19-1, sidan 403: silverpris 35,50 USD/oz och guldpris 3 100 USD/oz.
- Tabellerna 22-1 och 22-2, sidorna 457–461: 14 perioder, märkta `-2, -1, 1 ... 12`.
- Diskonteringsränta: 5 procent, med diskontering mitt i perioden.
- NPV5 före skatt: 2 842 MUSD. IRR före skatt: 159,3 procent.
- NPV5 efter skatt: 1 802 MUSD. IRR efter skatt: 111,1 procent.
- Initialt kapital: 239 MUSD.
- Intäkter före kommersiell produktion: 128 MUSD.
- Kostnader före kommersiell produktion: 62 MUSD.
- Rapportens nettoredovisade ”Initial Costs”: 173 MUSD.
- Expansion: 15 MUSD; sustaining CAPEX: 287 MUSD; closure: 38 MUSD; salvage: 10 MUSD.

Tabell 22-2 innehåller dessutom årliga kassaflöden före och efter skatt samt årlig skatt. Underlaget räcker därför för att kontrollera slutresultatet mycket noggrant.

## Det konkreta problemet

Panuco säljer silver och guld under uppstarts- och byggperioden, innan rapportens kommersiella produktion börjar. Rapporten behandlar dessa försäljningar som en minskning av kostnaden för att färdigställa gruvan:

```text
239 MUSD initialt kapital
+ 62 MUSD kostnader före kommersiell produktion
- 128 MUSD intäkter före kommersiell produktion
= 173 MUSD nettoredovisade Initial Costs
```

Nuvarande V3-motor saknar ett särskilt fält för denna redovisning. Om metallmängderna läggs in normalt räknar motorn försäljningen som vanlig driftintäkt. Alternativet vore att gömma intäkterna i CAPEX eller lägga in en konstgjord balanspost. Båda vägarna skulle ge fel ekonomisk klassificering, även om det sammanlagda kassaflödet kunde fås att likna rapportens.

Det finns ett andra problem: rapporten visar de 62 MUSD i förproduktionskostnader som en samlad rad. Den visar inte en säker årlig uppdelning mellan gruvdrift, process, G&A, off-site-kostnader och royalties. De privata royaltysatserna är dessutom olika, 2 respektive 3,5 procent NSR. En exakt fördelning eller en gemensam runtime-proxy kan därför inte skapas utan antaganden.

## Beslut i pilotkörningen

Ingen JSON-fixtur skapades. Inget test skapades. Ingen befintlig kod ändrades.

Detta är avsiktligt: stoppregeln fungerade. En fixtur som passerar genom balansposter, hopslagna kostnadsslag eller gissade royalties skulle ge skenbar precision och bryta mot single-source-principen.

Den enda nya filen i PR #518 är denna dokumentation.

## Vad som krävs härnäst

Innan Panuco kan bli en verifierad och körbar V3-fixtur behöver motorn få ett källtroget sätt att representera antingen:

1. separata förproduktionsintäkter och förproduktionskostnader som kapitaliseras utan dubbelräkning; eller
2. en särskild nettoserie för utvecklingskostnad som tillåter rapportens intäktsavdrag och samtidigt bevarar källhänvisning och kostnadsslag.

Därefter ska Panuco-fixturen kontrolleras mot:

- exakt periodmappning från Tabell 22-2;
- kassaflöde före och efter skatt period för period;
- rapportens NPV och IRR inom 2 procent;
- CAPEX, sustaining, closure, salvage och rörelsekapital;
- inga balansposter och inga gissade royaltyfördelningar.

## Instruktion till nästa chatt

Utgå från PR #518 och detta dokument. Ändra inte Panuco-data ännu. Börja med att bedöma vilken generell motorlösning som är korrekt även för andra tekniska rapporter med preproduction revenue eller capitalized operating costs. En eventuell motorändring ska göras i en separat PR. PR #518 ska förbli en ren dokumentations- och gaprapport och får inte mergas automatiskt.
