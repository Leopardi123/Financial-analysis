# Tier · Pre Revenue — physical scale threshold research

Status: **POLICY FOUNDATION — Mo/U3O8/WO3 IMPLEMENTED; IRON ORE REMAINS RESEARCH-ONLY**

Syfte: komplettera `docs/tier1-polymetallic-cost-and-scale-foundation.md` med source-backed fysisk skalevidens för Mo, uranium/U3O8, iron ore, Ni och tungsten/WO3. Scale-policy är fysisk och separat från price-key- och cost-benchmark-stöd. Ingen scale-policy får skapa en price key eller ekonomisk input.

## Grundregel

Tier scale ska vara fysisk och prisoberoende. Revenue kan användas som sanity check men ska inte definiera själva gränsen. Samma sammanhängande scale-window ska användas för alla produkter i ett projekt.

Produktbasis måste vara explicit:

- `U3O8` är inte samma quantity som elementärt U.
- saleable/usable iron ore product är inte samma quantity som contained Fe.
- `WO3`, contained W och tungsten concentrate tonnes är olika quantities.
- price-key-namn får aldrig användas som proxy för quantity semantics.

## Sammanfattad policy

| Commodity | Tier-1 fysisk gräns | Basis | Status |
|---|---:|---|---|
| Mo | **10,000 t/år** | payable Mo | **aktiv policy** |
| U3O8 | **5.0 Mlb/år** | recovered/payable U3O8 | **aktiv policy** |
| Iron ore | **25 Mt/år** | saleable/usable iron ore product | **research recommendation — ej aktiv** |
| Ni | **40,000 t/år** | contained/payable Ni | **aktiv befintlig policy** |
| WO3 | **2,000 t/år** | recovered/payable WO3 | **aktiv policy** |

## 1. Molybdenum — 10 kt payable Mo/år

**Aktiv Tier-policy:** `10,000 tonne payable Mo / year`.

Evidens:

- USGS Mineral Commodity Summaries 2026 uppskattar global molybdenum mine production 2025 till cirka **260,000 t Mo**.
- Freeport-McMoRan rapporterar att Climax producerade **24 Mlb Mo 2025**, cirka **10.9 kt Mo**, och har cirka **30 Mlb/år** kapacitet, cirka **13.6 kt/år**.
- Henderson har cirka **15 Mlb/år** kapacitet, cirka **6.8 kt/år**.
- 10 kt motsvarar cirka **3.8 %** av global 2025 mine production och ligger nära faktisk world-class primär Mo-skala.

Policylogik:

- 15–20 kt skulle göra Tier-1-gränsen hårdare än nästan alla existerande primära Mo-operationer.
- 3–5 kt skulle ge många stora men inte world-class Cu-Mo by-products ett för stort combined-scale-bidrag.
- 10 kt/år är därför en rimlig fysisk Tier-1-markör.

Källor:

- USGS MCS 2026: `https://pubs.usgs.gov/periodicals/mcs2026/mcs2026.pdf`
- Freeport-McMoRan 2025 10-K: `https://www.sec.gov/Archives/edgar/data/831259/000083125926000012/fcx-20251231.htm`

## 2. Uranium — 5.0 Mlb U3O8/år

**Aktiv Tier-policy:** `5.0 million lb recovered/payable U3O8 / year`.

Varför U3O8:

Uraniumgruvor och uraniumprissättning redovisas normalt i U3O8/concentrate-basis. Tier ska därför använda U3O8 där Project-rapporten gör det, inte tyst behandla quantity som elementärt U.

Global anchor:

- World Nuclear Association rapporterar 2024 global mine production som **60,213 tU = 71,006 t U3O8**.
- 5.0 Mlb U3O8 motsvarar cirka **1,923 tU** och cirka **3.2 %** av global 2024 mine production.

Mine-size anchor:

World Nuclear Association listar 2024 års tio största uraniumgruvor. Nr 10, Khorassan 1, producerade **2,030 tU**, vilket motsvarar cirka **5.28 Mlb U3O8**. En 5.0 Mlb-gräns ligger därför ungefär vid global **top-10 mine cutoff**.

Sanity checks:

- McArthur River/Key Lake: 2025 packaged production **15.1 Mlb U3O8**; licensed capacity **25 Mlb/år**.
- Cigar Lake: 2025 production **19.1 Mlb U3O8**; normal licensed annual level omkring **18 Mlb/år**.
- Inkai: 2025 production **8.4 Mlb U3O8**.

Bedömning:

**5.0 Mlb U3O8/år är starkt underbyggd som fysisk Tier-1-skalegräns och är nu aktiverad.**

Implementation guard:

- `U` och `U3O8` är separata exact product ids; `U` får inte träffa U3O8-policyn.
- tU och t U3O8 får inte blandas.
- Om source data anges i tU krävs explicit source-backed conversion innan quantity lagras som U3O8.
- Om Project redan anger lb U3O8 ska ingen ytterligare metallkonvertering göras.
- Scale-policyn får inte själv skapa eller inferera en price key. Den befintliga uranium-price stacken är en separat kontraktsfråga.

Källor:

- World Nuclear Association, World Uranium Mining Production: `https://world-nuclear.org/information-library/nuclear-fuel-cycle/mining-of-uranium/world-uranium-mining-production`
- Cameco 2025 Annual Report: `https://www.cameco.com/sites/default/files/documents/cameco-2025-annual-report.pdf`

## 3. Iron ore / Fe — 25 Mt saleable iron ore product/år

**Research recommendation — inte aktiv policy:** `25,000,000 tonne saleable/usable iron ore product / year`.

Viktig semantik:

Detta ska **inte** kodas som 25 Mt elementärt Fe. Iron ore-industrin och USGS rapporterar primärt usable/saleable iron ore product och redovisar iron content separat.

Global anchor:

- USGS MCS uppskattar global usable iron ore production till cirka **2.5 miljarder ton/år**.
- 25 Mt motsvarar ungefär **1 %** av global usable-ore production.

Mine/project anchors:

- Rio Tinto Gudai-Darri: **43 Mtpa** initial capacity, planerad mot **50 Mtpa**.
- Rio Tinto Brockman 4: **43 Mt** production 2024.
- Fortescue Eliwana: omkring **30 Mtpa** average production, infrastruktur för upp till 50 Mtpa.
- Rio/Baowu Western Range: **25 Mtpa** development/replacement project.

Bedömning:

**25 Mt saleable iron ore product/år är en rimlig Tier-1 storleksmarkör**, men den förblir research-only tills product-id/basis och policy aktiveras separat.

Implementation guard:

- Om Project endast har contained Fe får 25 Mt product-gränsen inte användas direkt.
- Conversion från contained Fe till saleable product kräver source-backed product grade/recovery/basis.
- Ingen implicit 62%-Fe-konvertering.

Källor:

- USGS Iron Ore, MCS: `https://pubs.usgs.gov/periodicals/mcs2025/mcs2025_ver.1.0.pdf`
- Rio Tinto Gudai-Darri: `https://www.riotinto.com/en/news/releases/2023/rio-tinto-to-increase-gudai-darri-iron-ore-mine-capacity-`
- Rio Tinto Brockman: `https://www.riotinto.com/en/news/releases/2025/rio-tinto-to-invest-1_8-billion-to-develop-brockman-mine-extension-in-western-australias-pilbara`
- Fortescue Eliwana development basis: `https://cdn.fortescue.com/docs/default-source/eliwana-iron-ore/appendix-1-eliwana-iron-ore-mine-project-final-approved-esd.pdf`

## 4. Nickel — behåll 40 kt Ni/år

**Aktiv befintlig Tier-policy:** `40,000 tonne contained/payable Ni / year`.

Ny kontroll:

- USGS uppskattar global nickel mine production 2025 till cirka **3.9 Mt Ni**.
- 40 kt motsvarar cirka **1.0 %** av global mine production.
- Vale rapporterar 2025 contained nickel production by ore source ungefär:
  - Sorowako **54.7 kt**,
  - Sudbury **35.3 kt**,
  - Voisey's Bay **33.1 kt**,
  - Onça Puma **26.1 kt**.

Detta visar att 40 kt skiljer ut en mycket stor nickeloperation utan att kräva ett helt integrated-company-system.

**Policy: behåll 40 kt Ni/år.**

Källor:

- USGS MCS 2026 Nickel: `https://pubs.usgs.gov/periodicals/mcs2026/mcs2026.pdf`
- Vale 2025 Form 20-F: `https://www.sec.gov/Archives/edgar/data/917851/000129281426001844/valeform20f_2025.htm`

## 5. Tungsten — 2,000 t recovered/payable WO3/år

**Aktiv Tier-policy:** `2,000 tonne recovered/payable WO3 / year`.

Alternativ industrienhet: **200,000 MTU WO3/år**, eftersom 1 MTU = 10 kg WO3.

Varför WO3:

Tungstenprojekt och offtake/prissättning uttrycks ofta i MTU WO3 och concentrate grade. USGS redovisar däremot world mine production i tonnes contained W. Dessa får inte blandas.

Sangdong Technical Report anger att **79.3 % av WO3 är W**. 2,000 t WO3 motsvarar därför cirka **1,586 t contained W**.

Global anchor:

- USGS MCS 2026 uppskattar global tungsten mine production 2025 till cirka **85,000 t contained W**.
- 2,000 t WO3 ≈1,586 t W ≈ **1.9 %** av global mine production.

Project anchors:

### Sangdong

- 2025 Technical Report: LOM recovered production **3,071,900 MTU**.
- Average recovered production **231,200 MTU/year**.
- Det motsvarar cirka **2,312 t recovered WO3/år**.
- Steady-state-år ligger huvudsakligen kring 2.2–2.6 kt recovered WO3/år.

### Pilot Mountain

- 2026 PFS: **15,916 t WO3** över 8 års mine life.
- Enkelt LOM-genomsnitt ≈ **1,990 t WO3/år**.

Bedömning:

En **2,000 t WO3/år**-gräns ligger praktiskt taget exakt vid storleken på två av de mest betydande västliga tungstenprojekten/operationerna och är nu aktiverad som fysisk Tier-1-markör.

Implementation guard:

- `W` och `WO3` är separata exact product ids; `W` får inte träffa WO3-policyn.
- WO3 tonnes, contained W tonnes, concentrate tonnes och MTU WO3 är separata quantity semantics.
- 65–67% WO3 concentrate tonnes får inte behandlas som recovered WO3 tonnes.
- Conversion från concentrate kräver explicit concentrate grade.
- **Ingen canonical WO3/tungsten-price key finns verifierad i nuvarande price stack; scale-aktiveringen får därför inte skapa någon sådan key.**

Källor:

- USGS MCS 2026 Tungsten: `https://pubs.usgs.gov/periodicals/mcs2026/mcs2026.pdf`
- Almonty Sangdong Technical Report 2025: `https://almonty.com/wp-content/uploads/2025/09/Sangdong_NI43_JORC_Tech_Rep_March25_v3.pdf`
- Guardian Metal Resources Pilot Mountain PFS summary: `https://guardianmetalresources.com/project/pilot-mountain-project/`

## 6. Implementation implications for Phase A

1. Product discovery är generisk och frikopplad från threshold registry.
2. Alla physical products visas i `Skala · produkt för produkt`.
3. Mo bidrar som `averageAnnualPayableMo / 10,000 t`.
4. Ni fortsätter bidra som `averageAnnualPayableNi / 40,000 t`.
5. U3O8 bidrar endast för exact product-id `U3O8` mot `5,000,000 lb/år`.
6. WO3 bidrar endast för exact product-id `WO3` mot `2,000 tonne/år`.
7. Iron ore förblir synligt men unscored tills separat policyacceptans och exact saleable-product basis finns.
8. Combined scale summerar endast threshold-enabled exact products.
9. Samma sammanhängande 10-årsfönster används för alla products.
10. Scale-policy får aldrig inferera price key eller cost benchmark.

## 7. Required regressions

- Mo syns och score:as för Vizcachitas, Berg, Warintza och Copper Creek.
- Mo 10 kt/år = 1.00x.
- Ni 40 kt/år = 1.00x och Zn 150 kt/år = 1.00x.
- U3O8 5.0 Mlb/år = 1.00x; `U` förblir unscored.
- WO3 2,000 t/år = 1.00x; `W` förblir unscored.
- Unsupported physical products syns men bidrar inte till combined scale.
- Fe/iron ore product-basis får inte konverteras implicit.
- Ingen ny scale commodity får automatiskt skapa eller gissa en price key.

## Policy status at handoff

- **Mo 10 kt/år:** aktiv policy och implementerad.
- **Ni 40 kt/år:** aktiv befintlig policy; research stödjer att den behålls.
- **Zn 150 kt/år:** aktiv befintlig policy och regressionslåst.
- **U3O8 5.0 Mlb/år:** aktiv policy och implementerad med exact-product guard.
- **Iron ore 25 Mtpa:** research recommendation; ännu inte aktiv policy.
- **WO3 2,000 t/år:** aktiv policy och implementerad med exact-product guard; ingen tungsten-price key har uppfunnits.
