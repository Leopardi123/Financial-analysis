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
  nextCursor?: MaterializationCursor | null;
  done: boolean;
  progressUnit?: "rows" | "targets";
  targetIndexGlobal?: number;
  targetsTotal?: number;
  targetsProcessedTotal?: number;
  targetsProcessedInRun?: number;
  rowsWrittenInRun?: number;
  rowsWrittenInRunAttempted?: number;
  inserted?: number;
  processedInRun?: number;
  processedTotal?: number;
  totalToProcess?: number;
  remaining?: number;
  remainingTargets?: number;
  localOffsetCurrent?: number;
  localOffsetNext?: number | null;
  currentOffset?: number;
  nextOffset?: number | null;
  statement?: string | null;
  period?: string | null;
};

type RefreshPayload = {
  __error?: string;
  total?: number;
  succeeded?: number;
  failed?: number;
  changedSymbols?: number;
  writtenDailyRows?: number;
  snapshotWrites?: number;
  remaining?: number;
  nextOffset?: number | null;
  cursor?: {
    offset?: number;
    nextOffset: number | null;
    done: boolean;
    processedInRun: number;
    totalToProcess: number;
    remaining?: number;
    batchSize?: number;
  };
  materialization?: {
    cursor: MaterializationCursor | null;
    nextCursor?: MaterializationCursor | null;
    done: boolean;
    progressUnit?: "rows" | "targets";
    targetIndexGlobal?: number;
    targetsTotal?: number;
    targetsProcessedTotal?: number;
    targetsProcessedInRun?: number;
    rowsWrittenInRun?: number;
    rowsWrittenInRunAttempted?: number;
    inserted?: number;
    processedInRun?: number;
    processedTotal?: number;
    totalToProcess?: number;
    remaining?: number;
    remainingTargets?: number;
    localOffsetCurrent?: number;
    localOffsetNext?: number | null;
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

type PriceIngestResult = {
  ok?: boolean;
  status?: "success" | "partial_success" | "error";
  total?: number;
  succeeded?: number;
  failed?: number;
  changedSymbols?: number;
  writtenDailyRows?: number;
  unchangedDailyRows?: number;
  snapshotWrites?: number;
  results?: Array<{ symbol?: string } & Record<string, unknown>>;
  failures?: Array<{ symbol?: string; classification?: string; stage?: string; error?: string } & Record<string, unknown>>;
  error?: string;
  debug?: ScreeningDebugPayload;
};

type ScreeningDebugStep = {
  key: string;
  label: string;
  status: "pending" | "running" | "success" | "skipped" | "failed";
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  details?: Record<string, unknown>;
  error?: { message?: string } | null;
};

type ScreeningDebugPayload = {
  steps?: ScreeningDebugStep[];
  lastCompletedStep?: string | null;
  lastStartedStep?: string | null;
  currentStage?: string | null;
  failedStep?: string | null;
  timeoutStage?: string | null;
  requestStartedAt?: string;
  requestEndedAt?: string;
  durationMs?: number;
};

type ScreeningAttempt = {
  attemptId: string;
  startedAt: string;
  endedAt?: string;
  offset: number;
  batchSize: number;
  status: "running" | "success" | "failed" | "timeout";
  error?: string;
  debug: ScreeningDebugPayload;
};

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
  const [priceIngestResult, setPriceIngestResult] = useState<PriceIngestResult | null>(null);
  const [screeningOffset, setScreeningOffset] = useState(0);
  const [screeningRemaining, setScreeningRemaining] = useState<number | null>(null);
  const [screeningTotal, setScreeningTotal] = useState<number | null>(null);
  const [screeningStatus, setScreeningStatus] = useState<AutoRefreshStatus>("idle");
  const [screeningMessage, setScreeningMessage] = useState("Not started.");
  const [screeningDebugOpen, setScreeningDebugOpen] = useState(false);
  const [screeningDebug, setScreeningDebug] = useState<ScreeningDebugPayload | null>(null);
  const [screeningAttempts, setScreeningAttempts] = useState<ScreeningAttempt[]>([]);
  const [latestSuccessAttemptId, setLatestSuccessAttemptId] = useState<string | null>(null);
  const [materializationCursor, setMaterializationCursor] = useState<MaterializationCursor | null>(null);
  const [materializationDisplayCursor, setMaterializationDisplayCursor] = useState<MaterializationCursor | null>(null);
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
  const [tickerLastBatchRowsWritten, setTickerLastBatchRowsWritten] = useState(0);
  const [tickerRowsWrittenTotal, setTickerRowsWrittenTotal] = useState(0);
  const [tickerCurrentOffset, setTickerCurrentOffset] = useState(0);
  const [tickerNextOffset, setTickerNextOffset] = useState<number | null>(null);
  const [tickerProgressUnit, setTickerProgressUnit] = useState<"rows" | "targets">("targets");
  const [tickerProgressPercentShown, setTickerProgressPercentShown] = useState(0);
  const [debugParamEnabled, setDebugParamEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("admin.debugParamEnabled") === "1";
  });

  const autoRefreshRunningRef = useRef(false);
  const autoRefreshPausedRef = useRef(false);
  const companiesCursorOffsetRef = useRef<number>(0);
  const tickerAutoRunningRef = useRef(false);
  const tickerAutoPausedRef = useRef(false);
  const screeningAutoRunningRef = useRef(false);
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

  function getStepBadge(status: ScreeningDebugStep["status"]) {
    if (status === "success") return "✅";
    if (status === "failed") return "❌";
    if (status === "running") return "⏳";
    if (status === "skipped") return "⏭";
    return "•";
  }

  function withAdminQuery(url: string): string {
    if (!debugParamEnabled || typeof window === "undefined") {
      return url;
    }
    const asUrl = new URL(url, window.location.origin);
    asUrl.searchParams.set("debug", "1");
    return `${asUrl.pathname}${asUrl.search}`;
  }

  async function postJson(title: string, url: string, body: Record<string, unknown>) {
    setLoadingKey(title);
    updateLog(title, "loading", "LOADING...");
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 45000);
      const response = await fetch(withAdminQuery(url), {
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
        const payloadObject = typeof payload === "string" ? null : (payload as Record<string, unknown> | null);
        const authReason = typeof payloadObject?.authReason === "string" ? payloadObject.authReason : null;
        let friendlyError: string | null = null;
        if (response.status === 401) {
          if (!secret.trim()) {
            friendlyError = "Missing CRON_SECRET in admin input.";
          } else if (authReason === "missing_server_secret") {
            friendlyError = "Missing CRON_SECRET/ADMIN_SECRET on server.";
          } else {
            friendlyError = "Secret mismatch. Provided secret does not match server CRON_SECRET/ADMIN_SECRET.";
          }
        }
        const errorMessage = friendlyError
          ? `ERROR ${response.status}: ${friendlyError}`
          : `ERROR ${response.status}: ${response.statusText} — ${typeof payload === "string" ? payload : JSON.stringify(payload)}`;
        console.error("Admin request failed", {
          title,
          status: response.status,
          statusText: response.statusText,
          payload,
        });
        updateLog(
          title,
          "error",
          friendlyError
            ? `ERROR ${response.status}: ${friendlyError}\n${JSON.stringify(payload, null, 2)}`
            : `ERROR ${response.status}: ${response.statusText}\n${JSON.stringify(payload, null, 2)}`,
        );
        return { __error: errorMessage } as RefreshPayload;
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
      return { __error: message } as RefreshPayload;
    } finally {
      setLoadingKey(null);
    }
  }

  function startScreeningAttempt(offset: number, batchSize: number) {
    const now = new Date().toISOString();
    const attemptId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const initialDebug: ScreeningDebugPayload = {
      lastCompletedStep: null,
      lastStartedStep: "resolve_targets",
      currentStage: "resolve_targets",
      requestStartedAt: now,
      steps: [
        { key: "request_started", label: "Request started", status: "running", startedAt: now, details: { offset, batchSize } },
        { key: "resolve_targets", label: "Resolve targets", status: "running", startedAt: now, details: { offset, batchSize } },
        { key: "load_symbols_batch", label: "Load symbols / batch", status: "pending" },
        { key: "fetch_price_data", label: "Fetch price data", status: "pending" },
        { key: "write_daily_history", label: "Write daily_price_history", status: "pending" },
        { key: "compute_snapshot", label: "Compute price_screen_snapshot", status: "pending" },
      ],
    };
    const attempt: ScreeningAttempt = { attemptId, startedAt: now, offset, batchSize, status: "running", debug: initialDebug };
    setScreeningAttempts((prev) => [attempt, ...prev].slice(0, 30));
    setScreeningDebug(initialDebug);
    return { attemptId, initialDebug };
  }

  function patchScreeningAttempt(attemptId: string, patch: Partial<ScreeningAttempt>) {
    setScreeningAttempts((prev) => prev.map((item) => item.attemptId === attemptId ? { ...item, ...patch } : item));
  }

  async function runScreeningPriceIngest(offset = screeningOffset) {
    const normalBatchSize = 3;
    setScreeningStatus("running");
    setScreeningMessage(`Running batch from offset ${offset}...`);
    const { attemptId, initialDebug } = startScreeningAttempt(offset, normalBatchSize);
    const payload = await postJson("Refresh Screening Price Data", "/api/admin/refresh-price-screen", {
      offset,
      batchSize: normalBatchSize,
    });
    if (payload?.__error) {
      setPriceIngestResult({ ok: false, error: payload.__error });
      setScreeningStatus("error");
      const endedAt = new Date().toISOString();
      const timeoutMessage = payload.__error.includes("timed out")
        ? `Timed out before first symbol was selected. No symbols processed in this attempt. Timed out during target resolution/query setup; load_symbols_batch, fetch, save and snapshot did not start. Continue will retry from offset ${offset} with batch size ${normalBatchSize}.`
        : payload.__error;
      setScreeningMessage(timeoutMessage);
      patchScreeningAttempt(attemptId, {
        endedAt,
        status: payload.__error.includes("timed out") ? "timeout" : "failed",
        error: payload.__error,
        debug: { ...initialDebug, requestEndedAt: endedAt },
      });
      setScreeningDebug({ ...initialDebug, requestEndedAt: endedAt });
      setScreeningDebugOpen(true);
      return;
    }
    const cursor = payload?.cursor;
    const nextResult = payload as unknown as PriceIngestResult;
    setPriceIngestResult(nextResult);
    const resolvedDebug = nextResult.debug ?? initialDebug;
    setScreeningDebug(resolvedDebug);
    const endedAt = new Date().toISOString();
    patchScreeningAttempt(attemptId, {
      endedAt,
      status: cursor?.done ? "success" : "running",
      debug: resolvedDebug,
    });
    if (cursor?.done) {
      setLatestSuccessAttemptId(attemptId);
    }
    if (cursor) {
      setScreeningOffset(cursor.nextOffset ?? 0);
      setScreeningRemaining(cursor.remaining ?? null);
      setScreeningTotal(cursor.totalToProcess);
      setScreeningStatus(cursor.done ? "done" : "running");
      setScreeningMessage(
        cursor.done
          ? `Completed ${cursor.totalToProcess}/${cursor.totalToProcess}.`
          : `Processed batch ${cursor.processedInRun}. Next offset ${cursor.nextOffset}. Remaining ${cursor.remaining ?? "?"}.`
      );
      setScreeningDebugOpen(!cursor.done);
    } else {
      setScreeningStatus("error");
      setScreeningMessage("Missing cursor in response.");
      setScreeningDebugOpen(true);
    }
  }

  function pauseScreeningRefresh() {
    screeningAutoRunningRef.current = false;
    setScreeningStatus("paused");
    setScreeningMessage("Paused. Current batch will not continue.");
  }

  function resetScreeningProgress() {
    screeningAutoRunningRef.current = false;
    setScreeningOffset(0);
    setScreeningRemaining(null);
    setScreeningTotal(null);
    setScreeningStatus("idle");
    setScreeningMessage("Reset. Ready to run from offset 0.");
    setPriceIngestResult(null);
    setScreeningDebug(null);
    setScreeningDebugOpen(false);
    setScreeningAttempts([]);
    setLatestSuccessAttemptId(null);
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
  const latestAttempt = screeningAttempts[0] ?? null;
  const latestSuccessAttempt = latestSuccessAttemptId
    ? screeningAttempts.find((item) => item.attemptId === latestSuccessAttemptId) ?? null
    : null;

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("admin.debugParamEnabled", debugParamEnabled ? "1" : "0");
    }
  }, [debugParamEnabled]);

  useEffect(() => {
    return () => {
      autoRefreshRunningRef.current = false;
      autoRefreshPausedRef.current = true;
      tickerAutoRunningRef.current = false;
      tickerAutoPausedRef.current = true;
      screeningAutoRunningRef.current = false;
    };
  }, []);

  function applyMaterialization(progress: MaterializationProgress) {
    const hasIncomingCursor = "cursor" in progress;
    const hasIncomingNextCursor = "nextCursor" in progress;
    const incomingCursor = hasIncomingCursor ? (progress.cursor ?? null) : null;
    const incomingNextCursor = hasIncomingNextCursor ? (progress.nextCursor ?? null) : null;

    if (hasIncomingCursor) {
      setMaterializationDisplayCursor(incomingCursor);
    }
    if (hasIncomingNextCursor) {
      setMaterializationCursor(incomingNextCursor);
      materializationCursorRef.current = incomingNextCursor;
    }

    if (import.meta.env.DEV) {
      console.debug("[admin] materialization cursor update", {
        previousCursor: materializationDisplayCursor,
        incomingCursor,
        incomingNextCursor,
      });
    }
    setMaterializationDone(Boolean(progress.done));

    const unit = progress.progressUnit ?? tickerProgressUnit;
    setTickerProgressUnit(unit);

    const unitTotal = progress.targetsTotal;
    const unitProcessedTotal = progress.targetIndexGlobal ?? progress.targetsProcessedTotal;
    const unitProcessedInRun = progress.targetsProcessedInRun;

    const incomingTotal = Number(
      unitTotal ?? progress.totalToProcess ?? tickerTotalToProcess
    );
    const incomingProcessedTotal = Number(
      unitProcessedTotal ?? progress.processedTotal ?? tickerProcessedTotal
    );
    const incomingProcessedInRun = Number(
      unitProcessedInRun ?? progress.processedInRun ?? progress.inserted ?? tickerLastBatchProcessed
    );

    const localCurrentRaw = progress.localOffsetCurrent ?? progress.currentOffset ?? incomingCursor?.offset;
    const localNextRaw = progress.localOffsetNext ?? progress.nextOffset ?? incomingNextCursor?.offset;
    const hasCurrentOffset = typeof localCurrentRaw === "number";
    const hasNextOffset = typeof localNextRaw === "number" || localNextRaw === null;
    const currentOffset = hasCurrentOffset ? Number(localCurrentRaw) : tickerCurrentOffset;
    const nextOffset: number | null = hasNextOffset ? (localNextRaw ?? null) : null;

    setTickerTotalToProcess((prev) => Math.max(prev, Math.max(0, incomingTotal)));
    setTickerProcessedTotal((prev) => Math.max(prev, Math.max(0, incomingProcessedTotal)));
    setTickerLastBatchProcessed(Math.max(0, incomingProcessedInRun));
    const incomingRowsWritten = Number(progress.rowsWrittenInRun ?? progress.inserted ?? 0);
    setTickerLastBatchRowsWritten(Math.max(0, incomingRowsWritten));
    setTickerRowsWrittenTotal((prev) => prev + Math.max(0, incomingRowsWritten));
    if (hasCurrentOffset) {
      setTickerCurrentOffset(Math.max(0, currentOffset));
    }
    if (progress.done) {
      setTickerNextOffset(null);
    } else if (hasNextOffset) {
      setTickerNextOffset(nextOffset);
    } else if (hasIncomingNextCursor) {
      setTickerNextOffset(null);
    }

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
    if (payload?.__error) {
      setAutoRefreshStatus("error");
      setAutoRefreshMessage(`Auto refresh failed: ${payload.__error}`);
      autoRefreshRunningRef.current = false;
      autoRefreshPausedRef.current = true;
      return null;
    }

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
    if (payload?.__error) {
      setTickerAutoStatus("error");
      setTickerAutoMessage(`Ticker refresh failed: ${payload.__error}`);
      tickerAutoRunningRef.current = false;
      tickerAutoPausedRef.current = true;
      return null;
    }

    if (payload?.materialization) {
      applyMaterialization(payload.materialization);
      const done = Boolean(payload.materialization.done);
      const processedTotal = Number(
        payload.materialization.targetIndexGlobal
        ?? payload.materialization.targetsProcessedTotal
        ?? payload.materialization.processedTotal
        ?? 0
      );
      const progressUnit = payload.materialization.progressUnit ?? tickerProgressUnit;
      const total = Number(payload.materialization.targetsTotal ?? payload.materialization.totalToProcess ?? 0);
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
      setMaterializationDisplayCursor(null);
      setMaterializationDone(false);
      setTickerProcessedTotal(0);
      setTickerTotalToProcess(0);
      setTickerLastBatchProcessed(0);
      setTickerLastBatchRowsWritten(0);
      setTickerRowsWrittenTotal(0);
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

  function openAppFromAdmin() {
    if (typeof window === "undefined") return;
    const appUrl = new URL(window.location.href);
    if (debugParamEnabled) {
      appUrl.searchParams.set("debug", "1");
    } else {
      appUrl.searchParams.delete("debug");
    }
    window.open(appUrl.toString(), "_blank", "noopener,noreferrer");
  }

  return (
    <div className="admin">
      <div style={{ marginBottom: 16 }}>
        <label htmlFor="cron-secret">CRON_SECRET</label>
        <input
          id="cron-secret"
          type="password"
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          placeholder="CRON_SECRET"
        />
      </div>

      <details open style={{ marginBottom: 12 }}>
        <summary><strong>Databas / Setup</strong></summary>
        <p className="bread">Initierar tekniska tabeller och index som admin- och screeningfunktioner behöver.</p>
        <button type="button" onClick={() => void postJson("Init DB", "/api/admin/init-db", {})} disabled={!secretReady || loadingKey !== null}>
          {loadingKey === "Init DB" ? "Initializing..." : "Init DB"}
        </button>
        {initLog && (
          <span className={initLog.status === "error" ? "status error" : "status success"} style={{ marginLeft: 8 }}>
            {initLog.status.toUpperCase()}
          </span>
        )}
      </details>

      <details open style={{ marginBottom: 12 }}>
        <summary><strong>Company universe / Companies ingest</strong></summary>
        <p className="bread">Används för att ladda eller uppdatera stora bolagslistan och bolagsmetadata.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() =>
              void postJson("Refresh Companies", "/api/companies", { cursorOffset: 0, reset: true }).then((payload) => {
                const cursor = payload?.cursor;
                if (cursor) applyCursor(cursor);
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
                void postJson("Continue Companies Refresh", "/api/companies", { cursorOffset: companiesCursorOffset }).then((payload) => {
                  const cursor = payload?.cursor;
                  if (cursor) applyCursor(cursor);
                })
              }
              disabled={!secretReady || loadingKey !== null || autoRefreshStatus === "running"}
            >
              {loadingKey === "Continue Companies Refresh" ? "Continuing list refresh..." : "Continue companies refresh"}
            </button>
          )}
          <button type="button" onClick={() => void runAutoRefresh(false)} disabled={!secretReady || autoRefreshStatus === "running" || loadingKey !== null}>Start auto refresh companies</button>
          <button type="button" onClick={handlePauseAutoRefresh} disabled={!secretReady || autoRefreshStatus !== "running"}>Pause</button>
          <button type="button" onClick={() => void runAutoRefresh(false)} disabled={!secretReady || (autoRefreshStatus !== "paused" && autoRefreshStatus !== "error") || loadingKey !== null}>Resume</button>
          <button type="button" onClick={() => void runAutoRefresh(true)} disabled={!secretReady || autoRefreshStatus === "running" || loadingKey !== null}>Reset</button>
        </div>
      </details>

      <details open style={{ marginBottom: 12 }}>
        <summary><strong>Ticker management</strong></summary>
        <p className="bread">Används för att lägga till eller uppdatera enskilda tickers.</p>
        <CompanyPicker label="Lägg till bolag via namn" placeholder="T.ex. Microsoft" onSelect={(company) => appendTicker(company.symbol)} />
        <label htmlFor="tickers">Tickers (comma-separated)</label>
        <input id="tickers" value={tickers} onChange={(event) => setTickers(event.target.value)} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <button
            type="button"
            onClick={() =>
              void postJson("Upsert Tickers", "/api/admin/companies", {
                tickers: tickers.split(",").map((ticker) => ticker.trim().toUpperCase()).filter(Boolean),
              })
            }
            disabled={!secretReady || loadingKey !== null}
          >
            {loadingKey === "Upsert Tickers" ? "Upserting..." : "Upsert Tickers"}
          </button>
        </div>
        <label htmlFor="refresh-ticker">Refresh ticker</label>
        <input id="refresh-ticker" value={refreshTicker} onChange={(event) => setRefreshTicker(event.target.value)} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <button
            type="button"
            onClick={() =>
              void postJson("Refresh Ticker", "/api/company/refresh", { ticker: refreshTicker.trim().toUpperCase() }).then((payload) => {
                const materialization = payload?.materialization;
                if (materialization) applyMaterialization(materialization);
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
                  if (materialization) applyMaterialization(materialization);
                })
              }
              disabled={!secretReady || loadingKey !== null || tickerAutoStatus === "running"}
            >
              {loadingKey === "Continue Materialization" ? "Continuing..." : "Continue materialization"}
            </button>
          )}
          <button type="button" onClick={() => void runTickerAutoFlow(true)} disabled={!secretReady || tickerAutoStatus === "running" || loadingKey !== null}>Start auto refresh ticker</button>
          <button type="button" onClick={handlePauseTickerAutoFlow} disabled={!secretReady || tickerAutoStatus !== "running"}>Pause</button>
          <button type="button" onClick={() => void runTickerAutoFlow(false)} disabled={!secretReady || (tickerAutoStatus !== "paused" && tickerAutoStatus !== "error") || loadingKey !== null}>Resume</button>
          <button type="button" onClick={() => void runTickerAutoFlow(true)} disabled={!secretReady || tickerAutoStatus === "running" || loadingKey !== null}>Reset</button>
        </div>
      </details>

      <details open style={{ marginBottom: 12 }}>
        <summary><strong>Screening price data</strong></summary>
        <p className="bread">Används för att hämta och beräkna prisdata för screening. Fyller daily_price_history och price_screen_snapshot.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => void runScreeningPriceIngest(screeningOffset)} disabled={!secretReady || loadingKey !== null || screeningStatus === "running"}>
            {loadingKey === "Refresh Screening Price Data" ? "Running screening refresh..." : "Start / Continue screening price refresh"}
          </button>
          <button type="button" onClick={pauseScreeningRefresh} disabled={!secretReady || screeningStatus !== "running"}>
            Pause
          </button>
          <button type="button" onClick={() => void runScreeningPriceIngest(screeningOffset)} disabled={!secretReady || loadingKey !== null || (screeningStatus !== "paused" && screeningStatus !== "error")}>
            Resume
          </button>
          <button type="button" onClick={resetScreeningProgress} disabled={loadingKey !== null}>Reset progress</button>
          <button type="button" onClick={() => void runScreeningPriceIngest(screeningOffset)} disabled={!secretReady || loadingKey !== null || screeningStatus === "running"}>
            Run one debug batch
          </button>
        </div>
        <ul className="bread" style={{ marginTop: 8 }}>
          <li><strong>Start / Continue screening price refresh:</strong> runs one safe batch of the full pipeline (fetch prices → save history → build snapshots) from current offset and persists progress.</li>
          <li><strong>Pause:</strong> stops after current batch.</li>
          <li><strong>Resume:</strong> continues from current offset.</li>
          <li><strong>Reset progress:</strong> resets cursor/progress only, does not delete stored price data.</li>
          <li><strong>Run one debug batch:</strong> runs exactly one batch for debugging.</li>
        </ul>
        <p className="bread">Hämtar prisdata för screening och uppdaterar daily_price_history samt price_screen_snapshot.</p>
        <p className="bread">
          Screening status: <strong>{screeningStatus}</strong> — {screeningMessage}
        </p>
        <p className="bread">
          Offset: {screeningOffset} · Remaining: {screeningRemaining ?? "?"} · Total: {screeningTotal ?? "?"}
        </p>
        <p className="bread">
          Pipeline: <strong>Fetch prices → Save history → Build snapshots</strong>
        </p>
        {priceIngestResult && (
          <div className="bread">
            <strong>Status:</strong> {priceIngestResult.status === "partial_success"
              ? "Partial success"
              : priceIngestResult.ok ? "Success" : "Error"}<br />
            <strong>Tickers processed:</strong> {priceIngestResult.total ?? 0} (succeeded {priceIngestResult.succeeded ?? 0}, failed {priceIngestResult.failed ?? 0})<br />
            <strong>daily_price_history writes:</strong> {priceIngestResult.writtenDailyRows ?? 0} (unchanged {priceIngestResult.unchangedDailyRows ?? 0})<br />
            <strong>price_screen_snapshot writes:</strong> {priceIngestResult.snapshotWrites ?? 0}<br />
            <strong>Symbols changed:</strong> {priceIngestResult.changedSymbols ?? 0}
            {priceIngestResult.error ? <><br /><strong>Error:</strong> {priceIngestResult.error}</> : null}
            {((priceIngestResult.results?.length ?? 0) > 0 || (priceIngestResult.failures?.length ?? 0) > 0) && (
              <>
                <br />
                <strong>Batch symbols:</strong>
                <ul style={{ marginTop: 4 }}>
                  {(priceIngestResult.results ?? []).map((item, idx) => (
                    <li key={`ok-${String(item.symbol ?? idx)}`}>{String(item.symbol ?? "unknown")} ✅ success</li>
                  ))}
                  {(priceIngestResult.failures ?? []).map((item, idx) => (
                    <li key={`fail-${String(item.symbol ?? idx)}`}>{String(item.symbol ?? "unknown")} ❌ failed: {String(item.classification ?? "unknown")} ({String(item.stage ?? "unknown stage")})</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        <details open={screeningDebugOpen} onToggle={(event) => setScreeningDebugOpen((event.target as HTMLDetailsElement).open)} style={{ marginTop: 8 }}>
          <summary><strong>Debug: Screening price ingest</strong></summary>
          <p className="bread">Technical debug for screening price data. Auto-opens on error.</p>
          <p className="bread">
            Latest attempt: {latestAttempt ? `${latestAttempt.attemptId} (${latestAttempt.status})` : "none"}
            {latestSuccessAttempt ? ` · Latest successful attempt: ${latestSuccessAttempt.attemptId} (offset ${latestSuccessAttempt.offset})` : " · Latest successful attempt: none"}
          </p>
          {(latestAttempt?.debug?.steps?.length ?? screeningDebug?.steps?.length ?? 0) > 0 ? (
            <div>
              <p className="bread">
                Last completed: {(latestAttempt?.debug?.lastCompletedStep ?? screeningDebug?.lastCompletedStep) ?? "none"} · Last started: {(latestAttempt?.debug?.lastStartedStep ?? screeningDebug?.lastStartedStep) ?? "none"} · Current stage: {(latestAttempt?.debug?.currentStage ?? screeningDebug?.currentStage) ?? "none"} · Failed step: {(latestAttempt?.debug?.failedStep ?? screeningDebug?.failedStep) ?? "none"} · Duration: {(latestAttempt?.debug?.durationMs ?? screeningDebug?.durationMs) ?? 0} ms
              </p>
              {(latestAttempt?.debug?.steps ?? screeningDebug?.steps ?? []).map((step) => (
                <details key={step.key} style={{ marginBottom: 6 }}>
                  <summary>
                    {getStepBadge(step.status)} {step.label} — <strong>{step.status}</strong>
                  </summary>
                  <pre style={{ whiteSpace: "pre-wrap", overflowX: "auto", fontSize: 12 }}>
                    {JSON.stringify({
                      key: step.key,
                      status: step.status,
                      startedAt: step.startedAt,
                      endedAt: step.endedAt,
                      durationMs: step.durationMs,
                      details: step.details ?? {},
                      error: step.error ?? null,
                    }, null, 2)}
                  </pre>
                </details>
              ))}
            </div>
          ) : (
            <p className="bread">No debug steps yet. Run a screening batch to populate debug details.</p>
          )}
        </details>
      </details>

      <details open style={{ marginBottom: 12 }}>
        <summary><strong>Status / Progress</strong></summary>
        <p className="bread">Översikt av pågående jobb och progress för companies ingest och ticker materialization.</p>
        <p className="bread">Auto refresh status: <strong>{autoRefreshStatus}</strong> — {autoRefreshMessage}</p>
        <p className="bread">Processed {companiesProcessedTotal} of {companiesTotalToProcess || "?"} · Last batch {companiesLastBatchProcessed}</p>
        <p className="bread">Current cursorOffset: {companiesCursorOffset ?? 0} · Next offset: {companiesNextOffset ?? "done"}</p>
        <div style={{ width: "100%", maxWidth: 520, height: 12, borderRadius: 8, background: "#e5e7eb", overflow: "hidden" }} aria-label="Companies refresh progress">
          <div style={{ width: `${companiesProgressPercent}%`, height: "100%", background: autoRefreshStatus === "error" ? "#b91c1c" : "#2563eb", transition: "width 180ms ease" }} />
        </div>
        <p className="bread">{companiesProgressPercent}%</p>
        <p className="bread">Ticker auto status: <strong>{tickerAutoStatus}</strong> — {tickerAutoMessage}</p>
        <p className="bread">Materializing {tickerProgressUnit}: {tickerProcessedTotal} of {tickerTotalToProcess || "?"} ({tickerProgressPercent}%)</p>
        <p className="bread">Last batch: +{tickerLastBatchProcessed} {tickerProgressUnit}</p>
        <p className="bread">Rows written last batch: {tickerLastBatchRowsWritten} (cumulative {tickerRowsWrittenTotal})</p>
        <p className="bread">
          Cursor (local): {String(materializationDisplayCursor?.statement ?? "-")}/{String(materializationDisplayCursor?.period ?? "-")} offset {tickerCurrentOffset}
          {tickerNextOffset === null ? "" : ` → ${tickerNextOffset}`}
        </p>
        <div style={{ width: "100%", maxWidth: 520, height: 12, borderRadius: 8, background: "#e5e7eb", overflow: "hidden" }} aria-label="Ticker materialization progress">
          <div style={{ width: `${tickerProgressPercent}%`, height: "100%", background: tickerAutoStatus === "error" ? "#b91c1c" : "#059669", transition: "width 180ms ease" }} />
        </div>
        <p className="bread">{tickerProgressPercent}%</p>
      </details>

      <details style={{ marginBottom: 12 }}>
        <summary><strong>Admin activity log</strong></summary>
        <p className="bread">Gemensam logg för admin actions. Öppna vid felsökning.</p>
        {logEntries.length === 0 ? (
          <div className="status empty">No requests yet.</div>
        ) : (
          <div className="log-panel">
            {logEntries.map((entry) => (
              <div key={entry.id} className={`log-entry ${entry.status}`}>
                <div className="log-entry-header">
                  <strong>{entry.title}</strong>
                  <span className={`log-status ${entry.status}`}>{STATUS_LABELS[entry.status]}</span>
                </div>
                <pre>{entry.message}</pre>
              </div>
            ))}
          </div>
        )}
      </details>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button type="button" onClick={() => void postJson("Run Cron", "/api/cron/refresh", {})} disabled={!secretReady || loadingKey !== null}>
          {loadingKey === "Run Cron" ? "Running..." : "Run Cron"}
        </button>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={debugParamEnabled} onChange={(event) => setDebugParamEnabled(event.target.checked)} />
          Debug (debug=1)
        </label>
        <button type="button" onClick={openAppFromAdmin}>{debugParamEnabled ? "Open app (debug)" : "Open app"}</button>
      </div>
    </div>
  );
}
