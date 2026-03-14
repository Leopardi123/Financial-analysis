export type TimelineOverlayEvent = {
  start: string;
  end?: string;
  label: string;
  description?: string;
};

export type TimelineOverlay = {
  id: string;
  name: string;
  category: string;
  color: string;
  style: "band" | "line" | "marker";
  events: TimelineOverlayEvent[];
};

export const MACRO_TIMELINE_OVERLAYS: TimelineOverlay[] = [
  {
    id: "global-unrest",
    name: "Global Unrest",
    category: "Geopolitical",
    color: "#7f1d1d",
    style: "band",
    events: [
      { start: "2001-09", label: "War on Terror", description: "Geopolitical and security shock after 9/11." },
      { start: "2008-09", label: "Global Financial Crisis unrest", description: "Social and political instability during the GFC." },
      { start: "2011-12", label: "Arab Spring", description: "Regional uprisings with broad macro spillovers." },
      { start: "2014-01", end: "2016-12", label: "Crimea / Ukraine tensions", description: "Rising geopolitical tensions around Ukraine." },
      { start: "2020-01", end: "2021-12", label: "Pandemic social unrest", description: "Pandemic-era social, labor and political instability." },
      { start: "2022-02", label: "Russia-Ukraine war", description: "War-driven macro fragmentation and risk repricing." },
      { start: "2023-10", label: "Israel-Hamas escalation", description: "Middle-East conflict escalation and risk spillovers." },
    ],
  },
  {
    id: "monetary-regime",
    name: "Monetary Regime",
    category: "Central bank liquidity",
    color: "#7c3aed",
    style: "band",
    events: [
      { start: "2000-01", end: "2007-12", label: "Pre-QE regime", description: "Conventional policy era before large-scale QE." },
      { start: "2008-01", end: "2014-12", label: "QE era", description: "Emergency and sustained quantitative easing." },
      { start: "2015-01", end: "2018-12", label: "Balance sheet normalization", description: "Early tightening/normalization attempt." },
      { start: "2020-01", end: "2021-12", label: "Pandemic QE", description: "Aggressive liquidity expansion during COVID." },
      { start: "2022-01", label: "QT regime", description: "Tightening cycle with balance-sheet runoff." },
    ],
  },
  {
    id: "commodity-shock",
    name: "Commodity Shock",
    category: "Commodity dislocation",
    color: "#f97316",
    style: "band",
    events: [
      { start: "2007-01", end: "2008-12", label: "Oil spike", description: "Crude and commodity shock into the GFC." },
      { start: "2010-01", end: "2012-12", label: "Commodity supercycle peak", description: "High commodity inflation and cycle peak." },
      { start: "2021-01", end: "2022-12", label: "Energy shock", description: "Global energy dislocation and inflation impulse." },
      { start: "2022-01", end: "2023-12", label: "European gas crisis", description: "European gas market stress and volatility." },
    ],
  },
  {
    id: "credit-stress",
    name: "Credit Stress",
    category: "Systemic credit",
    color: "#334155",
    style: "band",
    events: [
      { start: "2007-01", end: "2009-12", label: "Global credit crisis", description: "Systemic funding and solvency stress." },
      { start: "2011-01", end: "2012-12", label: "Euro sovereign crisis", description: "Sovereign-bank doom loop in the euro area." },
      { start: "2020-01", end: "2020-12", label: "COVID liquidity crisis", description: "Market liquidity seizure and policy backstop." },
      { start: "2023-01", end: "2023-12", label: "Regional bank crisis", description: "US regional-bank stress and spillovers." },
    ],
  },
  {
    id: "housing-cycle",
    name: "Housing Cycle",
    category: "Housing macro phase",
    color: "#0f766e",
    style: "band",
    events: [
      { start: "2000-01", end: "2006-12", label: "US housing bubble", description: "Credit-fueled housing expansion." },
      { start: "2007-01", end: "2012-12", label: "Housing crash", description: "Housing and mortgage downturn phase." },
      { start: "2020-01", end: "2022-12", label: "Pandemic housing boom", description: "Rate-driven housing acceleration." },
      { start: "2022-01", label: "Housing tightening", description: "Affordability squeeze and volume slowdown." },
    ],
  },
  {
    id: "policy-shocks",
    name: "Policy Shocks",
    category: "Discrete events",
    color: "#eab308",
    style: "marker",
    events: [
      { start: "2001-09-11", label: "9/11", description: "Major geopolitical and market shock." },
      { start: "2008-09-15", label: "Lehman collapse", description: "Lehman bankruptcy intensified global crisis." },
      { start: "2020-03-23", label: "Fed unlimited QE", description: "Fed announced open-ended QE backstop." },
      { start: "2022-02-24", label: "Ukraine invasion", description: "Russia's invasion triggered major macro repricing." },
      { start: "2023-03-10", label: "SVB collapse", description: "Regional banking stress catalyst." },
    ],
  },
];

export function normalizeOverlayDate(value: string): string {
  if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`;
  return value;
}
