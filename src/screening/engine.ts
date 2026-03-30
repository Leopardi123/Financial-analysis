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

  switch (fieldKey) {
    case "return_5d":
    case "return_20d":
    case "return_60d":
    case "drawdown_20d":
    case "drawdown_60d":
      return typeof price[fieldKey] === "number" ? Number(price[fieldKey]) : null;
    case "trend_state":
    case "recovery_state":
      return typeof price[fieldKey] === "string" ? String(price[fieldKey]) : null;
    case "operating_cash_flow":
      return latest(cashflow.operatingCashFlow);
    case "free_cash_flow":
      return latest(cashflow.freeCashFlow);
    case "revenue_growth":
      return growth(latest(income.revenue), prev(income.revenue));
    case "ebit_growth":
      return growth(latest(income.ebitda), prev(income.ebitda));
    case "net_income_growth":
      return growth(latest(income.netIncome), prev(income.netIncome));
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
      return growth(latest(income.weightedAverageShsOut), prev(income.weightedAverageShsOut));
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

  const matched = mustEvaluations.every((item) => item.passed);
  const score = mustEvaluations.reduce((acc, item) => acc + (item.passed ? (item.rule.weight ?? 1) : 0), 0);

  const metrics = mustEvaluations.map((item) => toMetric(item.rule.field, item.value));

  return {
    matched,
    score,
    includeReasons,
    excludeReasons,
    metrics,
    ruleResults: mustEvaluations,
  };
}
