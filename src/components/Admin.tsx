import { useEffect, useMemo, useRef, useState } from "react";
import CompanyPicker from "./CompanyPicker";

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
  cursor?: {
    nextOffset: number | null;
    done: boolean;
    processedInRun: number;
    totalToProcess: number;
  };
  materialization?: {
    cursor: MaterializationCursor | null;
    done: boolean;
  };
};

type AdminProps = {
  onTickersUpserted?: () => void;
};

type AutoRefreshStatus = "idle" | "running" | "paused" | "done" | "error";

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export default function Admin({ onTickersUpserted }: AdminProps) {
  const [secret, setSecret] = useState("");
  const [tickers, setTickers] = useState(DEFAULT_TICKERS);
  const [refreshTicker, setRefreshTicker] = useState("AAPL");
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [materializationCursor, setMaterializationCursor] = useState<MaterializationCursor | null>(null);
  const [materializationDone, setMaterializationDone] = useState(true);
  const [companiesCursorOffset, setCompaniesCursorOffset] = useState<number | null>(null);
  const [companiesRefreshDone, setCompaniesRefreshDone] = useState(true);
  const [companiesProcessedTotal, setCompaniesProcessedTotal] = useState(0);
  const [companiesTotalToProcess, setCompaniesTotalToProcess] = useState(0);
  const [companiesLastBatchProcessed, setCompaniesLastBatchProcessed] = useState(0);
  const [companiesNextOffset, setCompaniesNextOffset] = useState<number | null>(null);
  const [autoRefreshStatus, setAutoRefreshStatus] = useState<AutoRefreshStatus>("idle");
  const [autoRefreshMessage, setAutoRefreshMessage] = useState("Not started.");

  const autoRefreshRunningRef = useRef(false);
  const autoRefreshPausedRef = useRef(false);
  const companiesCursorOffsetRef = useRef<number>(0);

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
          "x-admin-secret": secret.trim(),
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



  function appendTicker(symbol: string) {
    const normalized = symbol.trim().toUpperCase();
    if (!normalized) {
      return;
    }
    setTickers((prev) => {
      const list = prev
        .split(",")
        .map((ticker) => ticker.trim().toUpperCase())
        .filter(Boolean);
      if (!list.includes(normalized)) {
        list.push(normalized);
      }
      return list.join(", ");
    });
    setRefreshTicker(normalized);
  }

  const initLog = logByKey["Init DB"];
  const companiesProgressPercent = companiesTotalToProcess > 0
    ? Math.min(100, Math.round((companiesProcessedTotal / companiesTotalToProcess) * 100))
    : 0;

  useEffect(() => {
    return () => {
      autoRefreshRunningRef.current = false;
      autoRefreshPausedRef.current = true;
    };
  }, []);

  function applyCursor(cursor: NonNullable<RefreshPayload["cursor"]>) {
    const nextOffset = cursor.nextOffset;
    const inferredProcessedTotal = nextOffset ?? cursor.totalToProcess;
    setCompaniesCursorOffset(nextOffset);
    companiesCursorOffsetRef.current = nextOffset ?? cursor.totalToProcess;
    setCompaniesNextOffset(nextOffset);
    setCompaniesRefreshDone(cursor.done);
    setCompaniesLastBatchProcessed(cursor.processedInRun);
    setCompaniesTotalToProcess(cursor.totalToProcess);
    setCompaniesProcessedTotal(Math.max(0, inferredProcessedTotal));
  }

  async function requestCompaniesBatch(reset: boolean, retryAttempt = 0): Promise<RefreshPayload | null> {
    const baseOffset = reset ? 0 : companiesCursorOffsetRef.current;
    const title = reset ? "Refresh Companies" : "Continue Companies Refresh";
    const payload = await postJson(title, "/api/companies", reset
      ? { cursorOffset: 0, reset: true }
      : { cursorOffset: baseOffset });

    if (payload?.cursor) {
      applyCursor(payload.cursor);
      setAutoRefreshMessage(
        `Processed ${payload.cursor.nextOffset ?? payload.cursor.totalToProcess} / ${payload.cursor.totalToProcess}`
      );
      return payload;
    }

    if (retryAttempt >= 3) {
      setAutoRefreshStatus("error");
      setAutoRefreshMessage("Auto refresh paused after repeated errors. Click Resume to retry.");
      autoRefreshRunningRef.current = false;
      autoRefreshPausedRef.current = true;
      return null;
    }

    const backoffMs = 500 * (2 ** retryAttempt);
    setAutoRefreshMessage(`Transient error, retrying in ${backoffMs}ms (attempt ${retryAttempt + 1}/3)...`);
    await sleep(backoffMs);
    return requestCompaniesBatch(reset, retryAttempt + 1);
  }

  async function runAutoRefresh(reset: boolean) {
    if (autoRefreshRunningRef.current) {
      return;
    }

    autoRefreshRunningRef.current = true;
    autoRefreshPausedRef.current = false;
    setAutoRefreshStatus("running");
    setAutoRefreshMessage(reset ? "Starting from scratch..." : "Resuming from saved cursor...");

    if (reset) {
      setCompaniesProcessedTotal(0);
      setCompaniesTotalToProcess(0);
      setCompaniesLastBatchProcessed(0);
      setCompaniesCursorOffset(0);
      companiesCursorOffsetRef.current = 0;
      setCompaniesNextOffset(0);
      setCompaniesRefreshDone(false);
    }

    let nextReset = reset;

    while (autoRefreshRunningRef.current) {
      if (autoRefreshPausedRef.current) {
        break;
      }

      const payload = await requestCompaniesBatch(nextReset);
      nextReset = false;
      if (!payload || !payload.cursor) {
        break;
      }

      if (payload.cursor.done) {
        setAutoRefreshStatus("done");
        setAutoRefreshMessage("Completed successfully.");
        autoRefreshRunningRef.current = false;
        autoRefreshPausedRef.current = false;
        return;
      }

      const jitterMs = 200 + Math.floor(Math.random() * 301);
      await sleep(jitterMs);
    }

    if (autoRefreshPausedRef.current) {
      setAutoRefreshStatus("paused");
      setAutoRefreshMessage("Paused by user.");
    }
    autoRefreshRunningRef.current = false;
  }

  function handlePauseAutoRefresh() {
    autoRefreshPausedRef.current = true;
    setAutoRefreshStatus("paused");
    setAutoRefreshMessage("Pausing after current batch...");
  }

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
            <button
              type="button"
              onClick={() =>
                void postJson("Refresh Companies", "/api/companies", {
                  cursorOffset: 0,
                  reset: true,
                }).then((payload) => {
                  const cursor = payload?.cursor;
                  if (cursor) {
                    applyCursor(cursor);
                  }
                })
              }
              disabled={!secretReady || loadingKey !== null || autoRefreshStatus === "running"}
            >
              {loadingKey === "Refresh Companies" ? "Refreshing list..." : "Refresh Companies"}
            </button>
            {!companiesRefreshDone && companiesCursorOffset !== null && (
              <button
                type="button"
                onClick={() =>
                  void postJson("Continue Companies Refresh", "/api/companies", {
                    cursorOffset: companiesCursorOffset,
                  }).then((payload) => {
                    const cursor = payload?.cursor;
                    if (cursor) {
                      applyCursor(cursor);
                    }
                  })
                }
                disabled={!secretReady || loadingKey !== null || autoRefreshStatus === "running"}
              >
                {loadingKey === "Continue Companies Refresh" ? "Continuing list refresh..." : "Continue companies refresh"}
              </button>
            )}
            <button
              type="button"
              onClick={() => void runAutoRefresh(false)}
              disabled={!secretReady || autoRefreshStatus === "running" || loadingKey !== null}
            >
              Start auto refresh
            </button>
            <button
              type="button"
              onClick={handlePauseAutoRefresh}
              disabled={!secretReady || autoRefreshStatus !== "running"}
            >
              Pause
            </button>
            <button
              type="button"
              onClick={() => void runAutoRefresh(false)}
              disabled={!secretReady || (autoRefreshStatus !== "paused" && autoRefreshStatus !== "error") || loadingKey !== null}
            >
              Resume
            </button>
            <button
              type="button"
              onClick={() => void runAutoRefresh(true)}
              disabled={!secretReady || autoRefreshStatus === "running" || loadingKey !== null}
            >
              Reset
            </button>
            {initLog && (
              <span className={initLog.status === "error" ? "status error" : "status success"}>
                {initLog.status.toUpperCase()}
              </span>
            )}
          </div>

          <div>
            <p className="bread">
              Auto refresh status: <strong>{autoRefreshStatus}</strong> — {autoRefreshMessage}
            </p>
            <p className="bread">
              Processed {companiesProcessedTotal} of {companiesTotalToProcess || "?"} · Last batch {companiesLastBatchProcessed}
            </p>
            <p className="bread">
              Current cursorOffset: {companiesCursorOffset ?? 0} · Next offset: {companiesNextOffset ?? "done"}
            </p>
            <div
              style={{
                width: "100%",
                maxWidth: 520,
                height: 12,
                borderRadius: 8,
                background: "#e5e7eb",
                overflow: "hidden",
              }}
              aria-label="Companies refresh progress"
            >
              <div
                style={{
                  width: `${companiesProgressPercent}%`,
                  height: "100%",
                  background: autoRefreshStatus === "error" ? "#b91c1c" : "#2563eb",
                  transition: "width 180ms ease",
                }}
              />
            </div>
            <p className="bread">{companiesProgressPercent}%</p>
          </div>

          <div>
            <CompanyPicker
              label="Lägg till bolag via namn"
              placeholder="T.ex. Microsoft"
              onSelect={(company) => appendTicker(company.symbol)}
            />
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
