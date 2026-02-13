import { requireFmpApiKey } from "../../../../api/_fmp.js";

export default async function handler(req: any, res: any) {
  try {
    const apiKey = requireFmpApiKey();
    if (!apiKey) {
      res.status(500).json({ ok: false, error: "FMP_API_KEY missing" });
      return;
    }

    const ticker = typeof req.query?.ticker === "string" ? req.query.ticker.trim().toUpperCase() : "";
    if (!ticker) {
      res.status(400).json({ ok: false, error: "Ticker is required" });
      return;
    }

    const url = `https://financialmodelingprep.com/stable/profile?symbol=${encodeURIComponent(ticker)}&apikey=${apiKey}`;
    const response = await fetch(url);
    if (!response.ok) {
      res.status(502).json({ ok: false, error: `FMP profile request failed (${response.status})` });
      return;
    }

    const payload = (await response.json()) as Array<Record<string, unknown>>;
    const profile = payload?.[0] ?? null;

    res.status(200).json({ ok: true, ticker, profile });
  } catch (error) {
    res.status(500).json({ ok: false, error: (error as Error).message });
  }
}
