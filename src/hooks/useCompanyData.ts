import { useCallback, useState } from "react";
import type { CompanyResponse } from "../components/Viewer";

function normalizeClientErrorMessage(message: string | null | undefined, fallback: string): string {
  const normalized = (message ?? '').trim();
  if (!normalized) return fallback;
  if (normalized.includes('did not match the expected pattern')) {
    return fallback;
  }
  return normalized;
}

export default function useCompanyData(initialTicker = "AAPL") {
  const [ticker, setTicker] = useState(initialTicker);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CompanyResponse | null>(null);

  const fetchCompany = useCallback(async (overrideTicker?: string) => {
    const value = (overrideTicker ?? ticker).trim().toUpperCase();
    if (!value) {
      setError("Ticker is required.");
      return;
    }
    if (overrideTicker) {
      setTicker(value);
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/company?ticker=${encodeURIComponent(value)}&period=fy`);
      const payload = (await response.json()) as CompanyResponse;
      if (!response.ok) {
        setError(payload.error ?? "Failed to load company data.");
        setData(null);
        return;
      }
      setData(payload);
    } catch (err) {
      setError(normalizeClientErrorMessage((err as Error).message, "Failed to load company data."));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  return {
    ticker,
    setTicker,
    loading,
    error,
    data,
    fetchCompany,
  };
}
