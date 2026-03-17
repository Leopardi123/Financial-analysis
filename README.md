# Financial Analysis System

## Environment Variables

These must be configured in Vercel (or your local environment):

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `FMP_API_KEY`
- `CRON_SECRET`
- `STOXX_HISTORICAL_ENDPOINT` (required for EA SX5E ingestion used by Safe Haven / Risk-Off overlay)
- `STOXX_HISTORICAL_API_KEY` (optional, if your STOXX endpoint requires auth)

## Setup Workflow

1. **Init DB**
   - In the **Single Stock Dashboard** section, enter `CRON_SECRET` in the Admin block.
   - Click **Init DB** to create tables and indexes.

2. **Upsert tickers**
   - Enter a comma-separated list of tickers.
   - Click **Upsert Tickers** to store them in Turso.

3. **Refresh a ticker**
   - Enter a ticker and click **Refresh Ticker**.
   - This fetches raw FMP reports and materializes data in chunks.
   - If the response indicates more work, click **Continue materialization** until done.

4. **Run cron**
   - Click **Run Cron** to trigger the nightly refresh logic manually.

## API Overview

- `POST /api/admin/init-db` — initialize schema (requires `x-cron-secret`).
- `POST /api/admin/companies` — upsert tickers (requires `x-cron-secret`).
- `POST /api/company/refresh` — fetch raw data + chunked materialization (requires `x-cron-secret`).
- `POST /api/cron/refresh` — nightly refresh routine (requires `x-cron-secret`).
- `GET /api/company` — read-only data from `financial_points_v2`.
## Local Development

- Install dependencies: `npm install`
- Start the app: `npm run dev`
- Run the automated test suite: `npm test`
- Build production assets: `npm run build`

