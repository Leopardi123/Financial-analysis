import type { MetricResult, PresetDefinition, PresetScore } from "./types";

function latest(series: Array<number | null> | undefined) {
  if (!series || series.length === 0) return null;
  for (let i = series.length - 1; i >= 0; i -= 1) {
    const value = series[i];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function prev(series: Array<number | null> | undefined) {
  if (!series || series.length < 2) return null;
  let found = 0;
  for (let i = series.length - 1; i >= 0; i -= 1) {
    const value = series[i];
    if (typeof value === "number" && Number.isFinite(value)) {
      found += 1;
      if (found === 2) return value;
    }
  }
  return null;
}

function metric(
  key: string,
  label: string,
  value: number | null,
  note?: string,
  manual = false,
): MetricResult {
  return {
    key,
    label,
    value,
    state: value === null ? (manual ? "manual" : "missing") : "ok",
    note,
  };
}

function finish(score: number, includeReasons: string[], excludeReasons: string[], metrics: MetricResult[]): PresetScore {
  return {
    matched: score > 0,
    score,
    includeReasons,
    excludeReasons,
    metrics,
  };
}

export const SCREENING_PRESETS: PresetDefinition[] = [
  {
    id: "buffet-dividend-light",
    name: "Buffet Dividend Aristocrats (Light)",
    category: "Dividend / Buffetology",
    description: "Lätt version: stabilt kassaflöde, positiv utdelning och rimlig skuldsättning.",
    checks: ["Operating cash flow > 0", "Dividends paid senaste året", "Debt/Equity under tröskel"],
    ignores: ["Exakt värdering", "Makro timing"],
    requiredFields: ["cashflow.operatingCashFlow", "cashflow.dividendsPaid", "balance.totalLiabilities", "balance.totalStockholdersEquity"],
    optionalFields: ["income.netIncome"],
    defaults: { maxDebtToEquity: 2 },
    fallback: "Om utdelningsdata saknas markeras den som manuell kontroll.",
    evaluate(snapshot, params) {
      const ocf = latest(snapshot.cashflow.operatingCashFlow);
      const dividends = latest(snapshot.cashflow.dividendsPaid);
      const debt = latest(snapshot.balance.totalLiabilities);
      const equity = latest(snapshot.balance.totalStockholdersEquity);
      const debtToEquity = debt !== null && equity ? debt / equity : null;
      const metrics = [
        metric("ocf", "Operating Cash Flow", ocf),
        metric("dividends", "Dividends Paid", dividends),
        metric("debtToEquity", "Debt/Equity", debtToEquity),
      ];
      let score = 0;
      const inc: string[] = [];
      const exc: string[] = [];
      if (ocf !== null && ocf > 0) { score += 1; inc.push("Positivt operativt kassaflöde."); } else { exc.push("Saknar starkt operativt kassaflöde."); }
      if (dividends !== null && dividends < 0) { score += 1; inc.push("Betalar utdelning."); } else { exc.push("Utdelningsdata saknas eller negativ signal."); }
      if (debtToEquity !== null && debtToEquity <= (params.maxDebtToEquity ?? 2)) { score += 1; inc.push("Skuldsättning inom rimlig nivå."); } else { exc.push("Skuldsättning för hög eller okänd."); }
      return finish(score >= 2 ? score : 0, inc, exc, metrics);
    },
  },
  {
    id: "cashflow-funded-dividends",
    name: "Cashflow-funded dividends",
    category: "Dividend / Buffetology",
    description: "Hittar bolag där utdelningen tydligt täcks av fritt kassaflöde.",
    checks: ["Free cash flow > utdelning", "Stabilitet senaste år"],
    ignores: ["Direktavkastningsnivå"],
    requiredFields: ["cashflow.freeCashFlow", "cashflow.dividendsPaid"],
    optionalFields: ["income.netIncome"],
    fallback: "Saknad utdelningshistorik markeras manuellt.",
    evaluate(snapshot) {
      const fcf = latest(snapshot.cashflow.freeCashFlow);
      const div = latest(snapshot.cashflow.dividendsPaid);
      const cover = fcf !== null && div !== null && div !== 0 ? fcf / Math.abs(div) : null;
      const metrics = [metric("fcf", "Free Cash Flow", fcf), metric("div", "Dividends", div), metric("cover", "FCF cover", cover)];
      const inc: string[] = [];
      const exc: string[] = [];
      let score = 0;
      if (cover !== null && cover > 1) { score += 2; inc.push("Utdelning täcks av fritt kassaflöde."); } else { exc.push("Utdelning täcks inte tydligt av kassaflöde."); }
      return finish(score, inc, exc, metrics);
    },
  },
  {
    id: "dividend-growers",
    name: "Dividend growers (avoid yield traps)",
    category: "Dividend / Buffetology",
    description: "Söker bolag där utdelning ökar utan att vinstkvalitet kollapsar.",
    checks: ["Utdelning ökar", "Net income positiv"],
    ignores: ["Hög direktavkastning som ensamt signal"],
    requiredFields: ["cashflow.dividendsPaid", "income.netIncome"],
    optionalFields: ["income.revenue"],
    fallback: "Om historik saknas markeras resultat som osäkert.",
    evaluate(snapshot) {
      const divNow = latest(snapshot.cashflow.dividendsPaid);
      const divPrev = prev(snapshot.cashflow.dividendsPaid);
      const ni = latest(snapshot.income.netIncome);
      const growth = divNow !== null && divPrev !== null && divPrev !== 0 ? Math.abs(divNow) / Math.abs(divPrev) - 1 : null;
      const metrics = [metric("divGrowth", "Dividend growth", growth), metric("netIncome", "Net income", ni)];
      const inc: string[] = [];
      const exc: string[] = [];
      let score = 0;
      if (growth !== null && growth > 0) { score += 1; inc.push("Utdelning växer."); } else { exc.push("Utdelning växer inte tydligt."); }
      if (ni !== null && ni > 0) { score += 1; inc.push("Positiv nettovinst."); } else { exc.push("Svag eller okänd nettovinst."); }
      return finish(score, inc, exc, metrics);
    },
  },
  {
    id: "junior-miners-runway",
    name: "Junior miners with long cash runway",
    category: "Commodities / Miners",
    description: "Identifierar juniora bolag med kassa i relation till cash burn.",
    checks: ["Cash runway i år"],
    ignores: ["Resurskvalitet i marken"],
    requiredFields: ["balance.cashAndShortTermInvestments", "cashflow.freeCashFlow"],
    optionalFields: ["manual.resourceQuality"],
    defaults: { minRunwayYears: 2 },
    fallback: "Geologiska signaler kan anges manuellt i JSON-input.",
    evaluate(snapshot, params) {
      const cash = latest(snapshot.balance.cashAndShortTermInvestments);
      const fcf = latest(snapshot.cashflow.freeCashFlow);
      const burn = fcf !== null ? Math.max(0, -fcf) : null;
      const runway = cash !== null && burn !== null && burn > 0 ? cash / burn : null;
      const metrics = [metric("cash", "Cash", cash), metric("burn", "Cash burn", burn), metric("runway", "Runway years", runway)];
      const inc: string[] = [];
      const exc: string[] = [];
      let score = 0;
      if (runway !== null && runway >= (params.minRunwayYears ?? 2)) { score += 2; inc.push("Lång kassarunway."); } else { exc.push("Kort eller okänd kassarunway."); }
      return finish(score, inc, exc, metrics);
    },
  },
  {
    id: "developer-rerating",
    name: "Developers approaching re-rating (manual flags allowed)",
    category: "Commodities / Miners",
    description: "Kombinerar finansdata med manuella flaggor för utvecklarcasen.",
    checks: ["Manual flag: permitting/progress", "Likviditetsnivå"],
    ignores: ["Kortsiktig prisvolatilitet"],
    requiredFields: ["balance.cashAndShortTermInvestments"],
    optionalFields: ["manual.reratingFlag", "manual.permittingScore"],
    fallback: "Preset fungerar även om manuella flaggor saknas men markeras då som manuell.",
    evaluate(snapshot) {
      const cash = latest(snapshot.balance.cashAndShortTermInvestments);
      const manualFlag = snapshot.manual?.reratingFlag ?? null;
      const metrics = [
        metric("cash", "Cash", cash),
        metric("reratingFlag", "Manual rerating flag", manualFlag, "Set via manual JSON", true),
      ];
      const inc: string[] = [];
      const exc: string[] = [];
      let score = 0;
      if (cash !== null && cash > 0) { score += 1; inc.push("Har finansiellt handlingsutrymme."); } else { exc.push("Svagt finansiellt handlingsutrymme."); }
      if (manualFlag !== null && manualFlag > 0) { score += 1; inc.push("Manuell re-rating flagga satt."); } else { exc.push("Saknar manuell re-rating flagga."); }
      return finish(score, inc, exc, metrics);
    },
  },
  {
    id: "producer-margin-leverage",
    name: "Producers with margin leverage to commodity price",
    category: "Commodities / Miners",
    description: "Tittar efter producenter där marginaler förbättras med försäljning.",
    checks: ["EBITDA margin trend", "Revenue growth"],
    ignores: ["Exakt råvaruprisprognos"],
    requiredFields: ["income.ebitda", "income.revenue"],
    optionalFields: ["manual.commodityBeta"],
    fallback: "Råvarukänslighet kan sättas manuellt.",
    evaluate(snapshot) {
      const ebitdaNow = latest(snapshot.income.ebitda);
      const revenueNow = latest(snapshot.income.revenue);
      const revenuePrev = prev(snapshot.income.revenue);
      const margin = ebitdaNow !== null && revenueNow ? ebitdaNow / revenueNow : null;
      const growth = revenueNow !== null && revenuePrev !== null && revenuePrev !== 0 ? revenueNow / revenuePrev - 1 : null;
      const metrics = [metric("margin", "EBITDA margin", margin), metric("growth", "Revenue growth", growth)];
      const inc: string[] = [];
      const exc: string[] = [];
      let score = 0;
      if (margin !== null && margin > 0.15) { score += 1; inc.push("Stödjande EBITDA-marginal."); } else { exc.push("Svag eller okänd EBITDA-marginal."); }
      if (growth !== null && growth > 0) { score += 1; inc.push("Växande intäkter."); } else { exc.push("Ingen tydlig intäktstillväxt."); }
      return finish(score, inc, exc, metrics);
    },
  },
  {
    id: "insider-buying-drawdown",
    name: "Insider buying after large drawdown",
    category: "Insider / Behavioural",
    description: "Kombinerar drawdown med manuella insidersignaler.",
    checks: ["Price drawdown", "Manual insider score"],
    ignores: ["Kort teknisk momentum"],
    requiredFields: ["manual.drawdownPct", "manual.insiderScore"],
    optionalFields: ["income.netIncome"],
    fallback: "Insider-data markeras som manuell tills API kopplats in.",
    evaluate(snapshot) {
      const drawdown = snapshot.manual?.drawdownPct ?? null;
      const insider = snapshot.manual?.insiderScore ?? null;
      const metrics = [
        metric("drawdown", "Drawdown %", drawdown, "Manual until insider/price event API is wired", true),
        metric("insider", "Insider score", insider, "Manual until insider API is wired", true),
      ];
      const inc: string[] = [];
      const exc: string[] = [];
      let score = 0;
      if (drawdown !== null && drawdown <= -30) { score += 1; inc.push("Stor drawdown identifierad."); } else { exc.push("Drawdown under tröskel eller saknas."); }
      if (insider !== null && insider > 0) { score += 1; inc.push("Positiv insider-indikation."); } else { exc.push("Insider-indikation saknas."); }
      return finish(score, inc, exc, metrics);
    },
  },
  {
    id: "founder-capital-allocator",
    name: "Founder-led / capital allocator (manual metadata allowed)",
    category: "Insider / Behavioural",
    description: "Screenar efter founder-led kvaliteter via manuell metadata och kapitalavkastning.",
    checks: ["Manual founder flag", "ROE"],
    ignores: ["Kvartalsnoise"],
    requiredFields: ["income.netIncome", "balance.totalStockholdersEquity"],
    optionalFields: ["manual.founderFlag"],
    fallback: "Founder-status markeras som manuell metadata.",
    evaluate(snapshot) {
      const ni = latest(snapshot.income.netIncome);
      const eq = latest(snapshot.balance.totalStockholdersEquity);
      const roe = ni !== null && eq ? ni / eq : null;
      const founder = snapshot.manual?.founderFlag ?? null;
      const metrics = [metric("roe", "ROE", roe), metric("founder", "Founder flag", founder, "Manual metadata", true)];
      const inc: string[] = [];
      const exc: string[] = [];
      let score = 0;
      if (roe !== null && roe > 0.12) { score += 1; inc.push("ROE indikerar kapitaldisciplin."); } else { exc.push("ROE svag eller okänd."); }
      if (founder !== null && founder > 0) { score += 1; inc.push("Founder-led flagga satt."); } else { exc.push("Founder-led flagga saknas."); }
      return finish(score, inc, exc, metrics);
    },
  },
  {
    id: "accounting-quality",
    name: "Accounting quality (retained earnings vs net income)",
    category: "Quality / Capital Discipline",
    description: "Bedömer om retained earnings följer nettovinst över tid.",
    checks: ["Retained earnings trend", "Net income trend"],
    ignores: ["Värderingsmultiplar"],
    requiredFields: ["balance.retainedEarnings", "income.netIncome"],
    optionalFields: ["cashflow.operatingCashFlow"],
    fallback: "Om retained earnings saknas markeras bolaget som osäkert.",
    evaluate(snapshot) {
      const reNow = latest(snapshot.balance.retainedEarnings);
      const rePrev = prev(snapshot.balance.retainedEarnings);
      const niNow = latest(snapshot.income.netIncome);
      const niPrev = prev(snapshot.income.netIncome);
      const reGrowth = reNow !== null && rePrev !== null ? reNow - rePrev : null;
      const niGrowth = niNow !== null && niPrev !== null ? niNow - niPrev : null;
      const metrics = [metric("reGrowth", "Retained earnings delta", reGrowth), metric("niGrowth", "Net income delta", niGrowth)];
      const inc: string[] = [];
      const exc: string[] = [];
      let score = 0;
      if (reGrowth !== null && niGrowth !== null && reGrowth >= 0 && niGrowth >= 0) {
        score += 2;
        inc.push("Retained earnings och nettovinst rör sig åt rätt håll.");
      } else {
        exc.push("Bokföringskvalitet osäker eller negativ trend.");
      }
      return finish(score, inc, exc, metrics);
    },
  },
  {
    id: "capital-discipline",
    name: "Capital discipline (capex vs earnings, dilution, no prefs)",
    category: "Quality / Capital Discipline",
    description: "Fångar balans mellan capex, resultat och utspädning.",
    checks: ["Capex andel av earnings", "Shares outstanding trend"],
    ignores: ["Kort kursmomentum"],
    requiredFields: ["cashflow.capitalExpenditure", "income.netIncome", "income.weightedAverageShsOut"],
    optionalFields: ["balance.preferredStock"],
    fallback: "Preferred stock och dilution kan kompletteras manuellt.",
    evaluate(snapshot) {
      const capex = latest(snapshot.cashflow.capitalExpenditure);
      const ni = latest(snapshot.income.netIncome);
      const shNow = latest(snapshot.income.weightedAverageShsOut);
      const shPrev = prev(snapshot.income.weightedAverageShsOut);
      const capexRatio = capex !== null && ni !== null && ni !== 0 ? Math.abs(capex) / Math.abs(ni) : null;
      const dilution = shNow !== null && shPrev !== null && shPrev !== 0 ? shNow / shPrev - 1 : null;
      const metrics = [metric("capexRatio", "Capex/NetIncome", capexRatio), metric("dilution", "Dilution", dilution)];
      const inc: string[] = [];
      const exc: string[] = [];
      let score = 0;
      if (capexRatio !== null && capexRatio < 1.2) { score += 1; inc.push("Capex i kontrollerad nivå mot earnings."); } else { exc.push("Capex-nivå osäker/hög."); }
      if (dilution !== null && dilution <= 0.03) { score += 1; inc.push("Begränsad utspädning."); } else { exc.push("Utspädning hög eller okänd."); }
      return finish(score, inc, exc, metrics);
    },
  },
  {
    id: "sector-cycle-stub",
    name: "Sector cycle positioning (stub)",
    category: "Optional",
    description: "Stub för framtida makro/sector-cycle integration.",
    checks: ["Manual cycle score"],
    ignores: ["Automatisk fasdetektion (ej implementerad)"],
    requiredFields: ["manual.cycleScore"],
    optionalFields: [],
    fallback: "Använd manuell cycleScore tills sektormodell byggs ut.",
    evaluate(snapshot) {
      const cycle = snapshot.manual?.cycleScore ?? null;
      const metrics = [metric("cycleScore", "Cycle score", cycle, "Manual stub", true)];
      const inc = cycle !== null && cycle > 0 ? ["Positiv manuell cykelposition."] : [];
      const exc = cycle !== null && cycle > 0 ? [] : ["Ingen cykelposition angiven ännu."];
      return finish(cycle !== null && cycle > 0 ? 1 : 0, inc, exc, metrics);
    },
  },
];

export function getPresetById(id: string) {
  return SCREENING_PRESETS.find((preset) => preset.id === id) ?? SCREENING_PRESETS[0];
}
