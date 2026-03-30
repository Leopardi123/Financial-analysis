# Screening data flow och lagringsöversikt

## 1) Datakällor och ingest

### Fundamental ingest
- Route: `GET/POST /api/cron/refresh`
- Hämtar FMP statements och materialiserar till:
  - `financial_reports`
  - `financial_points_v2`
- Används senare av `/api/company?ticker=...`.

### Company universe ingest
- Route: `POST /api/admin/refresh-companies` eller `GET/POST /api/cron/refresh-companies`
- Uppdaterar bolagsmaster till:
  - `companies`
  - `companies_v2`

### Price screening ingest
- Route: `POST /api/admin/refresh-price-screen`
- Hämtar EOD-historik och skriver till:
  - `daily_price_history` (rå daglig historik)
  - `price_screen_snapshot` (en snapshot-rad per symbol)

## 2) Läsvägar för screening

- `GET /api/company/list`
  - Returnerar universe-symboler (nu union av `companies_v2`, `companies`, `price_screen_snapshot`).
- `GET /api/company?ticker=...`
  - Returnerar fundamentals från `financial_points_v2`.
- `GET /api/screening/price-snapshot?symbol=...`
  - Returnerar snapshot-fält för prisregler.

## 3) Varför screening kunde bli tom

Vanlig orsak:
- `company/list` byggde tidigare bara på `companies_v2 active=1`.
- Om `companies_v2` inte var uppdaterad kunde universe bli tomt trots att annan screeningdata fanns.

Ytterligare orsak:
- Price-screening kräver att `refresh-price-screen` körts; vanliga financial cron-runs fyller inte `price_screen_snapshot` automatiskt.

## 4) Fix som införts

- `company/list` använder nu union av:
  - `companies_v2.ticker`
  - `companies.symbol`
  - `price_screen_snapshot.symbol`
- `admin/refresh-price-screen` använder samma union när symboler inte skickas explicit.
- Screening-UI visar tydligt när universe är tomt och vad som behöver uppdateras.
