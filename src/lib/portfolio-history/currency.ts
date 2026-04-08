export function normalizeCurrency(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase().replace(/[^A-Z]/g, "");
  return normalized.length === 3 ? normalized : null;
}

function normalizeExchange(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

export function inferCurrencyFromExchange(exchangeRaw: unknown): string | null {
  const exchange = normalizeExchange(exchangeRaw);
  if (!exchange) return null;
  if (/TSX|TSXV|TORONTO|VENTURE/.test(exchange)) return "CAD";
  if (/NASDAQ|NYSE|AMEX|ARCA|BATS|CBOE|OTC|NEW YORK/.test(exchange)) return "USD";
  if (/STO|STOCKHOLM|OMX|SWEDEN/.test(exchange)) return "SEK";
  if (/XETRA|FRA|FRANKFURT|GERMANY/.test(exchange)) return "EUR";
  if (/LSE|LONDON/.test(exchange)) return "GBP";
  return null;
}

export function inferCurrencyFromSymbol(symbolRaw: unknown): string | null {
  if (typeof symbolRaw !== "string") return null;
  const symbol = symbolRaw.trim().toUpperCase();
  if (!symbol) return null;
  if (symbol.endsWith(".TO") || symbol.endsWith(".V")) return "CAD";
  if (symbol.endsWith(".ST")) return "SEK";
  if (symbol === "CASH" || symbol === "SEK") return "SEK";
  return null;
}

export type NativeCurrencyResolution = {
  currency: string | null;
  source: "position_currency" | "price_currency" | "company_exchange" | "symbol_suffix" | "unresolved";
  company_exchange_used: string | null;
  fallback_used: boolean;
  warning: string | null;
};

export function resolveNativeCurrency(args: {
  positionCurrency: unknown;
  priceCurrency: unknown;
  historySymbol: string;
  rawSymbol: string;
  companyExchangeBySymbol: Map<string, string | null>;
}): NativeCurrencyResolution {
  const positionCurrency = normalizeCurrency(args.positionCurrency);
  if (positionCurrency) {
    return {
      currency: positionCurrency,
      source: "position_currency",
      company_exchange_used: args.companyExchangeBySymbol.get(args.historySymbol) ?? args.companyExchangeBySymbol.get(args.rawSymbol) ?? null,
      fallback_used: false,
      warning: null,
    };
  }

  const priceCurrency = normalizeCurrency(args.priceCurrency);
  if (priceCurrency) {
    return {
      currency: priceCurrency,
      source: "price_currency",
      company_exchange_used: args.companyExchangeBySymbol.get(args.historySymbol) ?? args.companyExchangeBySymbol.get(args.rawSymbol) ?? null,
      fallback_used: false,
      warning: null,
    };
  }

  const exchange = args.companyExchangeBySymbol.get(args.historySymbol) ?? args.companyExchangeBySymbol.get(args.rawSymbol) ?? null;
  const fromExchange = inferCurrencyFromExchange(exchange);
  if (fromExchange) {
    return {
      currency: fromExchange,
      source: "company_exchange",
      company_exchange_used: exchange,
      fallback_used: true,
      warning: "native_currency_inferred_from_company_exchange",
    };
  }

  const fromSymbol = inferCurrencyFromSymbol(args.historySymbol) ?? inferCurrencyFromSymbol(args.rawSymbol);
  if (fromSymbol) {
    return {
      currency: fromSymbol,
      source: "symbol_suffix",
      company_exchange_used: exchange,
      fallback_used: true,
      warning: "native_currency_inferred_from_symbol_suffix",
    };
  }

  return {
    currency: null,
    source: "unresolved",
    company_exchange_used: exchange,
    fallback_used: false,
    warning: "native_currency_unresolved",
  };
}
