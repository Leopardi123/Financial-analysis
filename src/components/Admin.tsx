import { useMemo, useState } from "react";

type LogEntry = {
  id: number;
  title: string;
  status: "loading" | "success" | "error";
  message: string;
};

const STATUS_LABELS: Record<LogEntry["status"], string> = {
  loading: "LOADING",
  success: "SUCCESS",
  error: "ERROR",
};

const DEFAULT_TICKERS = "AAPL, MSFT";

type MaterializationCursor = {
  statement: string;
  period: string;
  offset: number;
};

type RefreshPayload = {
  materialization?: {
    cursor: MaterializationCursor | null;
    done: boolean;
  };
};

type AdminProps = {
  onTickersUpserted?: () => void;
};

export default function Admin({ onTickersUpserted }: AdminProps) {
  const [secret, setSecret] = useState("");
  const [tickers, setTickers] = useState(DEFAULT_TICKERS);
  const [refreshTicker, setRefreshTicker] = useState("AAPL");
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [materializationCursor, setMaterializationCursor] = useState<MaterializationCursor | null>(null);
  const [materializationDone, setMaterializationDone] = useState(true);

  const secretReady = secret.trim().length > 0;

  const logByKey = useMemo(() => {
    return logEntries.reduce<Record<string, LogEntry>>((acc, entry) => {
      acc[entry.title] = entry;
      return acc;
    }, {});
  }, [logEntries]);

  function updateLog(title: string, status: LogEntry["status"], message: string) {
    setLogEntries((prev) => [
      {
        id: Date.now() + Math.random(),
        title,
        status,
        message,
      },
      ...prev,
    ].slice(0, 20));
  }

  async function postJson(title: string, url: string, body: Record<string, unknown>) {
    setLoadingKey(title);
    updateLog(title, "loading", "LOADING...");
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 45000);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": secret.trim(),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);
      const text = await response.text();
      let payload: unknown = text;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = text;
      }
      if (!response.ok) {
        console.error("Admin request failed", {
          title,
          status: response.status,
          statusText: response.statusText,
          payload,
        });
        updateLog(
          title,
          "error",
          `ERROR ${response.status}: ${response.statusText}\n${JSON.stringify(payload, null, 2)}`,
        );
        return;
      }
      updateLog(title, "success", `SUCCESS\n${JSON.stringify(payload, null, 2)}`);
      if (title === "Upsert Tickers") {
        onTickersUpserted?.();
      }
      return payload as RefreshPayload;
    } catch (error) {
      const message =
        (error as Error).name === "AbortError"
          ? "Request timed out. Try Continue materialization."
          : (error as Error).message;
      updateLog(title, "error", `ERROR\n${message}`);
    } finally {
      setLoadingKey(null);
    }
  }

  const initLog = logByKey["Init DB"];

  return (
    <div className="admin">
      <div className="admin-guidance">
        <h3 className="subrub small">Admin — så fungerar flödet</h3>
        <ul className="bread">
          <li>1) Lägg till ticker: skriv in tickers och kör “Upsert Tickers”. Detta sparar listan.</li>
          <li>2) Hämta data: kör “Refresh Ticker” för att ladda ned och materialisera data för en aktie.</li>
          <li>3) Fortsätt materialisering: om refresh avbryts, kör “Continue materialization”.</li>
          <li>4) “Fetch” i UI hämtar endast redan sparad data från DB — den laddar inte ner nya.</li>
          <li>5) Att välja ticker i UI byter bara visning; du måste “Refresh Ticker” om data saknas.</li>
        </ul>
        <p className="bread">
          CRON_SECRET krävs för admin‑åtgärder. Init DB skapar tabeller och index. Run Cron triggar
          den schemalagda uppdateringen.
        </p>
      </div>
      <div className="admin-grid">
        <div>
          <label htmlFor="cron-secret">CRON_SECRET</label>
          <input
            id="cron-secret"
            type="password"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            placeholder="CRON_SECRET"
          />
        </div>

        <div className="admin-actions">
          <div className="admin-row">
            <button
              type="button"
              onClick={() => void postJson("Init DB", "/api/admin/init-db", {})}
              disabled={!secretReady || loadingKey !== null}
            >
              {loadingKey === "Init DB" ? "Initializing..." : "Init DB"}
            </button>
            {initLog && (
              <span className={initLog.status === "error" ? "status error" : "status success"}>
                {initLog.status.toUpperCase()}
              </span>
            )}
          </div>

          <div>
            <label htmlFor="tickers">Tickers (comma-separated)</label>
            <input
              id="tickers"
              value={tickers}
              onChange={(event) => setTickers(event.target.value)}
            />
            <button
              type="button"
              onClick={() =>
                void postJson("Upsert Tickers", "/api/admin/companies", {
                  tickers: tickers
                    .split(",")
                    .map((ticker) => ticker.trim().toUpperCase())
                    .filter(Boolean),
                })
              }
              disabled={!secretReady || loadingKey !== null}
            >
              {loadingKey === "Upsert Tickers" ? "Upserting..." : "Upsert Tickers"}
            </button>
          </div>

          <div>
            <label htmlFor="refresh-ticker">Refresh ticker</label>
            <input
              id="refresh-ticker"
              value={refreshTicker}
              onChange={(event) => setRefreshTicker(event.target.value)}
            />
            <button
              type="button"
              onClick={() =>
                void postJson("Refresh Ticker", "/api/company/refresh", {
                  ticker: refreshTicker.trim().toUpperCase(),
                }).then((payload) => {
                  const materialization = payload?.materialization;
                  if (materialization) {
                    setMaterializationCursor(materialization.cursor ?? null);
                    setMaterializationDone(materialization.done);
                  }
                })
              }
              disabled={!secretReady || loadingKey !== null}
            >
              {loadingKey === "Refresh Ticker" ? "Refreshing..." : "Refresh Ticker"}
            </button>
            {!materializationDone && materializationCursor && (
              <button
                type="button"
                onClick={() =>
                  void postJson("Continue Materialization", "/api/company/refresh", {
                    ticker: refreshTicker.trim().toUpperCase(),
                    skipFetch: true,
                    cursor: materializationCursor,
                  }).then((payload) => {
                    const materialization = payload?.materialization;
                    if (materialization) {
                      setMaterializationCursor(materialization.cursor ?? null);
                      setMaterializationDone(materialization.done);
                    }
                  })
                }
                disabled={!secretReady || loadingKey !== null}
              >
                {loadingKey === "Continue Materialization" ? "Continuing..." : "Continue materialization"}
              </button>
            )}
          </div>

          <div>
            <button
              type="button"
              onClick={() => void postJson("Run Cron", "/api/cron/refresh", {})}
              disabled={!secretReady || loadingKey !== null}
            >
              {loadingKey === "Run Cron" ? "Running..." : "Run Cron"}
            </button>
          </div>
        </div>
      </div>

      <div className="log-panel">
        <h3>Logg</h3>
        {logEntries.length === 0 ? (
          <div className="status empty">No requests yet.</div>
        ) : (
          logEntries.map((entry) => (
            <div key={entry.id} className={`log-entry ${entry.status}`}>
              <div className="log-entry-header">
                <strong>{entry.title}</strong>
                <span className={`log-status ${entry.status}`}>
                  {STATUS_LABELS[entry.status]}
                </span>
              </div>
              <pre>{entry.message}</pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
