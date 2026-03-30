# Runbook: fyll `daily_price_history` och `price_screen_snapshot`

## Faktisk kodväg

- Schema/tabeller skapas i: `api/_migrate.ts` (`ensureSchema`).
- Pris-ingest + snapshot per symbol: `ingestDailyPricesAndRefreshSnapshot` i `src/lib/prices/screening/ingest.ts`.
- Bulk-ingest för många tickers: `ingestManySymbols` i `src/lib/prices/screening/ingest.ts`.
- Snapshot-beräkning: `computePriceScreenSnapshot` i `src/lib/prices/screening/snapshotEngine.ts`.
- Manuell admin refresh alla/valda tickers: `POST /api/admin/refresh-price-screen` (`src/server/routes/admin/refresh-price-screen.ts`).
- Enskild ticker refresh (fundamentals + price): `POST /api/company/refresh` (`src/server/routes/company/refresh.ts`, `priceRefresh` i response).
- Nattlig cron: `GET/POST /api/cron/refresh` (`src/server/routes/cron/refresh.ts`) som nu även kör begränsad price refresh för bearbetade tickers.

## Exakt operationell ordning (första init)

1. **Init DB**
   - Kör: `POST /api/admin/init-db`.
2. **Upsert tickers**
   - Kör: `POST /api/admin/companies` med tickerlista.
3. **Ladda fundamentals + materialisera för en ticker (valfritt men rekommenderat)**
   - Kör: `POST /api/company/refresh` med `{ "ticker": "AAPL" }`.
   - Samma anrop triggar nu även `priceRefresh` för tickern om `includePrice !== false`.
4. **Fyll prisdata för alla aktiva tickers**
   - Kör: `POST /api/admin/refresh-price-screen` (utan `symbols`) för alla aktiva.
   - Alternativt enskilda: `{ "symbols": ["AAPL","MSFT"] }`.
5. **Verifiera data i tabeller**
   - `daily_price_history` ska ha rader per symbol/datum.
   - `price_screen_snapshot` ska ha max en rad per symbol.
6. **Kör screening**
   - Screening läser `price_screen_snapshot` via `/api/screening/price-snapshot`.

## Inkrementell drift

- Nattlig cron i `vercel.json` kallar `/api/cron/refresh`.
- Den uppdaterar financials/materialization och försöker därefter pris-refresh för en begränsad tickerbatch.
- För full pris-refresh (alla aktiva), kör explicit: `POST /api/admin/refresh-price-screen`.

## Verifierbar feedback från endpoint

`POST /api/admin/refresh-price-screen` returnerar:
- `total`
- `succeeded`
- `failed`
- `changedSymbols`
- `writtenDailyRows`
- `snapshotWrites`
- `failures[]` med `symbol` + `error`

`POST /api/company/refresh` returnerar nu `priceRefresh`:
- `attempted`
- `ok`
- `inserted`
- `updated`
- `unchanged`
- `snapshotUpdated`
- `error` vid fel
