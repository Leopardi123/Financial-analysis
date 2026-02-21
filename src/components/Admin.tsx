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

type MaterializationProgress = {
  cursor: MaterializationCursor | null;
  done: boolean;
  progressUnit?: "rows" | "targets";
  rowsTotal?: number;
  rowsProcessedTotal?: number;
  rowsProcessedInRun?: number;
  targetsTotal?: number;
  targetsProcessedTotal?: number;
  targetsProcessedInRun?: number;
  inserted?: number;
  processedInRun?: number;
  processedTotal?: number;
  totalToProcess?: number;
  remaining?: number;
  currentOffset?: number;
  nextOffset?: number | null;
  statement?: string | null;
  period?: string | null;
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
    progressUnit?: "rows" | "targets";
    rowsTotal?: number;
    rowsProcessedTotal?: number;
    rowsProcessedInRun?: number;
    targetsTotal?: number;
    targetsProcessedTotal?: number;
    targetsProcessedInRun?: number;
    inserted?: number;
    processedInRun?: number;
    processedTotal?: number;
    totalToProcess?: number;
    remaining?: number;
    currentOffset?: number;
    nextOffset?: number | null;
    statement?: string | null;
    period?: string | null;
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
  const [tickerAutoStatus, setTickerAutoStatus] = useState<AutoRefreshStatus>("idle");
  const [tickerAutoMessage, setTickerAutoMessage] = useState("Not started.");
  const [tickerProcessedTotal, setTickerProcessedTotal] = useState(0);
  const [tickerTotalToProcess, setTickerTotalToProcess] = useState(0);
  const [tickerLastBatchProcessed, setTickerLastBatchProcessed] = useState(0);
  const [tickerCurrentOffset, setTickerCurrentOffset] = useState(0);
  const [tickerNextOffset, setTickerNextOffset] = useState<number | null>(null);
  const [tickerProgressUnit, setTickerProgressUnit] = useState<"rows" | "targets">("rows");
  const [tickerProgressPercentShown, setTickerProgressPercentShown] = useState(0);

  const autoRefreshRunningRef = useRef(false);
  const autoRefreshPausedRef = useRef(false);
  const companiesCursorOffsetRef = useRef<number>(0);
  const tickerAutoRunningRef = useRef(false);
  const tickerAutoPausedRef = useRef(false);
  const materializationCursorRef = useRef<MaterializationCursor | null>(null);

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
  const tickerProgressPercent = tickerProgressPercentShown;

  useEffect(() => {
    return () => {
      autoRefreshRunningRef.current = false;
      autoRefreshPausedRef.current = true;
      tickerAutoRunningRef.current = false;
      tickerAutoPausedRef.current = true;
    };
  }, []);

  function applyMaterialization(progress: MaterializationProgress) {
    if ("cursor" in progress) {
      setMaterializationCursor(progress.cursor ?? null);
      materializationCursorRef.current = progress.cursor ?? null;
    }
    setMaterializationDone(Boolean(progress.done));

    const unit = progress.progressUnit ?? tickerProgressUnit;
    setTickerProgressUnit(unit);

    const unitTotal = unit === "rows" ? progress.rowsTotal : progress.targetsTotal;
    const unitProcessedTotal = unit === "rows" ? progress.rowsProcessedTotal : progress.targetsProcessedTotal;
    const unitProcessedInRun = unit === "rows" ? progress.rowsProcessedInRun : progress.targetsProcessedInRun;

    const incomingTotal = Number(
      unitTotal ?? progress.totalToProcess ?? tickerTotalToProcess
    );
    const incomingProcessedTotal = Number(
      unitProcessedTotal ?? progress.processedTotal ?? tickerProcessedTotal
    );
    const incomingProcessedInRun = Number(
      unitProcessedInRun ?? progress.processedInRun ?? progress.inserted ?? tickerLastBatchProcessed
    );

    const currentOffset = Number(progress.currentOffset ?? progress.cursor?.offset ?? tickerCurrentOffset);
    const nextOffsetRaw = progress.nextOffset;
    const nextOffset = typeof nextOffsetRaw === "number"
      ? nextOffsetRaw
      : (progress.cursor?.offset ?? tickerNextOffset);

    setTickerTotalToProcess((prev) => Math.max(prev, Math.max(0, incomingTotal)));
    setTickerProcessedTotal((prev) => Math.max(prev, Math.max(0, incomingProcessedTotal)));
    setTickerLastBatchProcessed(Math.max(0, incomingProcessedInRun));
    setTickerCurrentOffset((prev) => Math.max(prev, Math.max(0, currentOffset)));
    setTickerNextOffset(progress.done ? null : nextOffset);

    const safeTotal = Math.max(0, incomingTotal);
    const safeProcessed = Math.max(0, incomingProcessedTotal);
    const incomingPercent = safeTotal > 0 ? Math.min(100, Math.round((safeProcessed / safeTotal) * 100)) : 0;
    setTickerProgressPercentShown((prev) => Math.max(prev, incomingPercent));
  }

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

  async function requestTickerRefreshBatch(skipFetch: boolean, retryAttempt = 0): Promise<RefreshPayload | null> {
    const ticker = refreshTicker.trim().toUpperCase();
    const title = skipFetch ? "Continue Materialization" : "Refresh Ticker";
    const payload = await postJson(title, "/api/company/refresh", {
      ticker,
      ...(skipFetch
        ? { skipFetch: true, cursor: materializationCursorRef.current }
        : {}),
    });

    if (payload?.materialization) {
      applyMaterialization(payload.materialization);
      const done = Boolean(payload.materialization.done);
      const processedTotal = Number(payload.materialization.processedTotal ?? payload.materialization.nextOffset ?? 0);
      const progressUnit = payload.materialization.progressUnit ?? tickerProgressUnit;
      const total = Number(
        (progressUnit === "rows" ? payload.materialization.rowsTotal : payload.materialization.targetsTotal)
        ?? payload.materialization.totalToProcess
        ?? 0
      );
      const processed = total > 0
        ? `${processedTotal} / ${total}`
        : `${processedTotal}`;
      setTickerAutoMessage(done ? "Materialization complete." : `Materializing ${progressUnit}: ${processed}`);
      return payload;
    }

    if (retryAttempt >= 3) {
      setTickerAutoStatus("error");
      setTickerAutoMessage("Auto ticker refresh paused after repeated errors. Click Resume to retry.");
      tickerAutoRunningRef.current = false;
      tickerAutoPausedRef.current = true;
      return null;
    }

    const backoffMs = 500 * (2 ** retryAttempt);
    setTickerAutoMessage(`Transient error, retrying in ${backoffMs}ms (attempt ${retryAttempt + 1}/3)...`);
    await sleep(backoffMs);
    return requestTickerRefreshBatch(skipFetch, retryAttempt + 1);
  }

  async function runTickerAutoFlow(reset: boolean) {
    if (tickerAutoRunningRef.current) {
      return;
    }

    const ticker = refreshTicker.trim().toUpperCase();
    if (!ticker) {
      setTickerAutoStatus("error");
      setTickerAutoMessage("Ticker is required.");
      return;
    }

    tickerAutoRunningRef.current = true;
    tickerAutoPausedRef.current = false;
    setTickerAutoStatus("running");
    setTickerAutoMessage(reset ? "Starting ticker refresh from scratch..." : "Resuming ticker materialization...");

    if (reset) {
      materializationCursorRef.current = null;
      setMaterializationCursor(null);
      setMaterializationDone(false);
      setTickerProcessedTotal(0);
      setTickerTotalToProcess(0);
      setTickerLastBatchProcessed(0);
      setTickerCurrentOffset(0);
      setTickerNextOffset(null);
      setTickerProgressPercentShown(0);
    }

    const firstResponse = await requestTickerRefreshBatch(!reset);
    if (!firstResponse?.materialization) {
      tickerAutoRunningRef.current = false;
      return;
    }

    if (firstResponse.materialization.done) {
      setTickerAutoStatus("done");
      setTickerAutoMessage("Ticker refresh + materialization complete.");
      tickerAutoRunningRef.current = false;
      tickerAutoPausedRef.current = false;
      return;
    }

    while (tickerAutoRunningRef.current) {
      if (tickerAutoPausedRef.current) {
        break;
      }

      const jitterMs = 200 + Math.floor(Math.random() * 301);
      await sleep(jitterMs);
      const payload = await requestTickerRefreshBatch(true);
      if (!payload?.materialization) {
        break;
      }
      if (payload.materialization.done) {
        setTickerAutoStatus("done");
        setTickerAutoMessage("Ticker refresh + materialization complete.");
        tickerAutoRunningRef.current = false;
        tickerAutoPausedRef.current = false;
        return;
      }
    }

    if (tickerAutoPausedRef.current) {
      setTickerAutoStatus("paused");
      setTickerAutoMessage("Paused by user.");
    }
    tickerAutoRunningRef.current = false;
  }

  function handlePauseTickerAutoFlow() {
    tickerAutoPausedRef.current = true;
    setTickerAutoStatus("paused");
    setTickerAutoMessage("Pausing after current ticker batch...");
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
                    applyMaterialization(materialization);
                  }
                })
              }
              disabled={!secretReady || loadingKey !== null || tickerAutoStatus === "running"}
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
                      applyMaterialization(materialization);
                    }
                  })
                }
                disabled={!secretReady || loadingKey !== null || tickerAutoStatus === "running"}
              >
                {loadingKey === "Continue Materialization" ? "Continuing..." : "Continue materialization"}
              </button>
            )}
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => void runTickerAutoFlow(true)}
                disabled={!secretReady || tickerAutoStatus === "running" || loadingKey !== null}
              >
                Start auto refresh ticker
              </button>
              <button
                type="button"
                onClick={handlePauseTickerAutoFlow}
                disabled={!secretReady || tickerAutoStatus !== "running"}
              >
                Pause
              </button>
              <button
                type="button"
                onClick={() => void runTickerAutoFlow(false)}
                disabled={!secretReady || (tickerAutoStatus !== "paused" && tickerAutoStatus !== "error") || loadingKey !== null}
              >
                Resume
              </button>
              <button
                type="button"
                onClick={() => void runTickerAutoFlow(true)}
                disabled={!secretReady || tickerAutoStatus === "running" || loadingKey !== null}
              >
                Reset
              </button>
            </div>
            <p className="bread">
              Ticker auto status: <strong>{tickerAutoStatus}</strong> — {tickerAutoMessage}
            </p>
            <p className="bread">
              Materializing {tickerProgressUnit}: {tickerProcessedTotal} of {tickerTotalToProcess || "?"} ({tickerProgressPercent}%)
            </p>
            <p className="bread">
              Last batch: +{tickerLastBatchProcessed} {tickerProgressUnit}
            </p>
            <p className="bread">
              Cursor ({tickerProgressUnit}): current {tickerCurrentOffset} · next {tickerNextOffset ?? "done"}
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
              aria-label="Ticker materialization progress"
            >
              <div
                style={{
                  width: `${tickerProgressPercent}%`,
                  height: "100%",
                  background: tickerAutoStatus === "error" ? "#b91c1c" : "#059669",
                  transition: "width 180ms ease",
                }}
              />
            </div>
            <p className="bread">{tickerProgressPercent}%</p>
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
