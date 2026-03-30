# Databassnål prisarkitektur för screeningdashboard

## Översikt

Prislagret är uppdelat i tre lager:

1. **Raw long-term history** i `daily_price_history` (canonical EOD per symbol och dag).
2. **Fast screening read model** i `price_screen_snapshot` (en rad per symbol, färdigräknade signaler).
3. **Framtida cycle layer** (designad men ej implementerad nu) som separat snapshot-tabell/pipeline.

Detta följer principen *lagra lång historik men läs kort arbetsfönster i standardflödet*.

---

## Tabeller

### `daily_price_history`
- Syfte: långsiktig EOD-historik för 5–10+ år.
- Constraint: `UNIQUE(symbol, price_date)`.
- Index:
  - `(symbol, price_date DESC)` för snabb senaste-X läsning per symbol.
  - `(price_date)` för tvärsnittsfrågor.

### `price_screen_snapshot`
- Syfte: snabb dashboard-läsning, en rad per symbol.
- Innehåller färdiga fält för:
  - return_5d / return_20d / return_60d
  - high_20d / high_60d
  - drawdown_20d / drawdown_60d
  - ma20 / ma50
  - trend_state / recovery_state
  - history_points_used

---

## Ingest- och write-strategi

Route: `POST /api/admin/refresh-price-screen`

1. Läs senaste lokala datum per symbol.
2. Hämta historik inkrementellt (med liten backfill-buffer för korrigeringar).
3. För varje `(symbol, date)`:
   - **INSERT** om saknas
   - **UPDATE** om ändrat
   - **ingen write** om oförändrat
4. Om symbolen ändrats: läs bara senaste ~120 rader från `daily_price_history`.
5. Beräkna snapshot för symbolen och skriv till `price_screen_snapshot` bara om snapshot faktiskt ändrats.

Det minimerar API-calls, writes och omräkningar.

---

## Läsväg för screeningdashboard

Route: `GET /api/screening/price-snapshot`

Standardvy ska läsa denna snapshot-tabell (ev. tillsammans med watchlist/company metadata), inte full historik.

Debugväg:
- `GET /api/screening/price-snapshot?symbol=XXX&debug=1`
- Returnerar snapshot + debuginfo (returdatum, history_points_used, null reasons, trend/recovery state).

---

## Graceful degradation

Om historik saknas sätts berörda fält till `NULL`:
- `return_5d` kräver minst 6 punkter
- `return_20d` kräver minst 21 punkter
- `return_60d` kräver minst 61 punkter
- `ma50` kräver minst 50 punkter
- drawdowns/highs kräver relevant window

`history_points_used` sparas alltid.

---

## Framtida sector/cycle layer (design, ej full implementation)

Lägg till separat tabell, t.ex. `price_cycle_snapshot` / `sector_cycle_snapshot`, med egen batch/pipeline för:
- 52-week high/low
- 200DMA
- fleråriga highs/lows och drawdowns
- bottoming/topping heuristics
- commodity/sector regime detection

Viktigt: denna pipeline ska läsa från `daily_price_history` men vara separat från screeningens lätta read path så dashboarden förblir snabb.

---

## Automation: nattjobb + auto-init från Single Stock Admin

### Nattjobb
- Cron-route: `GET/POST /api/cron/price-refresh`
- Kör inkrementell price engine för alla aktiva tickers.
- Flöde:
  1. markera tidigare `ready` som `stale`
  2. kör ingest/snapshot per ticker
  3. status uppdateras till `ready` eller `failed`
  4. enkel retry (1 extra försök) per ticker

### Auto-init vid ny ticker i Single Stock Admin
- Triggerpunkt: `POST /api/admin/companies` (ticker upsert).
- För nya tickers:
  1. status sätts `pending`
  2. price engine initieras för tickern
  3. status blir `ready` (med timestamps) eller `failed` (med feltext)

### Statusmodell
- Lagrad i `companies_v2`:
  - `price_data_status` (`pending` | `ready` | `failed` | `stale`)
  - `price_last_update_at`
  - `price_snapshot_at`
  - `price_last_error`
  - `price_init_requested_at`

Single Stock Admin kan läsa status via `POST /api/admin/price-status` och trigga retry via `POST /api/admin/refresh-price-screen`.
