import { SCREENING_FIELD_MAP } from "./fieldCatalog.ts";
import type { CompanySnapshot, MetricResult, RuleEvaluation, RuleValue, ScreenDefinition, ScreenRule, ScreeningResult } from "./types.ts";

function latest(series: Array<number | null> | undefined) {
  if (!series || series.length === 0) return null;
  for (let i = series.length - 1; i >= 0; i -= 1) {
    const value = series[i];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function prev(series: Array<number | null> | undefined) {
  if (!series || series.length < 2) return null;
  let seen = 0;
  for (let i = series.length - 1; i >= 0; i -= 1) {
    const value = series[i];
    if (typeof value === "number" && Number.isFinite(value)) {
      seen += 1;
      if (seen === 2) return value;
    }
  }
  return null;
}

function growth(now: number | null, previous: number | null): number | null {
  if (now === null || previous === null || previous === 0) return null;
  return now / previous - 1;
}

export function resolveFieldValue(snapshot: CompanySnapshot, fieldKey: string): number | string | boolean | null {
  const income = snapshot.income;
  const balance = snapshot.balance;
  const cashflow = snapshot.cashflow;
  const manual = snapshot.manual ?? {};
  const price = (snapshot.price ?? {}) as Record<string, unknown>;
  const corporate = (snapshot.corporateSnapshot ?? {}) as Record<string, unknown>;

  const readFinite = (key: string) => {
    const raw = corporate[key];
    return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
  };
  const readFiniteFromPaths = (...paths: string[]) => {
    for (const path of paths) {
      const parts = path.split(".");
      let cursor: unknown = corporate;
      for (const part of parts) {
        if (!cursor || typeof cursor !== "object") {
          cursor = undefined;
          break;
        }
        cursor = (cursor as Record<string, unknown>)[part];
      }
      if (typeof cursor === "number" && Number.isFinite(cursor)) return cursor;
    }
    return null;
  };
  const ratio = (num: number | null, den: number | null) =>
    num !== null && den !== null && den !== 0 ? num / den : null;

  switch (fieldKey) {
    case "return_5d":
    case "return_20d":
    case "return_60d":
      return typeof price[fieldKey] === "number" ? Number(price[fieldKey]) * 100 : null;
    case "drawdown_20d":
    case "drawdown_60d": {
      if (typeof price[fieldKey] !== "number") return null;
      const raw = Number(price[fieldKey]);
      return raw < 0 ? Math.abs(raw) * 100 : 0;
    }
    case "trend_state":
    case "recovery_state":
      return typeof price[fieldKey] === "string" ? String(price[fieldKey]) : null;
    case "corp_npv":
      return readFinite("NPV_today_TargetCurrency");
    case "corp_dcf":
      return readFinite("DCF_prodStart_present_TargetCurrency");
    case "corp_nav":
      return readFinite("NAV_today_TargetCurrency");
    case "corp_npv_per_share":
      return readFinite("NPV_today_perShare_TargetCurrency");
    case "corp_dcf_per_share":
      return readFinite("DCF_prodStart_present_perShare_TargetCurrency");
    case "corp_nav_per_share": {
      const nav = readFinite("NAV_today_TargetCurrency");
      const shares = readFinite("shares_post_financing");
      return ratio(nav, shares);
    }
    case "corp_ev":
      return readFinite("EV_TargetCurrency");
    case "corp_market_cap":
      return readFinite("MarketCap_TargetCurrency");
    case "corp_ev_over_npv":
      return readFiniteFromPaths("EV_over_NPV", "marketValue.EV_over_NPV", "marketValue.ev_over_npv");
    case "corp_ev_over_nav":
      return readFiniteFromPaths("EV_over_NAV", "marketValue.EV_over_NAV", "marketValue.ev_over_nav");
    case "corp_p_over_nav":
      return readFiniteFromPaths("P_over_NAV", "marketValue.P_over_NAV", "marketValue.p_over_nav");
    case "corp_market_cap_over_npv":
      return ratio(readFinite("MarketCap_TargetCurrency"), readFinite("NPV_today_TargetCurrency"));
    case "corp_market_cap_over_nav":
      return ratio(readFinite("MarketCap_TargetCurrency"), readFinite("NAV_today_TargetCurrency"));
    case "corp_price_over_dcf_per_share":
      return ratio(readFinite("price_current_TargetCurrency"), readFinite("DCF_prodStart_present_perShare_TargetCurrency"));
    case "corp_price_over_nav_per_share":
      return ratio(readFinite("price_current_TargetCurrency"), ratio(readFinite("NAV_today_TargetCurrency"), readFinite("shares_post_financing")));
    case "operating_cash_flow":
      return latest(cashflow.operatingCashFlow);
    case "free_cash_flow":
      return latest(cashflow.freeCashFlow);
    case "revenue_growth":
      return (() => {
        const value = growth(latest(income.revenue), prev(income.revenue));
        return value === null ? null : value * 100;
      })();
    case "ebit_growth":
      return (() => {
        const value = growth(latest(income.ebitda), prev(income.ebitda));
        return value === null ? null : value * 100;
      })();
    case "net_income_growth":
      return (() => {
        const value = growth(latest(income.netIncome), prev(income.netIncome));
        return value === null ? null : value * 100;
      })();
    case "debt_to_equity": {
      const debt = latest(balance.totalLiabilities);
      const equity = latest(balance.totalStockholdersEquity);
      return debt !== null && equity !== null && equity !== 0 ? debt / equity : null;
    }
    case "current_ratio": {
      const currentAssets = latest(balance.totalCurrentAssets);
      const currentLiabilities = latest(balance.totalCurrentLiabilities);
      return currentAssets !== null && currentLiabilities !== null && currentLiabilities !== 0 ? currentAssets / currentLiabilities : null;
    }
    case "dilution":
      return (() => {
        const value = growth(latest(income.weightedAverageShsOut), prev(income.weightedAverageShsOut));
        return value === null ? null : value * 100;
      })();
    case "runway_months": {
      const cash = latest(balance.cashAndShortTermInvestments);
      const fcf = latest(cashflow.freeCashFlow);
      const annualBurn = fcf !== null ? Math.max(0, -fcf) : null;
      if (cash === null || annualBurn === null || annualBurn === 0) return null;
      return (cash / annualBurn) * 12;
    }
    case "net_cash_flag": {
      const debt = latest(balance.totalDebt);
      const cash = latest(balance.cashAndShortTermInvestments);
      if (debt === null || cash === null) return null;
      return cash > debt;
    }
    default:
      return typeof manual[fieldKey] === "number" ? manual[fieldKey] : null;
  }
}

function resolveRuleValue(value: RuleValue, params: Record<string, number>): number | string | Array<number | string> | null {
  if (typeof value === "object" && value !== null && "param" in value) {
    const resolved = params[value.param];
    return Number.isFinite(resolved) ? resolved : null;
  }
  return value;
}

function passOperator(left: number | string | boolean | null, operator: ScreenRule["operator"], right: number | string | Array<number | string> | null): boolean {
  if (left === null || right === null) return false;

  if (operator === "in") {
    return Array.isArray(right) ? right.map((item) => String(item)).includes(String(left)) : false;
  }

  if (typeof left === "number" && typeof right === "number") {
    if (operator === ">") return left > right;
    if (operator === ">=") return left >= right;
    if (operator === "<") return left < right;
    if (operator === "<=") return left <= right;
    if (operator === "==") return left === right;
    if (operator === "!=") return left !== right;
  }

  if (operator === "==") return String(left) === String(right);
  if (operator === "!=") return String(left) !== String(right);
  return false;
}

function toMetric(field: string, value: number | string | boolean | null): MetricResult {
  const def = SCREENING_FIELD_MAP.get(field);
  return {
    key: field,
    label: def?.label ?? field,
    value: typeof value === "boolean" ? (value ? "true" : "false") : (value as number | string | null),
    state: value === null ? "missing" : "ok",
  };
}

export function evaluateScreen(args: {
  snapshot: CompanySnapshot;
  screen: ScreenDefinition;
  params?: Record<string, number>;
}): Omit<ScreeningResult, "ticker" | "presetId"> {
  const params = args.params ?? {};

  const mustEvaluations: RuleEvaluation[] = args.screen.rules.mustHave.map((rule) => {
    const left = resolveFieldValue(args.snapshot, rule.field);
    const right = resolveRuleValue(rule.value, params);
    const passed = passOperator(left, rule.operator, right);
    const fieldLabel = SCREENING_FIELD_MAP.get(rule.field)?.label ?? rule.field;
    return {
      rule,
      fieldLabel,
      value: left,
      passed,
      reason: passed
        ? `${fieldLabel} uppfyller ${rule.operator} ${Array.isArray(right) ? right.join(", ") : String(right)}`
        : `${fieldLabel} uppfyller inte ${rule.operator} ${Array.isArray(right) ? right.join(", ") : String(right)}`,
    };
  });

  const includeReasons = mustEvaluations.filter((item) => item.passed).map((item) => item.reason);
  const excludeReasons = mustEvaluations.filter((item) => !item.passed).map((item) => item.reason);
  const missingRequiredFields = mustEvaluations
    .filter((item) => item.value === null)
    .map((item) => item.rule.field);

  const matched = missingRequiredFields.length === 0 && mustEvaluations.every((item) => item.passed);
  const score = mustEvaluations.reduce((acc, item) => acc + (item.passed ? (item.rule.weight ?? 1) : 0), 0);
  const evaluationStatus: ScreeningResult["evaluationStatus"] = missingRequiredFields.length > 0
    ? "not_evaluated"
    : matched
      ? "passed"
      : "failed";

  const metrics = mustEvaluations.map((item) => toMetric(item.rule.field, item.value));

  return {
    matched,
    score,
    evaluationStatus,
    missingRequiredFields,
    includeReasons,
    excludeReasons,
    metrics,
    ruleResults: mustEvaluations,
  };
}
