# Tier · Pre Revenue — polymetallisk cost- och scale-foundation

Status: **SCALE PHASE A IMPLEMENTED / COST RESEARCH FOUNDATION — NOT YET A COST-TIER CLAIM**

Syfte: Bevara den fulla audit- och forskningsbilden för Tier-arbetet så att implementation och fortsatt cost-research kan fortsätta utan att tappa definitionsgränserna. Dokumentet beskriver vad som är verifierat, vad som saknas, varför nuvarande Tier-cost misslyckas för de fem golden testprojekten, och vilken arkitektur som krävs för att få en definitionssäker kostnadsposition utan att bryta project_json_v3 SSOT. Scale-delen är nu implementerad produktbaserat i PR #516.

## 1. Scope och icke-förhandlingsbara regler

Detta arbete gäller **Compare Stocks → Pre Revenue → Tier** och omfattar framför allt:

1. `Skala · produkt för produkt` ska visa samtliga fysiska projektprodukter som finns i canonical Project-data.
2. Endast produkter med en explicit, beslutad Tier-produktionsgräns får bidra till `combinedScaleEquivalent`.
3. Kostnadsposition ska klassificeras mot en extern kostnadskurva endast när projektmåttet och benchmarken är definitionskompatibla.
4. Rapporterade C1/AISC/cash-cost-värden är **evidence/checkpoints**, inte parallella ekonomiska inputs och inte manuella Tier-overrides.
5. `project_json_v3` förblir single source för projektets ekonomiska dollarserier. Cost-allocation-semantik får beskriva hur en redan kanonisk kostnad allokeras mellan produkter, men får inte skapa en andra kostnadsledger.
6. Gissa aldrig produkt-/metallgränser, price keys, benchmarkdefinitioner, cost-basis eller kostnadskomponenter.

## 2. Golden cases i detta arbetsblock

De fem testprojekten är:

- Vizcachitas
- Berg
- Warintza
- Arctic
- Copper Creek

De används inte bara som exempel utan som regression/golden cases för att bevisa att Tier-motorn kan hantera verkliga polymetalliska PFS/FS/PEA-modeller.

## 3. Problem A — scale tappade riktiga projektprodukter

### 3.1 Tidigare orsak — nu korrigerad i PR #516

Tier hade en hård typ/whitelist:

`Au | Ag | Cu | Zn | Pb | Ni | Pt | Pd`

och `TIER1_PRODUCTION_THRESHOLDS` fanns endast för dessa metaller. Tier-routen filtrerade fysisk payable-produktion med `isTier1Metal(metal)` innan scale-output byggdes.

Konsekvensen var att en produkt kunde finnas fullt ut i canonical Project-data, ha canonical quantity-unit och canonical price key, men ändå försvinna ur scale-output bara därför att Tier-cost/threshold-whitelisten inte innehöll produkten.

PR #516 separerar nu fysisk product discovery från scale-policy och cost-benchmark-stöd. Fysisk payable production läses först; därefter avgör ett separat exakt product-id-register om produkten får bidra till combined scale.

### 3.2 Golden-case coverage

Tidigare felbild:

- Vizcachitas: Cu, **Mo**, Ag → Mo föll bort.
- Berg: Cu, **Mo**, Ag, Au → Mo föll bort.
- Warintza: Cu, Au, Ag, **Mo** → Mo föll bort.
- Arctic: Cu, Zn, Pb, Au, Ag → alla stöddes redan av Tier-whitelisten.
- Copper Creek: Cu, Ag, **Mo** → Mo föll bort.

Nuvarande regression i PR #516:

- Mo är synligt och score-genererande i Vizcachitas, Berg, Warintza och Copper Creek.
- Berg verifierar dessutom dimensionssäker `lb → tonne`-normalisering för payable Mo.
- Arctic verifierar att befintlig Zn-policy 150 kt/år bevaras.

### 3.3 Beslutad arkitektur

Separera:

- **physical project products**: alla faktiska payable-produkter som finns i canonical Project-data,
- **Tier scale policy products**: exakta product-id:n med explicit beslutad fysisk Tier-1-gräns,
- **Tier cost benchmark metals/products**: den separata mängd som har en definitionskompatibel extern cost-benchmark.

Tier-output ska därför kunna visa exempelvis:

- `Mo: 6.4 kt/år · 0.64x mot 10 kt Mo/år`
- `U3O8: fysisk produktion · ej poängsatt` om produkten finns men ingen aktiv scale-policy ännu finns.

Detta är generiskt. Samma princip ska fungera för framtida Sn, U3O8, WO3, Al, järnmalmsprodukt osv. En price key eller fysisk produktion innebär **inte** automatiskt att en Tier-produktionsgräns eller cost benchmark finns.

### 3.4 Beslutad scale-policy och öppna kandidater

**Mo = 10 kt payable Mo/år är beslutad och implementerad i PR #516.**

Befintliga policygränser för bland annat **Ni = 40 kt/år** och **Zn = 150 kt/år** bevaras.

Följande research recommendations är däremot ännu inte aktiva scale-policyer och ska därför förbli synliga men `ej poängsatta` tills de uttryckligen accepteras:

- U3O8 = 5.0 Mlb recovered/payable U3O8/år,
- WO3 = 2,000 t recovered/payable WO3/år,
- iron ore = 25 Mt/år saleable/usable product.

Hard product-identity guards gäller: `U != U3O8`, `W != WO3`, contained Fe != saleable iron-ore product och concentrate tonnes != recovered/payable product tonnes.

## 4. Problem B — kostnadsposition fungerar inte för våra fem Cu-primary golden cases

### 4.1 Extern benchmark som finns idag

Nuvarande Cu-benchmark i Tier-konfigurationen:

- metric: `C1_CU_USD_PER_LB`
- basis: S&P co-product C1
- dataset: 2024 actual / Q4 2024 S&P Global Market Intelligence dataset
- P25 ≈ 1.40 USD/lb
- P50 ≈ 1.76 USD/lb
- P75 ≈ 2.18 USD/lb
- source: Ivanhoe Electric Santa Cruz PFS investor presentation, slide 10, `First Quartile Unit Cash Costs`
- benchmarken är offentlig men percentile-värdena är digitaliserade från grafen; osäkerhet är bevarad separat i Tier-konfigurationen.

### 4.2 Varför gaten är tom idag

Tier-routen bygger i nuläget inte `C1_CU_USD_PER_LB` för dessa projekt. Den fyller i huvudsak Au AISC, AgEq AISC och ZnEq AISC innan `assessCost()` anropas.

Det finns redan en `computeCanonicalC1ForProject()` i `src/lib/tier1/cost.ts`, men den är medvetet fail-closed för polymetalliska Cu-projekt. Om sekundära metallintäkter finns vägrar den att gissa co-product-allokering.

Detta är korrekt skyddsbeteende. Samtliga fem golden cases är polymetalliska.

## 5. Vad som är verifierat om S&P co-product-principen

### 5.1 Verifierat på hög nivå

Den offentliga evidensen stödjer följande:

- kurvan avser cash operating costs / C1 på **co-product basis**,
- x-axeln avser paid copper,
- S&P/SNL Mine Economics-metodik allokerar gemensamma kostnader mellan co-products med ekonomisk/revenue-baserad fördelning när kostnaden inte kan hänföras direkt till en produkt,
- co-product cost påverkas därför av metallernas relativa priser/revenue shares.

S&P:s egen analys av copper-cobalt mines visar denna mekanik explicit: när cobalt-priset förändras förändras cobalt-revenue share och därmed allocated copper cost.

### 5.2 Santa Cruz som definitionskontroll

Santa Cruz är markerad på den S&P-baserade kurvan med ungefär **1.32 USD/lb Cu**.

Santa Cruz tekniska rapport/PFS bygger 1.32 USD/lb från ungefär:

- mining,
- processing,
- G&A,

med royalties separat utanför just den 1.32 USD/lb-bryggan.

Det ger stark evidens för att den använda S&P-kurvan accepterar en C1-definition där mine-site operating cost + site G&A är central numerator åtminstone för Santa Cruz.

### 5.3 Fortfarande Ej verifierat

Vi har **inte** tillräcklig offentlig direkt S&P-metoddokumentation för att hävda hela den exakta komponentgränsen för kurvan.

Följande måste därför fortfarande behandlas som öppna definitioner tills de källverifierats:

- exakt behandling av TC/RC,
- freight / transport,
- insurance / marketing,
- royalties,
- andra off-site charges,
- eventuell behandling av stream/financing-arrangemang i revenue-allokeringen,
- vilket exakt metallprisdeck S&P använder för co-product revenue allocation i 2024 actual dataset.

**Status för full S&P-kompatibilitet: Ej verifierad.**

## 6. Rapporterade checkpoints i de fem golden cases

Dessa värden är värdefulla men får inte automatiskt läggas på S&P-kurvan.

### 6.1 Vizcachitas

Rapport-checkpoints i V3-fixturen:

- C1 first 8 operating years: **0.93 USD/lb Cu produced**
- C1 LOM: **1.25 USD/lb Cu produced**
- AISC first 8 years: 2.13 USD/lb Cu produced
- AISC LOM: 2.35 USD/lb Cu produced
- källa: Table 21.11 p.349 / Section 21.2.3 context

Problem mot S&P:

- denominator är produced Cu, medan benchmarkkurvan använder paid copper,
- rapportdefinitionen är inte verifierad som S&P co-product revenue allocation.

### 6.2 Berg

Rapport-checkpoints:

- C1 by-product basis: **-0.17 USD/lb Cu**
- C1 co-product basis: **1.95 USD/lb CuEq**
- källa: Table 22-3 pp.321-322; Table 22-4 p.324

Problem mot S&P:

- -0.17 är explicit by-product basis,
- 1.95 är co-product men denominator är CuEq enligt rapportens formel, inte paid Cu,
- därför får inget av värdena användas direkt som S&P paid-Cu C1 utan ytterligare definitionsbrygga.

### 6.3 Warintza

Rapport-checkpoints:

- C1: **1.01 USD/lb payable Cu**
- AISC: 1.25 USD/lb payable Cu
- källa: Table 22.4 p.345

Detta är närmast benchmarkens denominator, men full co-product allocation är inte verifierad från rapportens checkpoint. Dessutom finns en Au stream som gör revenue-allocation-basis särskilt viktig att definiera.

### 6.4 Arctic

Rapport-checkpoints:

- `Cash Costs, Net of By-product Credits`: **0.72 USD/lb payable Cu**
- `All-in Cost, Net of By-product Credits`: **1.61 USD/lb payable Cu**
- källa: Table 22-2 pp.390-391

FS använder inte nödvändigtvis termen C1 för 0.72 och inte AISC för 1.61. Dessa får därför inte tyst omdöpas.

Problem mot S&P:

- explicit net-by-product basis,
- inte verifierad co-product allocation.

### 6.5 Copper Creek

Rapport-checkpoints:

- Cash Cost / Cash Costs (By-Product Basis): **1.67 USD/lb Cu**
- AISC Cu by-product: **1.85 USD/lb Cu**
- källa: Table 22-1 pp.348-349; Table 22-3 p.354

Problem mot S&P:

- explicit by-product basis,
- benchmarken är co-product.

## 7. Varför rapport-checkpoints ska förbli evidence-only

V3-foundationen är korrekt här:

`verification.reportedCostCheckpoints` är oracle/evidence och ska aldrig override:a canonical Project-ekonomi.

Detta ska inte ändras för att få Tier att börja visa en siffra.

Rätt användning:

1. Project-ekonomin producerar canonical cost-derivation.
2. Tier jämför derivationen med exakt kompatibel benchmark.
3. Rapport-checkpoint används för reconciliation/diagnostik och för att förstå skillnader.
4. Vid definitionsmismatch blir benchmarkclaim `Ej verifierad`, men rapportvärdet visas fortfarande som evidence.

## 8. Föreslagen canonical polymetallic co-product C1-brygga

Målet är att derivera ett **paid-Cu co-product C1** från samma Project-ekonomi som redan driver FCFF.

### 8.1 Grundidé

För varje period `t`:

```text
RevenueShare_Cu,t = AllocationRevenue_Cu,t / sum_m AllocationRevenue_m,t
```

Gemensamma kostnader:

```text
AllocatedMixedCost_Cu,t = MixedCost_t * RevenueShare_Cu,t
```

Direkta kostnader:

```text
AllocatedDirectCost_Cu,t = sum(direct cost components tagged to Cu)
```

Total canonical Cu numerator:

```text
CuC1Numerator = sum_t(
  AllocatedDirectCost_Cu,t
  + AllocatedMixedCost_Cu,t
  + any benchmark-included offsite Cu costs
)
```

Denominator:

```text
CuC1Denominator = sum_t(payable / paid Cu lb)
```

Metric:

```text
Canonical co-product Cu C1 = CuC1Numerator / CuC1Denominator
```

### 8.2 Viktigt: detta är inte CuEq

Co-product cost-allokering ska inte ersättas av AuEq/CuEq-denominator.

Benchmarken är per paid Cu lb. Andra metaller påverkar numerator genom cost allocation, inte genom att denominator artificiellt byggs om till CuEq.

## 9. Cost allocation contract som V3 behöver

Nuvarande V3 cost components har kategori och dollarserie men inte produktallokeringssemantik.

Föreslagen semantik är additiv metadata på canonical cost component, exempelvis:

```json
{
  "allocation": {
    "mode": "MIXED_REVENUE_WEIGHTED"
  }
}
```

eller:

```json
{
  "allocation": {
    "mode": "DIRECT_TO_METAL",
    "metal": "Cu"
  }
}
```

Möjliga framtida modes får endast läggas till när de behövs och kan definieras exakt.

### 9.1 SSOT-regel

Allocation metadata får **inte** innehålla en ny dollarserie.

Den svarar endast på frågan:

> Hur ska denna redan canonical Project-cost fördelas mellan co-products för en specificerad cost metric?

## 10. Allocation revenue är en separat definitionsfråga från accounting revenue

Revenue share kan inte slentrianmässigt använda vilken revenue-rad som helst.

För en S&P-compatible co-product allocation måste vi låsa:

- quantity basis per metal,
- price basis per metal,
- stream treatment,
- payability treatment,
- om royalty/offsite påverkar allocation revenue eller endast cost numerator.

Det kan vara nödvändigt att beräkna ett **allocation revenue vector** som en derivation från canonical physical production × benchmark allocation prices, utan att ändra Project revenue eller FCFF.

Det är tillåtet eftersom det är ett härlett fördelningsmått, inte en ekonomisk input eller parallell ledger.

## 11. Price vintage och cost vintage

Detta är en hård definitionsfråga.

S&P Cu-kurvan avser 2024 actual. Golden-projectens cost bases ligger i olika år:

- Vizcachitas: 2023 real USD
- Arctic: 2023
- Copper Creek: Q1 2023 USD
- Warintza: 2025 study basis
- Berg: 2026 study basis

En 2026-dollar-cost ska inte automatiskt jämföras mot en 2024-cost curve.

### 11.1 Godtagbara vägar

Prioritet:

1. använd en definitionshomogen cost-curve snapshot för samma cost year om en sådan kan verifieras,
2. annars explicit cost-year normalization med verifierad indexserie/metodik,
3. om varken 1 eller 2 kan verifieras → `Ej verifierad`.

Ingen implicit CPI eller egen inflationsfaktor får smygas in.

## 12. Stream treatment — Warintza-specific blocker

Warintza har en Au stream.

Öppen fråga:

- ska co-product allocation revenue använda metallvärdet före stream-finansiering,
- retained revenue efter stream,
- eller någon annan S&P-definition?

Detta måste källverifieras. Streamen får inte automatiskt minska Au:s cost-allocation share bara därför att Project-FCFF ser mindre retained Au revenue.

Till dess är full S&P co-product C1 för Warintza **Ej verifierad**.

## 13. Vad vi redan har i koden

Vi börjar inte från noll.

Befintligt:

- canonical payable production per metal,
- quantity units,
- canonical price keys,
- revenue by metal,
- site OPEX / cost components,
- site G&A,
- selling/off-site cost ledgers,
- sustaining capex,
- royalties/fiscal ledger,
- `computeCanonicalC1ForProject()` som redan är fail-closed för polymetalliska Cu-projekt,
- external Cu percentile benchmark,
- reported-cost evidence readers,
- benchmark compatibility guards,
- five golden V3 projects with reconciled economics.

Nu också implementerat i PR #516:

- generisk physical-product discovery före cost/threshold-filter,
- separat scale threshold registry,
- Mo = 10 kt/år,
- samma sammanhängande 10-årsfönster över samtliga produkter,
- generic `scaleProducts` output med visible/scored-separation,
- golden scale-regressioner för Vizcachitas, Berg, Warintza, Copper Creek och Arctic.

Den centrala saknade länken för **cost** är alltså **product-allocation semantics + full benchmark component contract + vintage alignment**.

## 14. Har vi det som krävs?

### Ja — scale-arkitekturen är implementerad och cost-arkitekturen kan byggas vidare

Vi har tillräckligt för att:

- göra scale-output komplett för alla fysiska produkter,
- separera visible products från scored products,
- införa cost-allocation metadata utan att bryta SSOT,
- bygga en generic co-product cost allocator,
- använda payable Cu som denominator,
- skapa transparent cost-derivation traces,
- låta rapport-checkpoints reconcila resultatet,
- bygga regressioner på de fem golden cases.

### Nej — ännu inte för att kalla slutlig Cu-cost Tier fullt S&P-verifierad

Följande externa definitioner saknas fortfarande:

1. full komponentgräns för S&P:s aktuella `Cash Operating Costs / C1`-kurva,
2. exakt price/revenue basis för co-product allocation i benchmarkdatasetet,
3. explicit behandling av streams i allocation-metodiken,
4. cost-year alignment metod/snapshots för 2023/2025/2026 kontra 2024 benchmark.

Implementation får därför byggas i steg där cost-resultatet kan vara `COMPUTABLE_BUT_BENCHMARK_NOT_VERIFIED` / motsvarande diagnostiskt tillstånd tills benchmarkkontraktet är komplett.

## 15. Rekommenderad implementation sequence

### Phase A — scale completeness — IMPLEMENTED IN PR #516

- Generisk physical-product output från canonical payable production är implementerad.
- `Tier1Metal`/cost-policy hålls separat från fysisk product discovery.
- UI visar alla verifierade projektprodukter.
- Produkter utan threshold visas med fysisk produktion och `ej poängsatt`.
- Combined scale summerar endast threshold-enabled exact product ids.
- Mo = 10 kt payable Mo/år bidrar nu till combined scale.
- Golden regressioner låser Mo i Vizcachitas, Berg, Warintza och Copper Creek samt Zn i Arctic.

### Phase B — allocation contract

- Lägg till explicit allocation metadata på V3 cost components.
- Hard validation: varje component som används i co-product cost måste ha entydig allocation mode.
- Unknown ska fail-closed.
- Ingen ny dollarserie.

### Phase C — canonical co-product allocator

- Implementera generic allocator oberoende av Tier UI.
- Input: canonical cost components, physical product series, allocation price vector.
- Output: per-metal allocated cost numerator + full trace.
- Assertion: summan allocated costs över co-products ska reconcila exakt till cost pool som allokeras.

### Phase D — Cu C1 bridge

- Paid/payable Cu denominator.
- Explicit benchmark component inclusion/exclusion policy.
- Explicit price vintage.
- Explicit cost vintage.
- Output med provenance:
  - numerator components,
  - allocation shares,
  - denominator,
  - unit,
  - cost year,
  - benchmark snapshot,
  - unresolved definition flags.

### Phase E — golden reconciliation

För varje projekt:

- beräkna canonical co-product Cu C1,
- jämför mot rapporterad checkpoint men använd den inte som input,
- förklara avvikelsen genom denominator, allocation, offsite/royalty eller vintage,
- ingen dold balancing factor.

### Phase F — Tier percentile claim

Aktivera P25/P50/P75 först när:

- project metric definition är komplett,
- benchmark definition är komplett,
- units matchar,
- denominator matchar,
- allocation basis matchar,
- cost vintage är kompatibel,
- benchmark inte är stale.

Annars: `Ej verifierad` med exakt blocker.

## 16. Testkrav

Scale-kraven är nu implementerade; cost-kraven kvarstår innan cost-delen får mergeas som verifierad benchmarkfunktion:

1. **All-products scale visibility — IMPLEMENTED:** Mo syns och score:as i fyra golden cases.
2. **No invented threshold — IMPLEMENTED:** U3O8, WO3 och andra unsupported exact product ids kan vara synliga men bidrar inte till combined scale; Mo bidrar först efter explicit 10 kt-policy.
3. **Allocation conservation:** sum allocated mixed cost == source mixed cost per period och LOM inom numerisk tolerans.
4. **Direct cost isolation:** direct-to-Cu cost tilldelas 100 % Cu.
5. **Revenue-weighting:** ändrade allocation prices ändrar shares för polymetalliska projekt men ändrar inte canonical Project FCFF.
6. **Paid-Cu denominator:** Cu C1 denominator använder canonical payable/paid Cu med explicit unit conversion.
7. **No CuEq denominator substitution.**
8. **No reported-cost override:** ändra checkpoint-värde i fixture; canonical derived cost ska vara oförändrad.
9. **Benchmark fail-closed:** inkompatibel basis/unit/vintage/component contract → ingen percentile Tier.
10. **Stream regression:** Warintza får inte anta en stream-treatment utan explicit policy.
11. **Golden project trace:** Vizcachitas, Berg, Warintza, Arctic, Copper Creek producerar full diagnostics även när slutlig benchmarkclaim är Ej verifierad.

## 17. Externa forskningskällor att bevara

### Cu cost curve / Santa Cruz

Ivanhoe Electric, Santa Cruz PFS investor presentation, slide 10, `First Quartile Unit Cash Costs`.

Public URL used in research:

`https://ivanhoeelectric.com/site/assets/files/10951/sc_pfs_investor_presentation_vfinal_v2.pdf`

Santa Cruz technical report/PFS used to inspect the 1.32 USD/lb cost bridge:

`https://ivanhoeelectric.com/site/assets/files/10849/scp-gr-rep-0001_ra_s-k_1300_final_june22_1930-compressed.pdf`

### S&P co-product behavior

S&P Global Market Intelligence research showing copper cost sensitivity to cobalt revenue share under co-product costing:

`https://www.spglobal.com/market-intelligence/en/news-insights/research/the-cobalt-expansion-drive-is-a-copper-story`

### S&P/SNL methodology support

Secondary academic work referencing S&P Global Market Intelligence Metals & Mining / Mine Economics methodology and revenue-share treatment of common costs was used as methodological corroboration. This is useful evidence but does **not** replace direct current S&P methodology documentation.

### Cost-vintage context

S&P cost outlook research used only as evidence that mine-cost vintages materially move and should not be silently compared across years:

`https://www.spglobal.com/market-intelligence/en/news-insights/research/2026/01/mine-cost-outlook-2026-inflation-new-supply-reshape-global-mining-landscape`

## 18. Explicit open research TODOs

Before declaring S&P-compatible Cu Cost Tier verified, search and source-lock:

- current/public S&P Mine Economics Methodology if obtainable,
- exact C1 component inclusion/exclusion definition,
- exact treatment of TC/RC, freight, royalties and other offsite,
- exact co-product allocation price basis for 2024 actual curve,
- stream/encumbrance treatment,
- same-definition Cu cost curves for 2023, 2025 and/or 2026 if publicly available,
- otherwise a defensible, source-backed cost normalization index/methodology.

## 19. Merge/implementation guard

Scale implementation i PR #516 är separat från den ännu ofullständiga cost-benchmark-claimen.

Do not activate a Cu percentile gate merely because a number can be computed.

Cost-implementationen måste skilja tydligt mellan:

- `canonical cost derivation computable`, och
- `external benchmark comparison verified`.

Only the second may set Cost Tier 1/2/3.

---

Handoff summary: **Scale-problemet är nu implementerat produktbaserat: fysisk produktion upptäcks generiskt, Mo=10 kt/år är aktiv policy och unsupported produkter förblir synliga men unscored. Vi har tillräcklig Project-data och kodstruktur för att bygga den polymetalliska co-product-bryggan korrekt, men saknar fortfarande vissa externa S&P-definitioner för den slutliga cost-benchmark-claimen.**