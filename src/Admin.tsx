import { useMemo, useState } from "react";

type LogEntry = {
  id: number;
  title: string;
  status: "idle" | "loading" | "success" | "error";
  message: string;
};

const DEFAULT_TICKERS = "AAPL, MSFT";

type RefreshCursor = {
  statement: "income" | "balance" | "cashflow";
  period: "fy" | "q";
  offset: number;
};

export default function Admin() {
  const [secret, setSecret] = useState("");
  const [tickers, setTickers] = useState(DEFAULT_TICKERS);
  const [refreshTicker, setRefreshTicker] = useState("AAPL");
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [refreshCursor, setRefreshCursor] = useState<RefreshCursor | null>(null);
  const [refreshDone, setRefreshDone] = useState(false);

  const secretReady = secret.trim().length > 0;

  const logByKey = useMemo(() => {
    return logEntries.reduce<Record<string, LogEntry>>((acc, entry) => {
      acc[entry.title] = entry;
      return acc;
    }, {});
  }, [logEntries]);

  function updateLog(title: string, status: LogEntry["status"], message: string) {
    setLogEntries((prev) => {
      const entry: LogEntry = {
        id: Date.now() + Math.random(),
        title,
        status,
        message,
      };
      return [entry, ...prev].slice(0, 20);
    });
  }

  async function postJson(title: string, url: string, body: Record<string, unknown>) {
    setLoadingKey(title);
    updateLog(title, "loading", "Sending request...");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": secret.trim(),
        },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      let payload: unknown = text;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = text;
      }
      if (!response.ok) {
        updateLog(
          title,
          "error",
          `Error ${response.status}: ${response.statusText}\n${JSON.stringify(payload, null, 2)}`,
        );
        return { ok: false as const, payload };
      }
      updateLog(title, "success", JSON.stringify(payload, null, 2));
      return { ok: true as const, payload };
    } catch (error) {
      updateLog(title, "error", `Network error: ${(error as Error).message}`);
      return { ok: false as const, payload: { error: (error as Error).message } };
    } finally {
      setLoadingKey(null);
    }
  }

  function handleInitDb() {
    void postJson("Init DB", "/api/admin/init-db", {});
  }

  function handleUpsertTickers() {
    const list = tickers
      .split(",")
      .map((ticker) => ticker.trim().toUpperCase())
      .filter(Boolean);
    void postJson("Upsert Tickers", "/api/admin/companies", { tickers: list });
  }

  async function handleRefreshTicker(skipFetch = false) {
    const value = refreshTicker.trim().toUpperCase();
    if (!value) {
      updateLog("Refresh Ticker", "error", "Please provide a ticker.");
      return;
    }
    const response = await postJson("Refresh Ticker", "/api/company/refresh", {
      ticker: value,
      cursor: refreshCursor,
      skipFetch,
    });
    if (response?.ok) {
      const payload = response.payload as {
        materialization?: { cursor?: RefreshCursor | null; done?: boolean };
      };
      setRefreshCursor(payload.materialization?.cursor ?? null);
      setRefreshDone(Boolean(payload.materialization?.done));
    }
  }

  function handleRunCron() {
    void postJson("Run Cron", "/api/cron/refresh", {});
  }

  function handleRefreshCompanies() {
    void postJson("Refresh Companies", "/api/companies", {});
  }

  const initLog = logByKey["Init DB"];

  return (
    <div>
      <h1>Admin</h1>

      <label htmlFor="cron-secret">CRON_SECRET (required for admin actions)</label>
      <input
        id="cron-secret"
        type="password"
        placeholder="CRON_SECRET"
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
        style={{ display: "block", marginTop: 6, marginBottom: 12, minWidth: 280 }}
      />

      <div style={{ display: "grid", gap: 12, maxWidth: 520 }}>
        <div>
          <div style={{ fontSize: 12, color: "#555", marginBottom: 6 }}>
            Init DB creates or updates tables and indexes in Turso.
          </div>
          <button onClick={handleInitDb} disabled={!secretReady || loadingKey !== null}>
            {loadingKey === "Init DB" ? "Initializing..." : "Init DB"}
          </button>
          {initLog && (
            <span style={{ marginLeft: 12, color: initLog.status === "error" ? "crimson" : "green" }}>
              {initLog.status === "error" ? "Failed" : initLog.status === "success" ? "Success" : ""}
            </span>
          )}
        </div>

        <div>
          <label htmlFor="upsert-tickers">Tickers (comma-separated)</label>
          <div style={{ fontSize: 12, color: "#555", marginBottom: 6 }}>
            Upsert tickers adds them to the database so refresh can find a company ID.
          </div>
          <input
            id="upsert-tickers"
            value={tickers}
            onChange={(e) => setTickers(e.target.value)}
            style={{ display: "block", marginTop: 6, marginBottom: 8, minWidth: 280 }}
          />
          <button onClick={handleUpsertTickers} disabled={!secretReady || loadingKey !== null}>
            {loadingKey === "Upsert Tickers" ? "Upserting..." : "Upsert Tickers"}
          </button>
        </div>

        <div>
          <label htmlFor="refresh-ticker">Refresh ticker</label>
          <div style={{ fontSize: 12, color: "#555", marginBottom: 6 }}>
            Refresh fetches raw FMP reports and materializes them into points in small chunks.
          </div>
          <input
            id="refresh-ticker"
            value={refreshTicker}
            onChange={(e) => {
              setRefreshTicker(e.target.value);
              setRefreshCursor(null);
              setRefreshDone(false);
            }}
            style={{ display: "block", marginTop: 6, marginBottom: 8, minWidth: 280 }}
          />
          <button onClick={() => void handleRefreshTicker()} disabled={!secretReady || loadingKey !== null}>
            {loadingKey === "Refresh Ticker" ? "Refreshing..." : "Refresh Ticker"}
          </button>
          {!refreshDone && refreshCursor && (
            <button
              onClick={() => void handleRefreshTicker(true)}
              disabled={!secretReady || loadingKey !== null}
              style={{ marginLeft: 8 }}
            >
              {loadingKey === "Refresh Ticker" ? "Continuing..." : "Continue materialization"}
            </button>
          )}
        </div>

        <div>
          <div style={{ fontSize: 12, color: "#555", marginBottom: 6 }}>
            Refresh Companies populates the master companies table from FMP.
          </div>
          <button onClick={handleRefreshCompanies} disabled={!secretReady || loadingKey !== null}>
            {loadingKey === "Refresh Companies" ? "Refreshing..." : "Refresh Companies"}
          </button>
        </div>

        <div>
          <div style={{ fontSize: 12, color: "#555", marginBottom: 6 }}>
            Run cron triggers nightly refresh logic for stale companies.
          </div>
          <button onClick={handleRunCron} disabled={!secretReady || loadingKey !== null}>
            {loadingKey === "Run Cron" ? "Running..." : "Run Cron"}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <h2>Status</h2>
        <div
          style={{
            border: "1px solid #ccc",
            padding: 12,
            borderRadius: 6,
            background: "#fafafa",
            maxHeight: 240,
            overflowY: "auto",
            whiteSpace: "pre-wrap",
          }}
        >
          {logEntries.length === 0 ? (
            <div>No requests yet.</div>
          ) : (
            logEntries.map((entry) => (
              <div key={entry.id} style={{ marginBottom: 12 }}>
                <strong>{entry.title}</strong> - {entry.status.toUpperCase()}
                <div>{entry.message}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
