# Sector/Subsector/Company Mapping Inventory (pre-commodity-exposure implementation)

Date: 2026-04-01
Scope: full repo inventory of existing sector/subsector/company mapping logic without implementing new behavior.

## 1) Relevant files

### Canonical/static sector model (macro/UI-facing)
- `src/lib/macro/macroSectorUniverse.ts`
  - Static in-code universe for `main_sector`, `subsector`, and `macro_bucket` nodes.
  - Defines IDs, titles, aliases, parent-child structure, and asset-driver metadata.
  - Exposes `getSectorDashboardUniverse()` used directly by the Sector Dashboard selector.
  - Exposes `getSubsectorMacroRouting()` used for subsector→macro mapping/fallback behavior.
- `src/lib/macro/macroSectorMap.ts`
  - Separate static mapping layer (`ASSET_TO_SECTORS`) from macro asset map to sector candidates.
  - Normalizes candidates via `resolveCanonicalSectorTargets()` into canonical IDs from `macroSectorUniverse`.
- `src/lib/macro/macroAssetMap.ts`
  - Upstream macro bucket/asset classification that eventually feeds sector stance.
- `src/lib/macro/subsectorCoverageAudit.ts`
  - Static analysis over `macroSectorUniverse` + routing overrides; no DB reads.

### Frontend sector dashboard usage
- `src/components/SectorDashboard.tsx`
  - Builds dropdown sector/subsector options from `getSectorDashboardUniverse()` (static, in-memory).
  - Calls `/api/sector/overview`, `/api/sector/manual-input`, `/api/sector/map-companies`.
  - Contains hardcoded UI category options for company mapping (`Major`, `Producer`, `Junior developer`, etc.).
  - Uses macro routing/fallback logic (`getSubsectorMacroRouting`) for macro tags/lens filtering.

### DB schema and table definitions
- `api/_migrate.ts`
  - Defines tables: `sectors`, `subsectors`, `sector_metrics`, `sector_manual_inputs`, `cycle_scores`, `assumptions_log`, `company_sector_map`.
  - Defines uniqueness/indexes affecting lookup/upsert behavior.

### Sector endpoints (DB-backed)
- `src/server/routes/sector/overview.ts`
  - Ensures/creates sector + subsector rows from free-text query params.
  - Reads/writes sector metrics using `company_sector_map` membership.
- `src/server/routes/sector/manual-input.ts`
  - Ensures/creates sector + subsector rows from request params.
  - Writes/reads `sector_manual_inputs`.
- `src/server/routes/sector/map-companies.ts`
  - Ensures/creates sector + subsector rows from request params.
  - Inserts into `company_sector_map` with optional `category`.

### API wiring
- `api/index.ts`
  - Registers sector endpoints under `/api/sector/*`.

### Screening / single-stock usage (separate from sector tables)
- `src/components/ScreeningDashboard.tsx`
  - Sector filter in screening uses `/api/company/profile` (`profile.sector` from FMP), not `sectors/subsectors/company_sector_map`.
- `src/server/routes/company/profile.ts`
  - Returns raw FMP profile object, including provider-level `sector`/`industry` fields.
- `src/components/SingleStockDashboard.tsx`
  - Displays `profile?.sector` and `profile?.industry` from company profile payload.

---

## 2) A. Definitioner / datakällor

### A1) Var definieras sektor och undersektor idag i kod?

Det finns **två separata definitionsvärldar**:

1. **Statisk kodmodell (macro/UI model)**
   - Definieras i `macroSectorUniverse.sectors` med `category: main_sector | subsector | macro_bucket`.
   - Används för vad Sector Dashboard visar i dropdowns samt macro-routing.

2. **DB-modell (runtime-created taxonomy)**
   - Definieras av tabellerna `sectors` + `subsectors`.
   - Skapas/utökas dynamiskt via `ensureSector`/`ensureSubsector` i sektor-API-routes, baserat på inkommande text.

### A2) Finns det fler listor/enums/konstanter än `macroSectorUniverse.ts`?

Ja, flera:
- `ASSET_TO_SECTORS` i `macroSectorMap.ts` (egen kandidatlista med alias-liknande IDs).
- `explicitAliasTargets` i `macroSectorUniverse.ts` (separat alias→canonical target-expansion).
- `subsectorRoutingOverrides` i `macroSectorUniverse.ts` (subsector-specifik routing/fallback).
- `COMPANY_CATEGORIES` i `SectorDashboard.tsx` (UI-lista för mapping-kategori).

### A3) Finns separat struktur i screening eller single stock?

Ja:
- Screening sektorfilter använder `profile.sector` från `/api/company/profile` (FMP), dvs provider-taxonomi.
- Single Stock visar samma FMP-sector/industry.
- De använder **inte** `sectors/subsectors/company_sector_map`.

### A4) Är UI-listan hårdkodad eller hämtad från DB?

- Sector Dashboard sektor/undersektor-lista är hårdkodad via `getSectorDashboardUniverse()` från `macroSectorUniverse.ts`.
- Den hämtas **inte** från DB för selectorn.
- DB-lista kan hämtas via `/api/sector/overview` utan sektorparameter, men den används inte som primär selector-source i frontend.

---

## 3) B. Databas

### B1) Tabeller för sektorrelaterad data

I `_migrate.ts`:
- `sectors`
- `subsectors`
- `sector_metrics`
- `sector_manual_inputs`
- `cycle_scores`
- `assumptions_log`
- `company_sector_map`

### B2) Exakt schema (sammanfattning)

- `sectors(id PK AUTOINCREMENT, name UNIQUE NOT NULL, description, created_at NOT NULL)`
- `subsectors(id PK AUTOINCREMENT, sector_id NOT NULL, name NOT NULL, description, created_at NOT NULL, UNIQUE(sector_id, name))`
- `sector_metrics(id PK, sector_id NOT NULL, subsector_id NULL, metric NOT NULL, period, value, source, as_of NOT NULL)`
- `sector_manual_inputs(id PK, sector_id NOT NULL, subsector_id NULL, input_type NOT NULL, value NOT NULL, source, note, created_at NOT NULL)`
- `cycle_scores(id PK, sector_id NOT NULL, subsector_id NULL, score, phase, explanation_json, computed_at NOT NULL)`
- `assumptions_log(id PK, sector_id NOT NULL, subsector_id NULL, assumption NOT NULL, rationale, created_at NOT NULL)`
- `company_sector_map(company_id NOT NULL, sector_id NOT NULL, subsector_id NULL, category TEXT, created_at NOT NULL, UNIQUE(company_id, sector_id, subsector_id))`

### B3) Constraints/unikhetsregler/indexar

Viktigt för design:
- `sectors.name` är globalt unik.
- `subsectors` är unik per sektor via `UNIQUE(sector_id, name)`.
- `company_sector_map` unik per `(company_id, sector_id, subsector_id)`.
- Indexer:
  - `idx_subsectors_sector (sector_id)`
  - `idx_sector_metrics_sector (sector_id, subsector_id)`
  - `idx_sector_manual_inputs_sector (sector_id, subsector_id)`
  - `idx_cycle_scores_sector (sector_id, subsector_id)`
  - `idx_company_sector_map_sector (sector_id, subsector_id)`
  - `idx_company_sector_map_company (company_id)`

### B4) Migrationer/seed-logik för sectors/subsectors?

- Ingen seed med canonical sector/subsector-lista hittades.
- Istället “lazy create” i runtime via `INSERT OR IGNORE` i tre routes (`overview`, `manual-input`, `map-companies`).

---

## 4) C. Usage map (var sektor/undersektor används)

### Sector dashboard
- UI selector/source: statisk `macroSectorUniverse`.
- Overview-kort: `/api/sector/overview` (DB sectors/subsectors + company mappings + financial points).
- Manual inputs: `/api/sector/manual-input` (DB).
- Map companies: `/api/sector/map-companies` (DB write to `company_sector_map`).
- Macro tags/lens: macro universum + macro routing (statisk kod).

### Macro routing
- `getSubsectorMacroRouting()` i `macroSectorUniverse.ts` + overrides.
- Används i Sector Dashboard och i `subsectorCoverageAudit.ts`.

### Sector overview metrics
- `overview.ts` läser company IDs från `company_sector_map`, beräknar metrics från `financial_points_v2`, och skriver `sector_metrics`.

### Manual inputs
- `manual-input.ts` läser/skriver `sector_manual_inputs` scoped till sektor/subsektor.

### Cycle scores
- Tabell finns (`cycle_scores`) men ingen aktiv läsning/skrivning i routes/components hittades i inventeringen.

### Map companies
- `map-companies.ts` skriver `company_sector_map` (inklusive `category`).

### Screening
- Sektorfiltret använder FMP-profilens `profile.sector` via `/api/company/profile`.
- Ingen användning av `company_sector_map` i screening.

### Single stock
- Visar FMP `profile.sector`/`profile.industry`.
- Ingen användning av `company_sector_map`.

### API-routes
- `api/index.ts` exponerar `/api/sector/overview`, `/api/sector/manual-input`, `/api/sector/map-companies`, `/api/sector/global-macro`, `/api/sector/commodity-snapshot`.

### Batch-jobb/scripts
- Inga batch-jobb hittades som bygger/seedar `sectors/subsectors/company_sector_map`.
- Debug-script finns för macro/subsector-coverage audit (statisk model), inte DB-taxonomi.

---

## 5) D. `companySectorMap` (`company_sector_map`)

### D1) Vad betyder `category` i praktiken?

I praktiken idag: fri text från UI:s `COMPANY_CATEGORIES` i “Map companies”-kortet.

### D2) Var används den?

- Skrives i `map-companies.ts` vid insert.
- Ingen aktiv läsning som påverkar beslut/filtrering hittades.

### D3) Metadata eller logik?

- Idag endast metadata-liknande fält (lagras men används inte i beräkning/rendering i inventerad kod).

### D4) Tänkt company type (major/junior) eller annat?

- UI antyder “company type/stage-ish” etiketter (Major/Producer/Junior...), men backend validerar inte enum och använder inte värdet i logik.

### D5) Finns läsning av `category` i frontend/backend idag?

- Ingen läsning hittad i inventeringen (endast write path).

---

## 6) E. Source of truth idag

### E1) Vad är source of truth idag?

- **Vilka sektorer/undersektorer visas i Sector Dashboard selector:**
  - `macroSectorUniverse.ts` (statisk kod).
- **Vilka bolag hör till sektor/undersektor för sektor-metrics pipeline:**
  - `company_sector_map` (DB), ifylld manuellt via Map companies.
- **Vilken “sector” används i screening/single-stock:**
  - FMP `profile.sector` (extern provider-taxonomi via `/api/company/profile`).

### E2) Finns split-brain mellan statisk kod och DB?

Ja, tydligt.

### E3) Exakt hur split-brain ser ut

Minst tre parallella taxonomier samtidigt:
1. **Macro canonical static taxonomy** (`macroSectorUniverse`) för UI + macro routing.
2. **DB taxonomy** (`sectors/subsectors`) skapad dynamiskt från fria textsträngar i requests.
3. **Provider taxonomy** (FMP `profile.sector`/`industry`) i screening/single-stock.

Dessutom finns en fjärde semantisk yta:
4. **ASSET_TO_SECTORS candidate ids** i `macroSectorMap.ts` som först normaliseras till canonical ids.

---

## 7) F. Konkreta risker

1. **Statisk macro-model vs DB sectors/subsectors**
   - Risk för namn- och id-drift (t.ex. “Energy” i DB vs `energy` i static model).
   - DB använder namestringar; macro model använder stabila IDs.

2. **Manual mapping vs framtida commodity exposure mapping**
   - `company_sector_map` är manuell och fri-text-driven i ingress.
   - Ny commodity exposure riskerar duplicera denna mappning istället för att bygga ovanpå.

3. **`category` (major/junior) vs framtida stage taxonomy**
   - `category` är oreglerad text och används ej i logik.
   - Stor risk att införa ny producer/developer/explorer-klassificering parallellt istället för att konsolidera.

4. **Dashboard view IDs vs canonical commodity IDs**
   - Sector Dashboard binder commodity snapshot enbart för specifika `(sector, subsector)` kombinationer (ex. materials/gold_miners, materials/copper_miners).
   - Risk att “view logic ids” blir pseudo-canonical commodity mapping utan explicit modell.

5. **Screening/single-stock sektorfilter går på FMP-sector**
   - Screening-resultat kan avvika från sector dashboard mapping eftersom datakällan är annan taxonomy.

6. **Runtime creation av sectors/subsectors via API**
   - Stavfel/variationsrisk skapar nya DB-noder istället för att avvisa/normalisera.

---

## 8) G. Kort designrekommendation (utan implementation)

1. **Canonical source of truth framåt**
   - Välj en **canonical sektor/subsektor-dimension med stabila IDs** (inte bara namestringar).
   - Rekommendation: canonical ID-baserad taxonomy (kan utgå från `macroSectorUniverse` IDs) och låt DB tabeller referera dessa IDs explicit.

2. **View-layer only**
   - Macro lens/buckets/alias/fallbacks kan vara view/analytics-layer ovanpå canonical taxonomy.
   - UI labels/översättningar bör vara presentation, inte primär identitet.

3. **Migrera/döp om**
   - `company_sector_map.category` bör formaliseras (enum + tydlig semantik) eller bytas till explicit fältnamn (t.ex. `company_stage`/`company_role`) beroende på avsikt.
   - Undvik fortsatt fri-text skapande av sectors/subsectors; inför kontrollerad resolution mot canonical IDs.

4. **Undvik att bygga om parallellt**
   - Bygg inte separat commodity-exposure mapping-tabell med egen sektorhierarki innan nuvarande mapping harmoniserats.
   - Återanvänd/uppgradera `company_sector_map` (eller dess efterträdare) så att commodity exposure blir en dimension på samma canonical entity set.

---

## 9) Dependency/data-flow diagram (text)

```text
[macroSectorUniverse.ts (static canonical-like ids for UI/macro)]
        |-- getSectorDashboardUniverse() --> [SectorDashboard selector UI]
        |-- getSubsectorMacroRouting() ----> [SectorDashboard macro tag resolution]
        |-- resolveCanonicalSectorTargets() -> [macroSectorMap normalization]

[SectorDashboard UI]
   |-- POST /api/sector/map-companies --> [map-companies route]
   |                                       |-- ensureSector/ensureSubsector (DB upsert by name)
   |                                       `-- INSERT company_sector_map(company_id, sector_id, subsector_id, category)
   |
   |-- GET/POST /api/sector/manual-input -> [manual-input route]
   |                                       |-- ensureSector/ensureSubsector
   |                                       `-- read/write sector_manual_inputs
   |
   `-- GET /api/sector/overview ---------> [overview route]
                                           |-- ensureSector/ensureSubsector
                                           |-- read company_sector_map membership
                                           |-- compute from financial_points_v2
                                           `-- INSERT/SELECT sector_metrics

[ScreeningDashboard sector filter]
   `-- GET /api/company/profile?ticker=... --> [company/profile route -> FMP profile]
                                               `-- uses profile.sector (provider taxonomy)

[SingleStockDashboard company profile]
   `-- displays profile.sector/profile.industry from same FMP profile payload
```

---

## 10) Current name → source → purpose → should survive?

| Current name / structure | File / source | Purpose today | Should survive? |
|---|---|---|---|
| `macroSectorUniverse.sectors` | `src/lib/macro/macroSectorUniverse.ts` | Static sector/subsector/macro bucket model for UI + macro routing | **Yes** (as canonical ID set candidate) |
| `ASSET_TO_SECTORS` | `src/lib/macro/macroSectorMap.ts` | Macro asset → sector-candidate mapping | **Maybe** (keep but derive from canonical IDs only) |
| `explicitAliasTargets` | `src/lib/macro/macroSectorUniverse.ts` | Alias expansion into canonical targets | **Maybe** (view-layer normalization) |
| `sectors` table | DB (`api/_migrate.ts`) | Runtime sector registry by name | **Maybe/No** in current free-text form |
| `subsectors` table | DB (`api/_migrate.ts`) | Runtime subsector registry by name + sector FK | **Maybe/No** in current free-text form |
| `company_sector_map` | DB (`api/_migrate.ts`) | Manual company→sector/subsector mapping for overview metrics | **Yes** (but schema semantics should be hardened) |
| `company_sector_map.category` | DB + `SectorDashboard` | Optional label from UI, not used in logic | **Maybe** (rename + enum + explicit semantics) |
| FMP `profile.sector` | `/api/company/profile` payload | Screening/single-stock sector display/filter | **Yes** as external metadata, **No** as canonical internal taxonomy |

---

## 11) Slutsats

### Nuvarande canonical (de facto, per use-case)
- Sector Dashboard selector + macro routing: `macroSectorUniverse` (static code).
- Sector overview company membership: `company_sector_map` in DB.
- Screening/single-stock sector: FMP profile sector.

Det betyder att det inte finns **en** global canonical source idag; canonical är use-case-fragmenterad.

### Parallell struktur som måste bort
- Split-brain mellan:
  - static macro taxonomy,
  - runtime-created DB taxonomy,
  - FMP provider taxonomy.
- Plus otydlig `category`-semantik i company mapping.

### Safe next step before implementation
1. Besluta och dokumentera canonical ID taxonomy för sector/subsector.
2. Definiera mapping-policy mellan FMP-sector och canonical IDs.
3. Lås `company_sector_map` till canonical IDs (ej fri-text resolution).
4. Besluta explicit semantik för `category` innan commodity exposure-stage byggs.
5. Först därefter: implementera commodity exposure-struktur ovanpå samma canonical entities.
