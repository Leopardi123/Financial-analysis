import { execute } from "../../../../api/_db.js";
import { tables } from "../../../../api/_migrate.js";

export type PriceDataStatus = "pending" | "ready" | "failed" | "stale";

export async function setPriceStatusPending(ticker: string) {
  await execute(
    `UPDATE ${tables.companiesV2}
     SET price_data_status = 'pending',
         price_init_requested_at = ?,
         price_last_error = NULL
     WHERE ticker = ?`,
    [new Date().toISOString(), ticker],
  );
}

export async function setPriceStatusReady(ticker: string, snapshotAt?: string | null) {
  await execute(
    `UPDATE ${tables.companiesV2}
     SET price_data_status = 'ready',
         price_last_update_at = ?,
         price_snapshot_at = COALESCE(?, price_snapshot_at),
         price_last_error = NULL
     WHERE ticker = ?`,
    [new Date().toISOString(), snapshotAt ?? null, ticker],
  );
}

export async function setPriceStatusFailed(ticker: string, errorMessage: string) {
  await execute(
    `UPDATE ${tables.companiesV2}
     SET price_data_status = 'failed',
         price_last_error = ?,
         price_last_update_at = ?
     WHERE ticker = ?`,
    [errorMessage.slice(0, 400), new Date().toISOString(), ticker],
  );
}

export async function markAllActiveAsStale() {
  await execute(
    `UPDATE ${tables.companiesV2}
     SET price_data_status = 'stale'
     WHERE active = 1 AND price_data_status = 'ready'`,
  );
}
