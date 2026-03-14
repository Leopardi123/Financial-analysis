export type MacroLabRegion = "US" | "EA";

export type MacroEventZone = {
  id: string;
  name: string;
  category:
    | "Financial crisis"
    | "Housing crash"
    | "QE / liquidity expansion"
    | "QT / tightening"
    | "Oil shock"
    | "Commodity boom"
    | "War / geopolitical shock"
    | "High growth / expansion"
    | "Recession"
    | "Disinflation"
    | "Inflation spike"
    | "Euro crisis"
    | "Pandemic shock";
  description: string;
  startDate: string;
  endDate: string;
  region: MacroLabRegion | "GLOBAL";
  color: string;
  icon: string;
};

export const MACRO_LAB_EVENT_ZONES: MacroEventZone[] = [
  { id: "us-dotcom-bust", name: "Dotcom bust", category: "Recession", description: "Tech bubble unwind and growth slowdown.", startDate: "2000-03-01", endDate: "2002-10-01", region: "US", color: "#d97706", icon: "📉" },
  { id: "us-housing-crash", name: "Housing crash", category: "Housing crash", description: "US housing and credit deterioration before the GFC peak.", startDate: "2006-01-01", endDate: "2008-06-01", region: "US", color: "#b45309", icon: "🏚️" },
  { id: "global-gfc", name: "Global Financial Crisis", category: "Financial crisis", description: "Systemic credit shock and recession across major economies.", startDate: "2007-10-01", endDate: "2009-06-01", region: "GLOBAL", color: "#991b1b", icon: "🏦" },
  { id: "us-qe1-qe3", name: "QE1 / QE2 / QE3", category: "QE / liquidity expansion", description: "Large-scale balance sheet expansion and liquidity support.", startDate: "2008-11-01", endDate: "2014-10-01", region: "US", color: "#2563eb", icon: "💧" },
  { id: "ea-euro-crisis", name: "Euro crisis", category: "Euro crisis", description: "Sovereign stress and financial fragmentation in the euro area.", startDate: "2010-05-01", endDate: "2012-12-01", region: "EA", color: "#7c3aed", icon: "🇪🇺" },
  { id: "ea-ecb-qe", name: "ECB QE", category: "QE / liquidity expansion", description: "ECB asset purchase programs and liquidity easing.", startDate: "2015-03-01", endDate: "2018-12-01", region: "EA", color: "#1d4ed8", icon: "🏛️" },
  { id: "global-covid-shock", name: "Pandemic shock", category: "Pandemic shock", description: "COVID recession shock, policy easing and re-opening rebound.", startDate: "2020-02-01", endDate: "2021-06-01", region: "GLOBAL", color: "#0f766e", icon: "🦠" },
  { id: "global-inflation-spike", name: "Inflation spike 2021–2023", category: "Inflation spike", description: "Broad inflation surge, tightening cycles and growth slowdown.", startDate: "2021-01-01", endDate: "2023-12-01", region: "GLOBAL", color: "#dc2626", icon: "🔥" },
  { id: "ea-energy-crisis", name: "Energy crisis", category: "Oil shock", description: "Energy price shock and terms-of-trade pressure in Europe.", startDate: "2021-09-01", endDate: "2023-03-01", region: "EA", color: "#ea580c", icon: "⛽" },
  { id: "us-qt-cycle", name: "US QT / hiking cycle", category: "QT / tightening", description: "Fast policy-rate hikes and quantitative tightening.", startDate: "2022-03-01", endDate: "2024-01-01", region: "US", color: "#334155", icon: "🏹" },
  { id: "global-war-shock", name: "War / geopolitical shock", category: "War / geopolitical shock", description: "Geopolitical escalation with commodity and risk spillovers.", startDate: "2022-02-01", endDate: "2023-12-01", region: "GLOBAL", color: "#7f1d1d", icon: "🛰️" },
];
