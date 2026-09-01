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
- U3O8 och WO3 har exakta product-id guards och aktiva fysiska scale-policyer utan att skapa eller gissa price keys.

### 3.3 Beslutad arkitektur

Separera:

- **physical project products**: alla faktiska payable-produkter som finns i canonical Project-data,
- **Tier scale policy products**: exakta product-id:n med explicit beslutad fysisk Tier-1-gräns,
- **Tier cost benchmark metals/products**: den separata mängd som har en definitionskompatibel extern cost-benchmark.

Tier-output ska därför kunna visa exempelvis:

- `Mo: 6.4 kt/år · 0.64x mot 10 kt Mo/år`
- en fysisk produkt utan aktiv cost-benchmark ska fortfarande synas, medan cost-gaten blir `Ej verifierad`.

Detta är generiskt. Samma princip ska fungera för framtida Sn, U3O8, WO3, Al, järnmalmsprodukt osv. En price key eller fysisk produktion innebär **inte** automatiskt att en Tier-produktionsgräns eller cost benchmark finns.

### 3.4 Beslutad scale-policy

Följande scale-policyer är aktiva i PR #516:

- Au = 300 koz/år
- Ag = 15 Moz/år
- Cu = 100 kt/år
- Zn = 150 kt/år
- Pb = 100 kt/år
- Ni = 40 kt/år
- Pt = 100 koz/år
- Pd = 150 koz/år
- **Mo = 10 kt payable Mo/år**
- **U3O8 = 5.0 Mlb recovered/payable U3O8/år**
- **WO3 = 2,000 t recovered/payable WO3/år**

Iron ore = 25 Mt/år saleable/usable product är fortsatt research-only och unscored.

Hard product-identity guards gäller: `U != U3O8`, `W != WO3`, contained Fe != saleable iron-ore product och concentrate tonnes != recovered/payable product tonnes.

## 4. Problem B — kostnadsposition fungerar inte ännu för våra fem Cu-primary golden cases

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

### 4.2 Varför gaten ska förbli fail-closed

Tier får inte bygga `C1_CU_USD_PER_LB` genom att bara ta ett rapporterat by-product-värde eller byta denominator till CuEq. Den nya allocatorn kan mekaniskt fördela en explicit canonical cost pool, men får inte själv välja allocation-price vector, komponentgräns, stream treatment eller cost-vintage.

Samtliga fem golden cases är polymetalliska. Därför krävs en definitionskompatibel co-product-brygga innan en extern percentile claim kan göras.

## 5. Vad som är verifierat om S&P co-product-principen

### 5.1 Verifierat på hög nivå

Den offentliga evidensen stödjer följande:

- kurvan avser cash operating costs / C1 på **co-product basis**,
- x-axeln avser paid copper,
- S&P/SNL Mine Economics-metodik allokerar gemensamma kostnader mellan co-products med **net-revenue pro-rata** när kostnaden inte kan hänföras direkt till en produkt,
- co-product cost påverkas därför av metallernas relativa revenue shares.

S&P:s egen analys av copper-cobalt mines visar denna mekanik explicit: när cobalt-priset förändras förändras cobalt-revenue share och därmed allocated copper cost.

### 5.2 Santa Cruz som definitionskontroll

Santa Cruz är markerad på den S&P-baserade kurvan med ungefär **1.32 USD/lb Cu**.

Santa Cruz PFS bygger 1.32 USD/lb från:

- mining,
- processing,
- G&A,

med royalties separat utanför just den 1.32 USD/lb-bryggan.

Det ger stark evidens för att den använda S&P-kurvan accepterar en C1-definition där mine-site operating cost + site G&A är en kompatibel kärna åtminstone för Santa Cruz.

### 5.3 Ytterligare metod-audit

Historisk offentlig SNL-evidens identifierar realisation charges som off-site treatment/refining samt freight och marketing, och visar att den bredare Mine Economics-modellen explicit modellerade dessa poster samt royalties och production taxes.

Detta minskar osäkerheten om vilka typer av poster som finns i datasetet, men bevisar **inte** att den exakta aktuella 2024 `Cash Operating Costs / C1`-kurvan inkluderar eller exkluderar dem på samma sätt för varje observation.

### 5.4 Fortfarande Ej verifierat

Följande återstår för full current S&P-kompatibilitet:

- exakt allocation net-revenue / price vector för 2024-datasetet,
- stream treatment när ett projekt faktiskt har stream/encumbrance,
- universell current C1 component inclusion/exclusion boundary,
- project-cost-year normalization/alignment till 2024 actual.

För ett projekt som verifierat saknar streams är stream-frågan **not applicable** för just det projektet; det innebär inte att den globala S&P stream-metoden är verifierad.

**Status för full S&P-kompatibilitet: Ej verifierad.**

## 6. Rapporterade checkpoints i de fem golden cases

Dessa värden är värdefulla men får inte automatiskt läggas på S&P-kurvan.

### 6.1 Vizcachitas

Rapport-checkpoints:

- C1 first 8 operating years: **0.93 USD/lb Cu produced**
- C1 LOM: **1.25 USD/lb Cu produced**
- AISC first 8 years: 2.13 USD/lb Cu produced
- AISC LOM: 2.35 USD/lb Cu produced
- källa: Section 21.2.3 / Table 21.11 p.349

Golden bridge i PR #516 rekonstruerar rapportbasis från canonical Table 22.7-kostnader:

- first 8: **0.920506 USD/lb produced Cu** mot rapport 0.93,
- LOM producing periods: **1.241129 USD/lb produced Cu** mot rapport 1.25,
- samma first-8 cost pool / payable Cu: **0.953876 USD/lb payable Cu**.

Det bevisar både att canonical cost rows återger rapportens C1-definition och att produced/payable denominator inte får blandas.

PFS anger LOM net revenue ungefär **88% Cu, 10% Mo, balance Ag**, men Table 22.7 aggregerar Selling & Payability Expenses över produkterna. En exakt annual net-revenue vector per product kan därför inte återskapas utan antaganden.

Som diagnostik ger report-price-deck + payable quantities first 8 en gross-payable Cu revenue share ≈ **89.8448%** och en mekanisk gross-revenue-weighted C1 ≈ **0.855793 USD/lb payable Cu**. Den siffran är **inte** S&P-kompatibel och får inte användas för percentile Tier eftersom SNL/S&P-metoden kräver net revenue.

Vizcachitas har `streamsByMetal: null`, så stream blocker är inte project-applicable. Kvarvarande blockerare är exakt net-revenue vector, full current C1 boundary och 2023-real → 2024-actual cost-vintage alignment.

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

`verification.reportedCostCheckpoints` är oracle/evidence och ska aldrig override:a canonical Project-ekonomi.

Rätt användning:

1. Project-ekonomin producerar canonical cost-derivation.
2. Tier jämför derivationen med exakt kompatibel benchmark.
3. Rapport-checkpoint används för reconciliation/diagnostik och för att förstå skillnader.
4. Vid definitionsmismatch blir benchmarkclaim `Ej verifierad`, men rapportvärdet visas fortfarande som evidence.

## 8. Canonical polymetallic co-product C1-brygga

Målet är att derivera ett **paid-Cu co-product C1** från samma Project-ekonomi som redan driver FCFF.

För varje period `t`:

```text
RevenueShare_Cu,t = AllocationRevenue_Cu,t / sum_m AllocationRevenue_m,t
AllocatedMixedCost_Cu,t = MixedCost_t * RevenueShare_Cu,t
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

Denominator och metric:

```text
CuC1Denominator = sum_t(payable / paid Cu lb)
Canonical co-product Cu C1 = CuC1Numerator / CuC1Denominator
```

Co-product cost-allokering får inte ersättas av AuEq/CuEq-denominator. Andra metaller påverkar numerator genom allocation, inte denominator genom en implicit equivalent-konvertering.

## 9. Cost allocation contract i V3

PR #516 implementerar additiv metadata på canonical cost components:

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

Allocation metadata innehåller **ingen ny dollarserie**. Den svarar endast på hur en redan canonical Project-cost ska fördelas mellan co-products för en specificerad cost metric.

Allocatorn i `src/lib/tier1/costAllocation.ts` är fail-closed och testar conservation. Den väljer inte allocation prices, benchmark boundary, stream treatment eller cost vintage.

## 10. Allocation revenue är en separat definitionsfråga från accounting revenue

Revenue share kan inte slentrianmässigt använda vilken revenue-rad som helst. SNL/S&P-evidensen anger **net-revenue** pro-rata. Därför får current spot revenue eller gross payable revenue inte användas som implicit proxy.

En project-specific allocation vector måste vara explicit source-backed och definitionskompatibel. Om source-dokumentet bara anger en avrundad LOM-share eller en aggregerad multi-product selling deduction är den exakta allocation-vectorn **Ej verifierad**.

## 11. Current implementation state

Implementerat i PR #516:

- generic product-based physical scale,
- active Mo/U3O8/WO3 scale policies,
- exact product identity guards,
- Pre Revenue/UI product discovery,
- V3 optional allocation metadata contract,
- generic fail-closed co-product allocator,
- Cu C1 external definition-readiness contract,
- project-specific no-stream applicability guard,
- Vizcachitas first cost golden bridge and reconciliation diagnostics.

Inte implementerat/inte verifierat:

- speculative allocation metadata in golden project fixtures,
- automatic decomposition of aggregate selling/payability costs,
- guessed S&P allocation prices,
- guessed stream treatment,
- guessed 2023→2024 cost escalation,
- active S&P Cu percentile claim for polymetallic golden cases.

## 12. Handoff / next work

Nästa säkra steg är att försöka stänga någon av de tre kvarvarande Vizcachitas-blockerarna från source evidence eller exact external methodology. Om det inte går ska Vizcachitas cost-gate fortsätta vara `Ej verifierad`, medan report C1 reconstruction och diagnostics fortfarande visas som evidence.

Warintza bör behandlas separat senare eftersom dess Au stream gör stream treatment faktiskt project-applicable. Berg, Arctic och Copper Creek kräver motsvarande source-by-source bridge audit innan någon allocation metadata skrivs.
