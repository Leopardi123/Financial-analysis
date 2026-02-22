import { useEffect, useMemo, useState } from "react";
import Admin from "./Admin";
import Viewer from "./Viewer";
import ChartCard from "./ChartCard";
import CompanyPicker from "./CompanyPicker";
import InfoPopover from "./InfoPopover";
import useCompanyData from "../hooks/useCompanyData";
import {
  buildSeries,
  buildSeriesData,
  buildRoeSeries,
  buildCurrentRatioSeries,
  buildDebtToEquitySeries,
  buildAdjustedDebtToEquitySeries,
  buildLongTermDebtToNetEarningsSeries,
  buildCashVsNetEarningsSeries,
  buildOperatingProfitVsDepSeries,
  buildOperatingIncomeVsInterestSeries,
  buildNetEarningsPerShareSeries,
  computeNetEarningsSeries,
  buildCapitalExpenditureVsNetEarningsSeries,
  buildBuybacksDividendsSeries,
  buildRevenueGrowthSeries,
  buildFreeCashFlowPerShareSeries,
} from "../utils/financial";

const CATEGORIES = ["Välj En Kategori", "Tech", "Industrials", "Consumer"];
const SUBCATEGORIES = ["Välj En Subkategori", "Software", "Hardware", "Services"];



type ProducerCorePanel = {
  efficiency?: {
    margin_structure?: { operating_margin?: number | null };
    returns?: { roe?: number | null };
    balance_sheet?: { net_debt?: number | null; interest_coverage?: number | null };
  };
};

type RrOverlayPanel = {
  rr_scale_flag?: string | null;
  rr_roce_flag?: string | null;
  rr_fortress_flag?: boolean | null;
  rr_classification?: string | null;
  rr_interest_coverage?: number | null;
  rr_cost_quartile_flags?: { missing_benchmark?: boolean };
  rr_reserve_life_flags?: { missing_reserves?: boolean };
  [key: string]: unknown;
};

function formatPanelValue(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
    });
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  return "—";
}



type CompactMetric = { label: string; value: unknown; infoKey?: string };

function renderCompactMetrics(
  sectionKey: string,
  metrics: CompactMetric[],
  openInfoId: string | null,
  setOpenInfoId: (next: string | null | ((prev: string | null) => string | null)) => void,
) {
  return metrics.map((metric) => {
    const metricId = `${sectionKey}-${metric.label}`;
    const info = metricInfoMap[metric.infoKey ?? metric.label] ?? {
      title: metric.label,
      body: "Vad består måttet av: rapporterade finansiella data. Vad säger det: en snabb signal om kvalitet/värdering/risk. Hur tolkas det: följ trend och nivå tillsammans. Ramverk: Buffetology/Syding/RR beroende på kontext.",
    };
    return (
      <div key={metricId} className="compact-metric-row">
        <span className="compact-metric-label-wrap">
          <span className="compact-metric-label">{metric.label}</span>
          <InfoPopover
            id={metricId}
            openId={openInfoId}
            onToggle={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
            onClose={() => setOpenInfoId(null)}
            title={info.title}
            content={[info.body]}
          />
        </span>
        <span className="compact-metric-dots" />
        <span className="compact-metric-value">{formatPanelValue(metric.value)}</span>
      </div>
    );
  });
}

type AnalysisMode = "revenue" | "prerevenue";

function readModeFromUrl(): AnalysisMode {
  if (typeof window === "undefined") return "revenue";
  const params = new URLSearchParams(window.location.search);
  const mode = (params.get("mode") ?? "").toLowerCase();
  return mode === "prerevenue" ? "prerevenue" : "revenue";
}

const EFFICIENCY_INFO = [
  "Visar hur väl bolaget omvandlar intäkter till vinst och kassaflöde samt hur kapital används.",
  "Bygger på rapporterade siffror och kombinerar Buffetology-kvalitet med Syding-trender.",
];

const RESILIENCE_INFO = [
  "Visar finansiell robusthet via skuld, likviditet och kassaflödesstabilitet.",
  "RR-lins: lägre nettoskuld mot kassaflöde och god räntetäckning ökar överlevnadsförmåga.",
];

const VALUE_INFO = [
  "Visar värdering med strikt separation mellan equity-basis och enterprise-basis.",
  "Syding-lins: implied return används som enkel heuristik för framåtblickande avkastning.",
];

const RR_INFO = [
  "Corporate earning-power och kapitaldisciplin enligt RR-inspirerat filter.",
  "Fokuserar på skala, avkastning på kapital och balansräkningens styrka.",
];

const metricInfoMap: Record<string, { title: string; body: string }> = {
  "Efficiency": { title: "Efficiency", body: "**Vad det m\u00e4ter**\nSamlad signal f\u00f6r l\u00f6nsamhet, kassakonvertering och kapitaldisciplin i k\u00e4rnaff\u00e4ren.\n\n**Hur det ber\u00e4knas**\n- Steg 1: L\u00e4s delm\u00e5tten f\u00f6r marginal, kassafl\u00f6de, skuld och avkastning.\n- Steg 2: V\u00e4g ihop niv\u00e5 + riktning i flera \u00e5r, inte ett enskilt \u00e5r.\n- Formel: Ingen enskild formel: sektionen \u00e4r en aggregerad l\u00e4sning av flera nyckeltal.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: Bra n\u00e4r majoriteten av delm\u00e5tten ligger i bra-zon; varning n\u00e4r flera ligger i r\u00f6d zon samtidigt.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: stark marginal + god kassakonvertering + kontrollerad skuld. Ok: blandade signaler. Varning: svag konvertering och stigande skuld.\n- Vad betyder ett extremt v\u00e4rde: Extremt stark sektion kan vara cykeltopp; extremt svag kan vara tillf\u00e4llig eng\u00e5ngseffekt.\n\n**Vanliga fallgropar**\n- Sektionen \u00e4r inte ett matematiskt score; kontrollera alltid delm\u00e5tt och periodisering.\n\n**Ramverk**\n- Buffetology + Syding + RR: kvalitet, trend och balansrisk l\u00e4ses tillsammans." },
  "gross_margin": { title: "Gross margin", body: "**Vad det m\u00e4ter**\nHur stor andel av int\u00e4kterna som blir kvar efter direkta kostnader.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ta bruttoresultat.\n- Steg 2: Dela med int\u00e4kter.\n- Formel: Bruttomarginal = bruttoresultat / int\u00e4kter.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: Varierar per bransch: \u00e5terf\u00f6rs\u00e4ljning ofta 10\u201340 %, mjukvara ofta 60\u201390 %.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: stabil eller stigande inom sin bransch. Ok: stabil men pressad. Varning: snabb fler\u00e5rig nedg\u00e5ng.\n- Vad betyder ett extremt v\u00e4rde: Extremt h\u00f6g kan bero p\u00e5 eng\u00e5ngsmix/prisryck; extremt l\u00e5g kan signalera svag priss\u00e4ttning.\n\n**Vanliga fallgropar**\n- J\u00e4mf\u00f6r inte niv\u00e5 rakt mellan olika aff\u00e4rsmodeller; anv\u00e4nd historik och peers.\n\n**Ramverk**\n- Buffetology: m\u00e4ter vallgrav via priss\u00e4ttningskraft och kostnadsf\u00f6rdel." },
  "operating_margin": { title: "Operating margin", body: "**Vad det m\u00e4ter**\nK\u00e4rnverksamhetens l\u00f6nsamhet f\u00f6re r\u00e4nta och skatt.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ta r\u00f6relseresultat (EBIT).\n- Steg 2: Dela med int\u00e4kter.\n- Formel: R\u00f6relsemarginal = EBIT / int\u00e4kter.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: <5 % svagt i de flesta cykliska bolag, 5\u201315 % ok, >15 % starkt (branschberoende).\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: uth\u00e5lligt >15 % eller tydligt stigande trend. Ok: 5\u201315 %. Varning: under 5 % i flera \u00e5r.\n- Vad betyder ett extremt v\u00e4rde: Extremt h\u00f6g kan vara tempor\u00e4r kostnadsbesparing; extremt l\u00e5g kan f\u00f6reb\u00e5da kapitalbehov.\n\n**Vanliga fallgropar**\n- Omklassificeringar och eng\u00e5ngsposter kan flytta EBIT kraftigt mellan \u00e5r.\n\n**Ramverk**\n- Buffetology + Syding: kvalitet i operationen och trend \u00f6ver tid." },
  "net_margin": { title: "Net margin", body: "**Vad det m\u00e4ter**\nSlutlig vinstmarginal efter r\u00e4nta, skatt och \u00f6vriga poster.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ta nettoresultat.\n- Steg 2: Dela med int\u00e4kter.\n- Formel: Nettomarginal = nettoresultat / int\u00e4kter.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: <3 % tunn, 3\u201310 % ok, >10 % stark f\u00f6r m\u00e5nga mogna bolag.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: stabilt positiv och v\u00e4xande. Ok: positiv men volatil. Varning: \u00e5terkommande negativ.\n- Vad betyder ett extremt v\u00e4rde: Extremt h\u00f6g/l\u00e5g drivs ofta av skatt, nedskrivning eller eng\u00e5ngsvinst.\n\n**Vanliga fallgropar**\n- Nettomarginal blandar drift och finansiering; anv\u00e4nd tillsammans med r\u00f6relsemarginal.\n\n**Ramverk**\n- Syding: visar vad som faktiskt blir kvar till \u00e4gare." },
  "margin_trend_label": { title: "Margin trend", body: "**Vad det m\u00e4ter**\nRiktningen i marginalutvecklingen \u00f6ver flera \u00e5r.\n\n**Hur det ber\u00e4knas**\n- Steg 1: M\u00e4t f\u00f6r\u00e4ndring i marginalniv\u00e5 mellan start och slutperiod.\n- Steg 2: Klassificera som f\u00f6rb\u00e4ttras, stabil eller f\u00f6rs\u00e4mras.\n- Formel: Trend = lutning/skillnad i marginal \u00f6ver 3\u20135 \u00e5r.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: F\u00f6rb\u00e4ttras = positiv lutning, stabil = n\u00e4ra noll, f\u00f6rs\u00e4mras = negativ lutning.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: uth\u00e5lligt positiv trend. Ok: stabil. Varning: negativ trend flera \u00e5r i rad.\n- Vad betyder ett extremt v\u00e4rde: Extrem lutning \u00e5t b\u00e5da h\u00e5ll kan vara baseffekt efter kris eller topp\u00e5r.\n\n**Vanliga fallgropar**\n- Trendetikett s\u00e4ger riktning, inte niv\u00e5; l\u00e5g men f\u00f6rb\u00e4ttrad kan fortfarande vara svag.\n\n**Ramverk**\n- Syding: f\u00f6r\u00e4ndringstakt \u00e4r central f\u00f6r multipelutveckling." },
  "ocf_to_ni": { title: "OCF / NI", body: "**Vad det m\u00e4ter**\nOm redovisad vinst omvandlas till operativt kassafl\u00f6de.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ta kassafl\u00f6de fr\u00e5n l\u00f6pande verksamhet.\n- Steg 2: Dela med nettoresultat.\n- Formel: OCF/NI = operativt kassafl\u00f6de / nettoresultat.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: <0.8 svagt, 0.8\u20131.2 ok, >1.2 starkt \u00f6ver tid.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: \u00f6ver 1 i flera \u00e5r. Ok: runt 1. Varning: tydligt under 1 upprepat.\n- Vad betyder ett extremt v\u00e4rde: Extremt h\u00f6gt/l\u00e5gt kan vara r\u00f6relsekapitalsv\u00e4ngningar.\n\n**Vanliga fallgropar**\n- Fritt kassafl\u00f6de kan \u00e4nd\u00e5 vara svagt \u00e4ven om OCF/NI ser bra ut.\n\n**Ramverk**\n- Buffetology: earnings quality via kassakonvertering." },
  "fcf_to_ni": { title: "FCF / NI", body: "**Vad det m\u00e4ter**\nHur stor del av vinsten som blir fritt kassafl\u00f6de efter investeringar.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ber\u00e4kna fritt kassafl\u00f6de = operativt kassafl\u00f6de minus investeringar.\n- Steg 2: Dela med nettoresultat.\n- Formel: FCF/NI = fritt kassafl\u00f6de / nettoresultat.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: <0.5 svagt, 0.5\u20131.0 ok, >1.0 starkt i mogna bolag.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: n\u00e4ra eller \u00f6ver 1 \u00f6ver cykel. Ok: 0.5\u20131. Varning: ofta negativt.\n- Vad betyder ett extremt v\u00e4rde: Extremt h\u00f6gt kan bero p\u00e5 tillf\u00e4lligt l\u00e5g capex; extremt l\u00e5gt kan bero p\u00e5 expansionsfas.\n\n**Vanliga fallgropar**\n- Tillv\u00e4xtinvesteringar kan pressa kvoten kortsiktigt utan att caset \u00e4r d\u00e5ligt.\n\n**Ramverk**\n- Buffetology: fokus p\u00e5 kassafl\u00f6deskvalitet, inte bara bokf\u00f6ringsvinst." },
  "accrual_flag": { title: "Accrual", body: "**Vad det m\u00e4ter**\nVarningsflagga f\u00f6r svag kassakonvertering relativt redovisad vinst.\n\n**Hur det ber\u00e4knas**\n- Steg 1: J\u00e4mf\u00f6r operativt kassafl\u00f6de mot nettoresultat \u00f6ver flera perioder.\n- Steg 2: S\u00e4tt flagga n\u00e4r kassafl\u00f6det ofta underskrider vinsten.\n- Formel: Flagga = sann om OCF/NI \u00e5terkommande \u00e4r l\u00e5gt.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: Flagga falsk = normalt, flagga sann = riskzon.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: ingen flagga. Ok: tillf\u00e4lligt flaggad en period. Varning: flagga i flera \u00e5r.\n- Vad betyder ett extremt v\u00e4rde: Extremt ih\u00e5llande flagga kan indikera aggressiv int\u00e4ktsredovisning.\n\n**Vanliga fallgropar**\n- S\u00e4song och r\u00f6relsekapital kan ge falska signaler i enstaka \u00e5r.\n\n**Ramverk**\n- Buffetology: skydd mot l\u00e5g kvalitet i redovisad vinst." },
  "capex_to_revenue": { title: "Capex / Revenue", body: "**Vad det m\u00e4ter**\nKapitalintensitet: hur stor investeringsb\u00f6rda int\u00e4ktsbasen kr\u00e4ver.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ta absoluta investeringar (capex).\n- Steg 2: Dela med int\u00e4kter.\n- Formel: Capex/Revenue = |capex| / int\u00e4kter.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: <5 % l\u00e5g intensitet, 5\u201315 % medel, >15 % h\u00f6g (branschberoende).\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: l\u00e5g eller fallande utan att tillv\u00e4xt skadas. Ok: stabil medel. Varning: h\u00f6g och stigande.\n- Vad betyder ett extremt v\u00e4rde: Extremt l\u00e5g kan betyda underinvestering; extremt h\u00f6g kan pressa framtida avkastning.\n\n**Vanliga fallgropar**\n- H\u00f6g capex \u00e4r inte alltid negativt om avkastningen p\u00e5 investerat kapital \u00e4r h\u00f6g.\n\n**Ramverk**\n- Buffetology: bed\u00f6mer kapitalbehovets tyngd." },
  "capex_to_ocf": { title: "Capex / OCF", body: "**Vad det m\u00e4ter**\nHur stor del av operativt kassafl\u00f6de som \u00e4ts upp av investeringar.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ta absoluta investeringar.\n- Steg 2: Dela med operativt kassafl\u00f6de.\n- Formel: Capex/OCF = |capex| / operativt kassafl\u00f6de.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: <40 % stark flexibilitet, 40\u201380 % ok, >80 % pressat.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: l\u00e5g andel. Ok: medelniv\u00e5. Varning: n\u00e4ra eller \u00f6ver 100 % under l\u00e4ngre tid.\n- Vad betyder ett extremt v\u00e4rde: Extremt h\u00f6gt kan kr\u00e4va ny finansiering om det blir varaktigt.\n\n**Vanliga fallgropar**\n- Negativt eller mycket l\u00e5gt OCF g\u00f6r kvoten instabil eller missvisande.\n\n**Ramverk**\n- Buffetology: visar hur mycket kassafl\u00f6de som verkligen blir fritt." },
  "ppe_vs_revenue_signal": { title: "PPE vs Revenue", body: "**Vad det m\u00e4ter**\nOm anl\u00e4ggningstillg\u00e5ngar v\u00e4xer snabbare eller l\u00e5ngsammare \u00e4n int\u00e4kter.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ber\u00e4kna tillv\u00e4xt i materiella tillg\u00e5ngar (PPE).\n- Steg 2: Ber\u00e4kna tillv\u00e4xt i int\u00e4kter och j\u00e4mf\u00f6r.\n- Formel: Signal = PPE-tillv\u00e4xt minus int\u00e4ktstillv\u00e4xt.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: Positiv stor skillnad = risk f\u00f6r \u00f6verinvestering, n\u00e4ra noll = balans, negativ = b\u00e4ttre utnyttjande.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: int\u00e4kter minst i takt med PPE. Ok: sm\u00e5 avvikelser. Varning: PPE l\u00e5ngt f\u00f6re int\u00e4kter i flera \u00e5r.\n- Vad betyder ett extremt v\u00e4rde: Extrem positiv skillnad kan f\u00f6reg\u00e5 nedskrivningar/l\u00e5g avkastning.\n\n**Vanliga fallgropar**\n- F\u00f6rv\u00e4rv och redovisnings\u00e4ndringar kan bl\u00e5sa upp PPE utan organisk expansion.\n\n**Ramverk**\n- Syding: kapitalallokering och effektiv tillv\u00e4xt." },
  "net_debt": { title: "Net debt", body: "**Vad det m\u00e4ter**\nNettoskuld: r\u00e4nteb\u00e4rande skuld minus kassa.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Summera r\u00e4nteb\u00e4rande skulder.\n- Steg 2: Subtrahera kassa och likvida medel.\n- Formel: Nettoskuld = total skuld \u2212 kassa.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: Negativ nettoskuld = nettokassa, 0\u2013m\u00e5ttlig = hanterbar, h\u00f6g positiv = h\u00f6g risk.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: nettokassa eller l\u00e5g nettoskuld. Ok: hanterbar niv\u00e5 mot kassafl\u00f6de. Varning: snabbt stigande niv\u00e5.\n- Vad betyder ett extremt v\u00e4rde: Extremt h\u00f6g nettoskuld minskar handlingsutrymme i l\u00e5gkonjunktur.\n\n**Vanliga fallgropar**\n- Lease-effekter och kortsiktiga kassaf\u00f6r\u00e4ndringar kan f\u00f6rvr\u00e4nga bilden.\n\n**Ramverk**\n- RR + Buffetology: balansstyrka och \u00f6verlevnadsmarginal." },
  "net_debt_to_ebitda": { title: "Net debt / EBITDA", body: "**Vad det m\u00e4ter**\nSkuldb\u00f6rda relativt l\u00f6pande r\u00f6relseresultat f\u00f6re avskrivningar.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ber\u00e4kna nettoskuld.\n- Steg 2: Dela med EBITDA.\n- Formel: Nettoskuld/EBITDA = nettoskuld / EBITDA.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: <1.5 starkt, 1.5\u20133 ok, >3 varning, >4.5 h\u00f6g risk.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: under 1.5. Ok: 1.5\u20133. Varning: \u00f6ver 3 under l\u00e4ngre tid.\n- Vad betyder ett extremt v\u00e4rde: Extremt h\u00f6gt vid l\u00e5g EBITDA kan signalera refinansieringsrisk.\n\n**Vanliga fallgropar**\n- I cykliska bolag kan EBITDA-toppar g\u00f6ra skulden se f\u00f6r l\u00e5g ut precis innan nedg\u00e5ng.\n\n**Ramverk**\n- RR: k\u00e4rnm\u00e5tt f\u00f6r finansiell robusthet." },
  "interest_coverage": { title: "Interest coverage", body: "**Vad det m\u00e4ter**\nHur m\u00e5nga g\u00e5nger r\u00f6relseresultatet t\u00e4cker r\u00e4ntekostnaden.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ta EBIT.\n- Steg 2: Dela med r\u00e4ntekostnad.\n- Formel: R\u00e4ntet\u00e4ckning = EBIT / r\u00e4ntekostnad.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: <1.5 stress, 1.5\u20133 sk\u00f6rt, 3\u20138 ok, >8 starkt.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: \u00f6ver 8. Ok: 3\u20138. Varning: under 3, s\u00e4rskilt under 1.5.\n- Vad betyder ett extremt v\u00e4rde: Extremt h\u00f6gt kan bero p\u00e5 tillf\u00e4lligt l\u00e5g r\u00e4nta eller eng\u00e5ngsvinst.\n\n**Vanliga fallgropar**\n- Om r\u00e4ntekostnad \u00e4r n\u00e4ra noll blir kvoten instabil och mindre informativ.\n\n**Ramverk**\n- RR + Buffetology: motst\u00e5ndskraft mot h\u00f6gre finansieringskostnad." },
  "debt_trend_label": { title: "Debt trend", body: "**Vad det m\u00e4ter**\nRiktningen i skulds\u00e4ttningen \u00f6ver flera \u00e5r.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ber\u00e4kna nettoskuld per \u00e5r.\n- Steg 2: M\u00e4t lutning/f\u00f6r\u00e4ndring \u00f6ver 3\u20135 \u00e5r.\n- Formel: Trend = stigande, stabil eller fallande nettoskuld.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: Fallande trend b\u00e4st, stabil neutral, stigande varning vid svag l\u00f6nsamhet.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: tydligt fallande. Ok: stabil. Varning: stigande snabbare \u00e4n kassafl\u00f6de.\n- Vad betyder ett extremt v\u00e4rde: Extremt snabb skuld\u00f6kning signalerar ofta kapitalstress eller aggressiva f\u00f6rv\u00e4rv.\n\n**Vanliga fallgropar**\n- Skuld\u00f6kning kan vara rimlig om kapital g\u00e5r till h\u00f6gavkastande projekt; kontrollera ROIC.\n\n**Ramverk**\n- Syding + RR: trend + riskdisciplin." },
  "roe": { title: "ROE", body: "**Vad det m\u00e4ter**\nAvkastning p\u00e5 eget kapital till aktie\u00e4garna.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ta nettoresultat.\n- Steg 2: Dela med genomsnittligt eget kapital.\n- Formel: ROE = nettoresultat / eget kapital.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: <8 % svagt, 8\u201315 % ok, >15 % starkt f\u00f6r m\u00e5nga sektorer.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: uth\u00e5lligt \u00f6ver 15 % utan h\u00f6g skuld. Ok: 8\u201315 %. Varning: l\u00e5g/volatil ROE.\n- Vad betyder ett extremt v\u00e4rde: Extremt h\u00f6g ROE kan komma av litet eget kapital efter stora \u00e5terk\u00f6p.\n\n**Vanliga fallgropar**\n- H\u00f6g ROE med h\u00f6g skuld \u00e4r mindre kvalitativ \u00e4n h\u00f6g ROE med stark balans.\n\n**Ramverk**\n- Buffetology: klassiskt kvalitetsm\u00e5tt, men ska skuldkontrolleras." },
  "roic_pre_tax": { title: "ROIC pre-tax", body: "**Vad det m\u00e4ter**\nProxy f\u00f6r avkastning p\u00e5 investerat kapital f\u00f6re skatt.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ta r\u00f6relseresultat (EBIT).\n- Steg 2: Ber\u00e4kna kapitalbasen: totala tillg\u00e5ngar \u2212 kortfristiga skulder \u2212 kassa.\n- Formel: ROIC (pre-tax proxy) = EBIT / (totala tillg\u00e5ngar \u2212 kortfristiga skulder \u2212 kassa).\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: <8 % svagt, 8\u201315 % ok, >15 % starkt, >30 % mycket starkt (branschberoende).\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: \u00f6ver 15 % \u00f6ver tid. Ok: 8\u201315 %. Varning: under 8 %.\n- Vad betyder ett extremt v\u00e4rde: Extremt h\u00f6gt kan uppst\u00e5 n\u00e4r n\u00e4mnaren blir liten efter \u00e5terk\u00f6p eller r\u00f6relsekapitalstruktur.\n\n**Vanliga fallgropar**\n- Detta \u00e4r en proxy och skiljer sig fr\u00e5n standarddefinitioner av invested capital; j\u00e4mf\u00f6r f\u00f6rsiktigt mellan bolag.\n\n**Ramverk**\n- Buffetology + RR: m\u00e4ter kapitaleffektivitet och disciplin." },
  "roe_trend_5Y": { title: "ROE trend 5Y", body: "**Vad det m\u00e4ter**\nFem\u00e5rig riktning i avkastning p\u00e5 eget kapital.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ber\u00e4kna ROE per \u00e5r.\n- Steg 2: M\u00e4t f\u00f6r\u00e4ndring \u00f6ver fem \u00e5r (niv\u00e5 och lutning).\n- Formel: ROE-trend = skillnad/lutning mellan start och slut.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: >+2 procentenheter \u00f6ver 5 \u00e5r positivt, \u00b12 ungef\u00e4r stabilt, <-2 negativt.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: tydligt positiv trend. Ok: stabil. Varning: uth\u00e5lligt negativ trend.\n- Vad betyder ett extremt v\u00e4rde: Extrem f\u00f6rb\u00e4ttring kan vara \u00e5terh\u00e4mtning fr\u00e5n svagt bas\u00e5r, inte n\u00f6dv\u00e4ndigtvis ny normal.\n\n**Vanliga fallgropar**\n- Bas\u00e5r med eng\u00e5ngsf\u00f6rlust/vinst kan f\u00f6rvr\u00e4nga trenden kraftigt.\n\n**Ramverk**\n- Syding: f\u00f6r\u00e4ndringsriktning driver ofta framtida omv\u00e4rdering." },
  "shares_trend_5Y": { title: "Shares trend 5Y", body: "**Vad det m\u00e4ter**\nUtsp\u00e4dning eller \u00e5terk\u00f6p \u00f6ver fem \u00e5r.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ta aktieantal per \u00e5r.\n- Steg 2: Ber\u00e4kna \u00e5rlig tillv\u00e4xttakt \u00f6ver fem \u00e5r.\n- Formel: Trend = CAGR i utest\u00e5ende aktier.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: <0 % aktie\u00e4garv\u00e4nligt, 0\u20132 % ok, >2 % varning f\u00f6r utsp\u00e4dning.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: negativ eller l\u00e5g positiv trend. Ok: n\u00e4ra noll. Varning: h\u00f6g positiv trend.\n- Vad betyder ett extremt v\u00e4rde: Extrem negativ trend kan bero p\u00e5 stora \u00e5terk\u00f6p finansierade med skuld.\n\n**Vanliga fallgropar**\n- Emissioner vid f\u00f6rv\u00e4rv/kris kan vara rationella; tolkas med kapitalavkastning och skuld.\n\n**Ramverk**\n- Buffetology: skydd av \u00e4garandel \u00f6ver tid." },
  "retained_vs_ni_signal": { title: "Retained vs NI", body: "**Vad det m\u00e4ter**\nOm kvarh\u00e5llna vinster motsvarar historiskt intj\u00e4nad vinst.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Summera nettoresultat \u00f6ver perioden.\n- Steg 2: J\u00e4mf\u00f6r med f\u00f6r\u00e4ndring i balanserade vinstmedel.\n- Formel: Signal = f\u00f6r\u00e4ndring i retained earnings relativt kumulativt nettoresultat.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: N\u00e4ra 1 indikerar h\u00f6g retention, tydligt under 1 kan indikera l\u00e4ckage.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: h\u00f6g andel \u00e5terh\u00e5llen vinst med god avkastning. Ok: medelniv\u00e5. Varning: l\u00e5g andel utan tydlig utdelningspolicy.\n- Vad betyder ett extremt v\u00e4rde: Extrem skillnad kan bero p\u00e5 \u00e5terk\u00f6p, eng\u00e5ngsposter eller redovisningsteknik.\n\n**Vanliga fallgropar**\n- H\u00f6g retention \u00e4r bara bra om kapitalet \u00e5terinvesteras till h\u00f6g avkastning.\n\n**Ramverk**\n- Buffetology: kapitalallokering och \u00e4garv\u00e4rde." },
  "quality_flags": { title: "Quality flags", body: "**Vad det m\u00e4ter**\nSamling av positiva kvalitetsm\u00f6nster i kassafl\u00f6de, marginaler och balans.\n\n**Hur det ber\u00e4knas**\n- Steg 1: L\u00e4s varje delsignal (t.ex. stark kassakonvertering, stabila marginaler, fallande skuld, l\u00e5g dilution).\n- Steg 2: Summera antal positiva flaggor.\n- Formel: Total kvalitet = antal positiva flaggor av totalt antal test.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: 0\u20131 svagt, 2\u20133 ok, 4+ starkt kvalitetsm\u00f6nster.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: m\u00e5nga flaggor utan motstridiga riskflaggor. Ok: blandad bild. Varning: f\u00e5 flaggor.\n- Vad betyder ett extremt v\u00e4rde: Extremt m\u00e5nga flaggor kan komma sent i cykel n\u00e4r allt ser b\u00e4st ut.\n\n**Vanliga fallgropar**\n- Flaggor \u00e4r heuristik; de ers\u00e4tter inte full analys av noterna och segmentmix.\n\n**Ramverk**\n- Buffetology + Syding: strukturell kvalitet + trendbekr\u00e4ftelse." },
  "risk_flags": { title: "Risk flags", body: "**Vad det m\u00e4ter**\nSamling av risksignaler som ofta f\u00f6reg\u00e5r svag avkastning.\n\n**Hur det ber\u00e4knas**\n- Steg 1: L\u00e4s risksignaler (t.ex. negativ FCF, utsp\u00e4dning, marginalpress, svag konvertering).\n- Steg 2: Summera antal riskflaggor.\n- Formel: Total risk = antal riskflaggor av totalt antal test.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: 0 l\u00e5g risk, 1\u20132 medelrisk, 3+ h\u00f6g risk.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: f\u00e5 eller inga riskflaggor. Ok: enstaka flagga med tydlig f\u00f6rklaring. Varning: flera samtidiga flaggor.\n- Vad betyder ett extremt v\u00e4rde: Extremt m\u00e5nga flaggor \u00f6kar sannolikheten f\u00f6r nyemission, nedgradering eller multipelpress.\n\n**Vanliga fallgropar**\n- En enskild flagga kan vara \u00f6verg\u00e5ende; m\u00f6nster \u00f6ver tid \u00e4r viktigast.\n\n**Ramverk**\n- RR + Syding: riskscreening och skydd mot permanenta f\u00f6rluster." },
  "invalid_capital_employed": { title: "Invalid capital employed", body: "**Vad det m\u00e4ter**\nDatakvalitetsflagga f\u00f6r orimlig kapitalbas i avkastningsm\u00e5tt.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ber\u00e4kna kapitalbasen som anv\u00e4nds i ROCE/ROIC.\n- Steg 2: Kontrollera om n\u00e4mnaren blir noll, negativ eller uppenbart orimlig.\n- Formel: Flagga = sann n\u00e4r kapitalbasen inte \u00e4r analytiskt anv\u00e4ndbar.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: Falsk = m\u00e4tetalet kan anv\u00e4ndas, sann = m\u00e4tetalet \u00e4r os\u00e4kert.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: flagga falsk. Ok: tillf\u00e4llig sann vid extraordin\u00e4rt \u00e5r. Varning: \u00e5terkommande sann.\n- Vad betyder ett extremt v\u00e4rde: Extremt fall: mycket liten n\u00e4mnare ger artificiellt enorm ROCE/ROIC.\n\n**Vanliga fallgropar**\n- Negativt r\u00f6relsekapital och stora \u00e5terk\u00f6p kan ge tekniskt konstiga men inte alltid felaktiga utfall.\n\n**Ramverk**\n- RR: disciplin i datavalidering innan tolkning." },
  "ev_formula_check": { title: "EV formula check", body: "**Vad det m\u00e4ter**\nKontroll att enterprisev\u00e4rdet byggs konsekvent.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ta marknadsv\u00e4rde p\u00e5 eget kapital.\n- Steg 2: L\u00e4gg till r\u00e4nteb\u00e4rande skuld och dra av kassa.\n- Formel: Enterprisev\u00e4rde = marknadsv\u00e4rde + skuld \u2212 kassa.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: Sm\u00e5 avvikelser kan vara timing, stora avvikelser \u00e4r varning.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: check passerar. Ok: liten differens. Varning: stor differens mellan k\u00e4llor.\n- Vad betyder ett extremt v\u00e4rde: Extrem differens g\u00f6r EV-multiplar sv\u00e5rtolkade.\n\n**Vanliga fallgropar**\n- Minoritetsintressen, leasing och preferenskapital kan saknas beroende p\u00e5 datak\u00e4lla.\n\n**Ramverk**\n- Syding + RR: korrekt bas kr\u00e4vs f\u00f6r EV-analys." },
  "accounting_anomaly": { title: "Accounting anomaly", body: "**Vad det m\u00e4ter**\nFlagga f\u00f6r logiskt orimliga relationer i resultatkedjan.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Kontrollera om int\u00e4kter, bruttoresultat, EBIT och nettoresultat f\u00f6ljer rimlig ordning.\n- Steg 2: S\u00e4tt flagga vid tydliga brott mot grundlogik.\n- Formel: Exempeltest: int\u00e4kter \u2265 bruttoresultat \u2265 EBIT (f\u00f6renklat).\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: Falsk = ingen tydlig avvikelse, sann = datapunkt b\u00f6r granskas.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: falsk. Ok: enstaka sann med tydlig f\u00f6rklaring. Varning: \u00e5terkommande sann.\n- Vad betyder ett extremt v\u00e4rde: Extremt m\u00e5nga anomalier g\u00f6r tidsserieanalys op\u00e5litlig.\n\n**Vanliga fallgropar**\n- Olika redovisningsstandarder och omklassificeringar kan ge falska utslag.\n\n**Ramverk**\n- RR: kvalitetss\u00e4kring f\u00f6re slutsats." },
  "Resilience": { title: "Resilience", body: "**Vad det m\u00e4ter**\nSamlad bild av finansiell motst\u00e5ndskraft i svagare marknad.\n\n**Hur det ber\u00e4knas**\n- Steg 1: L\u00e4s leverage-, likviditets- och stabilitetsm\u00e5tt tillsammans.\n- Steg 2: Bed\u00f6m om bolaget kan klara l\u00e4gre intj\u00e4ning utan ny finansiering.\n- Formel: Ingen enskild formel: sektionen v\u00e4ger flera robusthetsm\u00e5tt.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: Bra n\u00e4r skuldm\u00e5tt \u00e4r l\u00e5ga, likviditet h\u00f6g och FCF-volatilitet l\u00e5g.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: majoritet gr\u00f6na m\u00e5tt. Ok: blandat. Varning: h\u00f6g skuld + l\u00e5g likviditet + volatil FCF.\n- Vad betyder ett extremt v\u00e4rde: Extrem svaghet signalerar refinansieringsrisk i stress.\n\n**Vanliga fallgropar**\n- Robusthet kan se stark ut i h\u00f6gkonjunktur; stresstesta med l\u00e4gre EBITDA.\n\n**Ramverk**\n- RR: \u00f6verlevnad och balansdisciplin \u00e4r centralt." },
  "current_ratio": { title: "Current ratio", body: "**Vad det m\u00e4ter**\nKortfristig betalningsf\u00f6rm\u00e5ga.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Summera oms\u00e4ttningstillg\u00e5ngar.\n- Steg 2: Dela med kortfristiga skulder.\n- Formel: Current ratio = oms\u00e4ttningstillg\u00e5ngar / kortfristiga skulder.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: <1 svagt, 1\u20131.5 ok, >1.5 starkare buffert.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: \u00f6ver 1.5 (branschberoende). Ok: 1\u20131.5. Varning: under 1.\n- Vad betyder ett extremt v\u00e4rde: Extremt h\u00f6gt kan tyda p\u00e5 ineffektivt kapital bundet i lager/kassa.\n\n**Vanliga fallgropar**\n- Lagerkvalitet och kundfordringar kan g\u00f6ra h\u00f6g kvot mindre trygg \u00e4n den ser ut.\n\n**Ramverk**\n- RR: likviditetsrisk p\u00e5 kort sikt." },
  "cash_vs_short_term_debt": { title: "Cash vs short debt", body: "**Vad det m\u00e4ter**\nHur v\u00e4l kassan t\u00e4cker kortfristig r\u00e4nteb\u00e4rande skuld.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ta kassa och likvida medel.\n- Steg 2: Dela med kortfristig skuld.\n- Formel: Kassa/kort skuld = kassa / kortfristig skuld.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: <0.5 svagt, 0.5\u20131 ok, >1 starkt.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: \u00f6ver 1. Ok: 0.5\u20131. Varning: under 0.5.\n- Vad betyder ett extremt v\u00e4rde: Extremt h\u00f6gt kan vara tillf\u00e4lligt efter emission eller avyttring.\n\n**Vanliga fallgropar**\n- Outnyttjade kreditlinor syns inte alltid; komplettera med finansieringsnoter.\n\n**Ramverk**\n- RR: direkt indikator f\u00f6r kortsiktig finansieringsstress." },
  "fcf_volatility_5Y": { title: "FCF volatility 5Y", body: "**Vad det m\u00e4ter**\nStabilitet i fritt kassafl\u00f6de \u00f6ver fem \u00e5r.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ber\u00e4kna standardavvikelse f\u00f6r FCF \u00f6ver 5 \u00e5r.\n- Steg 2: Dela med genomsnittligt FCF \u00f6ver samma period.\n- Formel: Volatilitet = standardavvikelse / medelv\u00e4rde.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: <0.4 l\u00e5g volatilitet, 0.4\u20131.0 medel, >1.0 h\u00f6g volatilitet.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: l\u00e5g och fallande volatilitet. Ok: medelniv\u00e5. Varning: h\u00f6g och stigande.\n- Vad betyder ett extremt v\u00e4rde: Extremt h\u00f6g uppst\u00e5r ofta n\u00e4r medel-FCF \u00e4r n\u00e4ra noll.\n\n**Vanliga fallgropar**\n- Sm\u00e5 absoluta tal kan ge \u00f6verdrivet h\u00f6g kvot; granska \u00e4ven niv\u00e5 i kronor.\n\n**Ramverk**\n- Syding + RR: f\u00f6ruts\u00e4gbarhet och robusthet." },
  "Value": { title: "Value", body: "**Vad det m\u00e4ter**\nSamlad v\u00e4rderingsbild med b\u00e5de equity- och EV-baserade m\u00e5tt.\n\n**Hur det ber\u00e4knas**\n- Steg 1: L\u00e4s equity-multiplar (p\u00e5 marknadsv\u00e4rde) separat fr\u00e5n EV-multiplar (p\u00e5 enterprisev\u00e4rde).\n- Steg 2: V\u00e4g med normaliserade l\u00f6nsamhetsm\u00e5tt och implied return.\n- Formel: Ingen enskild formel: sektionen \u00e4r en multipelmatris.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: Billigt/ok/dyrt bed\u00f6ms relativt historik, sektor och kvalitet.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: l\u00e5g v\u00e4rdering + h\u00f6g kvalitet. Ok: rimlig multipel med stabil kvalitet. Varning: h\u00f6g multipel utan st\u00f6d i kvalitet/tillv\u00e4xt.\n- Vad betyder ett extremt v\u00e4rde: Extremt l\u00e5g multipel kan signalera v\u00e4rdef\u00e4lla, inte fynd.\n\n**Vanliga fallgropar**\n- Blanda inte EV- och equity-baserade multiplar i samma j\u00e4mf\u00f6relse utan justering.\n\n**Ramverk**\n- Syding + Buffetology: pris kontra earning power och kvalitet." },
  "pe": { title: "P/E", body: "**Vad det m\u00e4ter**\nPris p\u00e5 eget kapital relativt vinst till aktie\u00e4gare.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ta marknadsv\u00e4rde p\u00e5 eget kapital (eller aktiekurs).\n- Steg 2: Dela med nettoresultat (eller EPS).\n- Formel: P/E = marknadsv\u00e4rde p\u00e5 eget kapital / nettoresultat.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: <10 ofta l\u00e5gt, 10\u201320 ofta normalt, >25 kr\u00e4ver stark tillv\u00e4xt/kvalitet.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: l\u00e5g/moderat P/E med h\u00e5llbar vinst. Ok: marknadsnormal. Varning: h\u00f6g P/E med svag konvertering.\n- Vad betyder ett extremt v\u00e4rde: Extremt h\u00f6gt/negativt blir sv\u00e5rtolkat vid l\u00e5g eller negativ vinst.\n\n**Vanliga fallgropar**\n- Eng\u00e5ngsvinster/f\u00f6rluster kan g\u00f6ra P/E missvisande; anv\u00e4nd normaliserad vinst.\n\n**Ramverk**\n- Buffetology: v\u00e4rdering av \u00e4garnas vinststr\u00f6m." },
  "earnings_yield": { title: "Earnings yield", body: "**Vad det m\u00e4ter**\nVinstavkastning p\u00e5 marknadsv\u00e4rde f\u00f6r eget kapital.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ta nettoresultat.\n- Steg 2: Dela med marknadsv\u00e4rde p\u00e5 eget kapital.\n- Formel: Earnings yield = nettoresultat / marknadsv\u00e4rde.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: <4 % dyrt, 4\u20138 % ok, >8 % billigt om kvaliteten h\u00e5ller.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: h\u00f6g yield med stabil vinst. Ok: medelniv\u00e5. Varning: l\u00e5g yield utan tillv\u00e4xtst\u00f6d.\n- Vad betyder ett extremt v\u00e4rde: Extremt h\u00f6g yield kan signalera att vinsten inte anses h\u00e5llbar.\n\n**Vanliga fallgropar**\n- J\u00e4mf\u00f6r inte direkt med obligationsr\u00e4nta utan riskjustering och cykeljustering.\n\n**Ramverk**\n- Syding: snabb avkastningsheuristik." },
  "p_fcf": { title: "P/FCF", body: "**Vad det m\u00e4ter**\nPris p\u00e5 eget kapital relativt fritt kassafl\u00f6de till \u00e4gare.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ta marknadsv\u00e4rde p\u00e5 eget kapital.\n- Steg 2: Dela med fritt kassafl\u00f6de.\n- Formel: P/FCF = marknadsv\u00e4rde p\u00e5 eget kapital / fritt kassafl\u00f6de.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: <12 ofta attraktivt, 12\u201320 ofta rimligt, >25 kr\u00e4ver stark tillv\u00e4xt.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: l\u00e5g multipel med stabil FCF. Ok: marknadsniv\u00e5. Varning: h\u00f6g multipel med volatil FCF.\n- Vad betyder ett extremt v\u00e4rde: Extremt h\u00f6g/negativ uppst\u00e5r vid mycket l\u00e5g eller negativ FCF.\n\n**Vanliga fallgropar**\n- FCF p\u00e5verkas av capex-cykel; anv\u00e4nd fler\u00e5rsmedel f\u00f6r r\u00e4ttvis bild.\n\n**Ramverk**\n- Buffetology: kassafl\u00f6desbaserad v\u00e4rdering." },
  "fcf_yield": { title: "FCF yield", body: "**Vad det m\u00e4ter**\nKassafl\u00f6desavkastning p\u00e5 marknadsv\u00e4rde f\u00f6r eget kapital.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ta fritt kassafl\u00f6de.\n- Steg 2: Dela med marknadsv\u00e4rde p\u00e5 eget kapital.\n- Formel: FCF-yield = fritt kassafl\u00f6de / marknadsv\u00e4rde.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: <3 % dyrt, 3\u20136 % ok, >6 % attraktivt om h\u00e5llbart.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: h\u00f6g och stabil yield. Ok: medelniv\u00e5. Varning: l\u00e5g eller negativ yield.\n- Vad betyder ett extremt v\u00e4rde: Extremt h\u00f6g yield kan signalera cykeltopp i FCF.\n\n**Vanliga fallgropar**\n- Eng\u00e5ngseffekter i r\u00f6relsekapital/capex kan ge falskt h\u00f6g eller l\u00e5g yield.\n\n**Ramverk**\n- Buffetology: \u00e4garkassafl\u00f6de i relation till pris." },
  "ev_ebitda": { title: "EV/EBITDA", body: "**Vad det m\u00e4ter**\nEnterprise-multipel f\u00f6re avskrivningar.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ber\u00e4kna enterprisev\u00e4rde: marknadsv\u00e4rde + skuld \u2212 kassa.\n- Steg 2: Dela med EBITDA.\n- Formel: EV/EBITDA = enterprisev\u00e4rde / EBITDA.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: <6 ofta l\u00e5gt, 6\u201310 ofta normalt, >12 kr\u00e4ver stark kvalitet/tillv\u00e4xt.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: l\u00e5g multipel med stabila marginaler. Ok: normal. Varning: h\u00f6g multipel i svag kvalitet.\n- Vad betyder ett extremt v\u00e4rde: Extremt l\u00e5g kan vara cykelrisk eller redovisningsbrus.\n\n**Vanliga fallgropar**\n- Enterprisebas: j\u00e4mf\u00f6r inte direkt mot P/E som \u00e4r equitybas.\n\n**Ramverk**\n- Syding: j\u00e4mf\u00f6r verksamhetsv\u00e4rde oavsett kapitalstruktur." },
  "ev_ebit": { title: "EV/EBIT", body: "**Vad det m\u00e4ter**\nEnterprise-multipel mot r\u00f6relseresultat.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ber\u00e4kna enterprisev\u00e4rde: marknadsv\u00e4rde + skuld \u2212 kassa.\n- Steg 2: Dela med EBIT.\n- Formel: EV/EBIT = enterprisev\u00e4rde / EBIT.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: <8 l\u00e5gt, 8\u201314 normalt, >18 h\u00f6gt (sektorberoende).\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: l\u00e5g/m\u00e5ttlig multipel med h\u00e5llbar EBIT. Ok: normal. Varning: h\u00f6g multipel med pressad EBIT.\n- Vad betyder ett extremt v\u00e4rde: Extremt h\u00f6gt vid l\u00e5g EBIT \u00e4r ofta varningssignal.\n\n**Vanliga fallgropar**\n- Enterprisebas och k\u00e4nsligt f\u00f6r redovisning av eng\u00e5ngsposter i EBIT.\n\n**Ramverk**\n- Syding: kapitalstrukturneutral v\u00e4rdering n\u00e4r avskrivningar spelar roll." },
  "ev_fcf": { title: "EV/FCF", body: "**Vad det m\u00e4ter**\nEnterprisev\u00e4rde relativt fritt kassafl\u00f6de.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ber\u00e4kna enterprisev\u00e4rde: marknadsv\u00e4rde + skuld \u2212 kassa.\n- Steg 2: Dela med fritt kassafl\u00f6de.\n- Formel: EV/FCF = enterprisev\u00e4rde / fritt kassafl\u00f6de.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: <10 ofta attraktivt, 10\u201318 ofta rimligt, >25 kr\u00e4ver stark tillv\u00e4xt.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: l\u00e5g multipel med robust FCF. Ok: medelniv\u00e5. Varning: h\u00f6g multipel och volatil FCF.\n- Vad betyder ett extremt v\u00e4rde: Extremt h\u00f6g/negativ uppst\u00e5r n\u00e4r FCF \u00e4r l\u00e5gt eller negativt.\n\n**Vanliga fallgropar**\n- Blanda inte enterprise- och equitybas i samma slutsats utan att justera nettoskuld.\n\n**Ramverk**\n- Syding + RR: v\u00e4rdering + balansstruktur." },
  "net_debt_over_ev": { title: "Net debt / EV", body: "**Vad det m\u00e4ter**\nHur stor andel av enterprisev\u00e4rdet som utg\u00f6rs av nettoskuld.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ber\u00e4kna nettoskuld.\n- Steg 2: Dela med enterprisev\u00e4rde (marknadsv\u00e4rde + skuld \u2212 kassa).\n- Formel: Nettoskuld/EV = nettoskuld / enterprisev\u00e4rde.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: <10 % l\u00e5g skuldtyngd, 10\u201330 % medel, >30 % h\u00f6g.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: l\u00e5g andel. Ok: medelniv\u00e5. Varning: h\u00f6g och stigande andel.\n- Vad betyder ett extremt v\u00e4rde: Extremt h\u00f6g andel g\u00f6r equity k\u00e4nsligt f\u00f6r sm\u00e5 \u00e4ndringar i verksamhetsv\u00e4rde.\n\n**Vanliga fallgropar**\n- Negativ nettoskuld (nettokassa) ger negativ kvot och annan riskprofil.\n\n**Ramverk**\n- RR: skuldrisk i relation till hela f\u00f6retagsv\u00e4rdet." },
  "median_ni_5y": { title: "Median NI (5Y)", body: "**Vad det m\u00e4ter**\nNormaliserad vinstniv\u00e5 genom cykeln.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Samla nettoresultat f\u00f6r fem \u00e5r.\n- Steg 2: Sortera och ta mittenv\u00e4rdet.\n- Formel: Median NI (5Y) = median av fem \u00e5rs nettoresultat.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: Stigande median \u00e4r positivt; fallande median varning.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: stabil/stigande positiv median. Ok: svagt positiv. Varning: l\u00e5g eller negativ median.\n- Vad betyder ett extremt v\u00e4rde: Extrem skillnad mot senaste \u00e5r signalerar cykeleffekt eller eng\u00e5ngspost.\n\n**Vanliga fallgropar**\n- Median d\u00e4mpar outliers men kan \u00e4nd\u00e5 d\u00f6ljas av strukturell trendbrott.\n\n**Ramverk**\n- Syding: normalisering av earning power." },
  "median_ebit_margin_5y": { title: "Median EBIT margin (5Y)", body: "**Vad det m\u00e4ter**\nNormaliserad r\u00f6relsemarginal \u00f6ver fem \u00e5r.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ber\u00e4kna EBIT-marginal per \u00e5r.\n- Steg 2: Ta median av fem observationer.\n- Formel: Median EBIT-marginal = median(EBIT/int\u00e4kter).\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: <5 % svagt, 5\u201315 % ok, >15 % starkt (branschberoende).\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: h\u00f6g/stabil median. Ok: medelniv\u00e5. Varning: l\u00e5g och fallande median.\n- Vad betyder ett extremt v\u00e4rde: Extrem skillnad mot senaste \u00e5r tyder ofta p\u00e5 cykel eller eng\u00e5ngar.\n\n**Vanliga fallgropar**\n- Median f\u00e5ngar inte senaste regimskifte direkt; kontrollera senaste 1\u20132 \u00e5r separat.\n\n**Ramverk**\n- Syding: cykelrensad l\u00f6nsamhetsbas." },
  "median_fcf_5y": { title: "Median FCF (5Y)", body: "**Vad det m\u00e4ter**\nNormaliserat fritt kassafl\u00f6de, anv\u00e4nds som FV2-input.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ber\u00e4kna fritt kassafl\u00f6de per \u00e5r i fem \u00e5r.\n- Steg 2: Ta medianv\u00e4rdet.\n- Formel: Median FCF (5Y) = median av fem \u00e5rs fritt kassafl\u00f6de.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: Positiv och stabil median kr\u00e4vs f\u00f6r robust v\u00e4rdering.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: tydligt positiv median. Ok: svagt positiv. Varning: n\u00e4ra noll/negativ.\n- Vad betyder ett extremt v\u00e4rde: Extremt h\u00f6g median j\u00e4mf\u00f6rt med trend kan vara tillf\u00e4llig cykeltopp.\n\n**Vanliga fallgropar**\n- Fem \u00e5r kan vara f\u00f6r kort i r\u00e5varucykler; komplettera med l\u00e4ngre historik.\n\n**Ramverk**\n- RR + Syding: earning-power normalisering inf\u00f6r FV2." },
  "implied_return": { title: "Implied return", body: "**Vad det m\u00e4ter**\nF\u00f6renklad uppskattning av m\u00f6jlig avkastning fr\u00e5n dagens v\u00e4rdering.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Utg\u00e5 fr\u00e5n vinst- eller kassafl\u00f6desavkastning.\n- Steg 2: L\u00e4gg p\u00e5 rimlig tillv\u00e4xtantagande enligt modellen.\n- Formel: Implied return \u2248 avkastningsyield + antagen tillv\u00e4xt (heuristik).\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: <6 % l\u00e5g f\u00f6rv\u00e4ntad avkastning, 6\u201312 % ok, >12 % attraktiv (os\u00e4kerhetsberoende).\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: h\u00f6g implied return med kvalitetsst\u00f6d. Ok: medel. Varning: l\u00e5g implied return i h\u00f6griskbolag.\n- Vad betyder ett extremt v\u00e4rde: Extremt h\u00f6ga tal tyder ofta p\u00e5 att marknaden misstror h\u00e5llbarheten.\n\n**Vanliga fallgropar**\n- Heuristik, inte prognos; sm\u00e5 \u00e4ndringar i antaganden ger stora utslag.\n\n**Ramverk**\n- Syding: snabb beslutsregel f\u00f6r v\u00e4rdering kontra potential." },
  "value_band": { title: "Value band", body: "**Vad det m\u00e4ter**\nKlassning av v\u00e4rderingsl\u00e4ge i zoner.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Samla centrala multiplar/yields.\n- Steg 2: Placera bolaget i l\u00e5g, neutral eller h\u00f6g v\u00e4rderingszon.\n- Formel: Band = regelbaserad klassning av relativ v\u00e4rdering.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: L\u00e5g band-niv\u00e5 = billigare, mitt = neutral, h\u00f6g = dyrare.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: l\u00e5g/neutral med stark kvalitet. Ok: neutral. Varning: h\u00f6g band-niv\u00e5 utan tillv\u00e4xtst\u00f6d.\n- Vad betyder ett extremt v\u00e4rde: Extremt l\u00e5gt band kan vara v\u00e4rdef\u00e4lla vid svag balans.\n\n**Vanliga fallgropar**\n- Band \u00e4r relativt och kr\u00e4ver j\u00e4mf\u00f6relse mot historik och peers.\n\n**Ramverk**\n- Syding: zon-t\u00e4nk f\u00f6r positionering." },
  "RR Snapshot": { title: "RR Snapshot", body: "**Vad det m\u00e4ter**\nSamlad RR-bed\u00f6mning av skala, kapitalavkastning, balans och fair value.\n\n**Hur det ber\u00e4knas**\n- Steg 1: L\u00e4s Scale, Capital, Balance sheet och Fair value samtidigt.\n- Steg 2: Kombinera niv\u00e5er med datagap-flaggor.\n- Formel: Ingen enskild formel: snapshoten \u00e4r en regelbaserad helhetsbild.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: Bra n\u00e4r skala+ROCE \u00e4r starka och skuldm\u00e5tt/flaggor \u00e4r kontrollerade.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: flera gr\u00f6na delm\u00e5tt och f\u00e5 gap. Ok: blandat. Varning: svag klassning + m\u00e5nga flaggor.\n- Vad betyder ett extremt v\u00e4rde: Extrem mismatch mellan delblock tyder p\u00e5 att ett enskilt m\u00e5tt driver bilden.\n\n**Vanliga fallgropar**\n- MVP-proxyer kan sakna benchmark/reservdata; l\u00e4s alltid missing flags.\n\n**Ramverk**\n- RR: institutionsfilter f\u00f6r kvalitet och robusthet." },
  "fv2": { title: "FV2", body: "**Vad det m\u00e4ter**\nFV2 \u00e4r fair value fr\u00e5n normaliserat fritt kassafl\u00f6de.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ta fem\u00e5rig median f\u00f6r fritt kassafl\u00f6de.\n- Steg 2: Diskontera som perpetuitet med avkastningskrav r.\n- Formel: FV2 EV = median FCF / r; FV2 Equity = FV2 EV \u2212 nettoskuld.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: H\u00f6gre r ger l\u00e4gre v\u00e4rde; l\u00e4gre r ger h\u00f6gre v\u00e4rde.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra/ok/varning avg\u00f6rs via EV/FV2_EV: <0.8 billig, 0.8\u20131.2 rimlig, >1.2 dyr.\n- Vad betyder ett extremt v\u00e4rde: Extremt h\u00f6gt v\u00e4rde uppst\u00e5r ofta n\u00e4r r s\u00e4tts f\u00f6r l\u00e5gt.\n\n**Vanliga fallgropar**\n- F\u00f6renklad perpetuitetsmodell utan explicit tillv\u00e4xtfas; k\u00e4nslig f\u00f6r r och FCF-normalisering.\n\n**Ramverk**\n- RR + Syding: earning-power-v\u00e4rdering i enterprise- och equity-bas." },
  "rr_scale_10y_recoverable_value_usd": { title: "10Y recoverable value", body: "**Vad det m\u00e4ter**\nProxy f\u00f6r ekonomisk skala \u00f6ver tid.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ta senaste \u00e5rs int\u00e4kter.\n- Steg 2: Multiplicera med 10 som enkel recoverable value-proxy.\n- Formel: 10Y recoverable value = 10 \u00d7 senaste \u00e5rs int\u00e4kter.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: H\u00f6gre niv\u00e5 antyder st\u00f6rre institutionsskala men inte n\u00f6dv\u00e4ndigtvis h\u00f6g avkastning.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: stor skala kombinerad med stark ROCE. Ok: medelskala. Varning: l\u00e5g skala i kapitaltung sektor.\n- Vad betyder ett extremt v\u00e4rde: Extremt h\u00f6g skala utan l\u00f6nsamhet kan vara l\u00e5gkvalitativ volym.\n\n**Vanliga fallgropar**\n- Proxy, inte DCF; p\u00e5verkas av tillf\u00e4lliga prisniv\u00e5er i int\u00e4kter.\n\n**Ramverk**\n- RR: storlek som investerbarhetsfilter." },
  "rr_roce": { title: "ROCE", body: "**Vad det m\u00e4ter**\nRR-variant av avkastning p\u00e5 sysselsatt kapital.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ta EBIT senaste tolv m\u00e5nader.\n- Steg 2: Ber\u00e4kna kapital anv\u00e4nt i verksamheten (totala tillg\u00e5ngar minus kortfristiga skulder).\n- Formel: RR ROCE = EBIT / kapital anv\u00e4nt i verksamheten.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: <10 % svagt, 10\u201320 % ok, 20\u201340 % starkt, >40 % mycket starkt.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: uth\u00e5lligt >20 %. Ok: 10\u201320 %. Varning: <10 %.\n- Vad betyder ett extremt v\u00e4rde: ROCE kan \u00f6verstiga 100 % n\u00e4r n\u00e4mnaren blir mycket liten, t.ex. efter stora \u00e5terk\u00f6p, negativt r\u00f6relsekapital eller balansstruktur med h\u00f6ga kortfristiga skulder.\n\n**Vanliga fallgropar**\n- Ej j\u00e4mf\u00f6rbart med banker/finans eftersom balansr\u00e4kningen fungerar annorlunda; kontrollera \u00e4ven kapitaldefinitionen.\n\n**Ramverk**\n- RR: k\u00e4rnm\u00e5tt f\u00f6r kapitaldisciplin och v\u00e4rdeskapande." },
  "rr_roce_flag": { title: "ROCE flag", body: "**Vad det m\u00e4ter**\nKvalitativ klassning av RR ROCE-niv\u00e5.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ber\u00e4kna RR ROCE.\n- Steg 2: Mappa till regelstyrd flaggniv\u00e5.\n- Formel: Flagga = etikett baserad p\u00e5 ROCE-zon.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: H\u00f6g flagga = stark kapitalavkastning, l\u00e5g flagga = svag.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: h\u00f6g niv\u00e5. Ok: medelniv\u00e5. Varning: l\u00e5g niv\u00e5.\n- Vad betyder ett extremt v\u00e4rde: Extremt h\u00f6g flagga b\u00f6r dubbelkollas om n\u00e4mnaren i ROCE \u00e4r ovanligt liten.\n\n**Vanliga fallgropar**\n- Flaggan \u00e4r bara en etikett; anv\u00e4nd alltid med faktisk ROCE-siffra och balansm\u00e5tt.\n\n**Ramverk**\n- RR: snabb sortering i kvalitetsfilter." },
  "rr_net_debt_fcf": { title: "Net debt / FCF", body: "**Vad det m\u00e4ter**\nSkuldbelastning relativt normaliserat fritt kassafl\u00f6de.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ta nettoskuld.\n- Steg 2: Dela med sustaining/normaliserat fritt kassafl\u00f6de.\n- Formel: Nettoskuld/FCF = nettoskuld / sustaining FCF.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: <0 nettokassa, 0\u20131.5 konservativt, 1.5\u20133 medel, >3 h\u00f6gt.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: under 1.5 eller nettokassa. Ok: 1.5\u20133. Varning: \u00f6ver 3.\n- Vad betyder ett extremt v\u00e4rde: Extremt h\u00f6gt uppst\u00e5r n\u00e4r FCF \u00e4r n\u00e4ra noll; d\u00e5 \u00e4r refinansieringsrisk h\u00f6g.\n\n**Vanliga fallgropar**\n- FCF i botten/topp av cykel kan ge fel riskniv\u00e5; anv\u00e4nd median \u00f6ver cykel.\n\n**Ramverk**\n- RR: skuldh\u00e5llbarhet under stress." },
  "rr_interest_coverage": { title: "RR interest coverage", body: "**Vad det m\u00e4ter**\nRR-r\u00e4ntet\u00e4ckning: r\u00f6relseresultat mot r\u00e4ntekostnad.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ta EBIT.\n- Steg 2: Dela med r\u00e4ntekostnad.\n- Formel: RR interest coverage = EBIT / r\u00e4ntekostnad.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: <1.5 stress, 1.5\u20133 sk\u00f6rt, 3\u20138 ok, >8 starkt.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: >8. Ok: 3\u20138. Varning: <3.\n- Vad betyder ett extremt v\u00e4rde: Extremt h\u00f6ga tal kan bero p\u00e5 mycket l\u00e5g r\u00e4ntekostnad snarare \u00e4n exceptionell drift.\n\n**Vanliga fallgropar**\n- N\u00e4r r\u00e4ntekostnad \u00e4r n\u00e4ra noll blir kvoten mindre anv\u00e4ndbar; komplettera med nettoskuld/FCF.\n\n**Ramverk**\n- RR: kreditrisk och \u00f6verlevnadsf\u00f6rm\u00e5ga." },
  "missing_flags": { title: "Missing flags", body: "**Vad det m\u00e4ter**\nDatagap som p\u00e5verkar tolkning av RR/FV2.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Kontrollera om benchmark, reservdata, median FCF, nettoskuld, aktier eller giltig r\u00e4nta saknas.\n- Steg 2: S\u00e4tt respektive flagga till sann vid saknad/ogiltig input.\n- Formel: Flagga = sann n\u00e4r underlag saknas; annars falsk.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: 0 flaggor = h\u00f6gre tillf\u00f6rlitlighet, 1\u20132 = f\u00f6rsiktighet, 3+ = l\u00e5g tillf\u00f6rlitlighet.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: inga flaggor. Ok: enstaka flagga. Varning: flera samtidiga flaggor.\n- Vad betyder ett extremt v\u00e4rde: Extremt m\u00e5nga flaggor g\u00f6r v\u00e4rderingssignal mer informationsfattig \u00e4n beslutbar.\n\n**Vanliga fallgropar**\n- Saknad data \u00e4r inte neutral signal; behandla som h\u00f6gre os\u00e4kerhet och st\u00f6rre s\u00e4kerhetsmarginal.\n\n**Ramverk**\n- RR: riskdisciplin och datakvalitet f\u00f6re slutsats." },
};

metricInfoMap["scale_flag"] = { title: "Scale flag", body: "**Vad det m\u00e4ter**\nEtikett f\u00f6r institutionell skala utifr\u00e5n scale-proxy.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ber\u00e4kna scale-proxy (recoverable value).\n- Steg 2: Mappa till etikett, t.ex. InstitutionalScale eller Subscale.\n- Formel: Flagga = regelstyrd klass av skalan.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: InstitutionalScale positivt, mellanl\u00e4ge neutralt, Subscale svagare.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: h\u00f6g skalklass. Ok: mellan. Varning: l\u00e5g skalklass.\n- Vad betyder ett extremt v\u00e4rde: Extremt h\u00f6g klass utan l\u00f6nsamhet kan vara falsk trygghet.\n\n**Vanliga fallgropar**\n- Skala m\u00e4ter storlek, inte kapitalavkastning; kombinera med ROCE och skuldm\u00e5tt.\n\n**Ramverk**\n- RR: storlek som kvalificeringsfilter." };
metricInfoMap["rr_roce"] = { title: "ROCE", body: "**Vad det m\u00e4ter**\nRR-variant av avkastning p\u00e5 sysselsatt kapital.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ta EBIT senaste tolv m\u00e5nader.\n- Steg 2: Ber\u00e4kna kapital anv\u00e4nt i verksamheten (totala tillg\u00e5ngar minus kortfristiga skulder).\n- Formel: RR ROCE = EBIT / kapital anv\u00e4nt i verksamheten.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: <10 % svagt, 10\u201320 % ok, 20\u201340 % starkt, >40 % mycket starkt.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: uth\u00e5lligt >20 %. Ok: 10\u201320 %. Varning: <10 %.\n- Vad betyder ett extremt v\u00e4rde: ROCE kan \u00f6verstiga 100 % n\u00e4r n\u00e4mnaren blir mycket liten, t.ex. efter stora \u00e5terk\u00f6p, negativt r\u00f6relsekapital eller balansstruktur med h\u00f6ga kortfristiga skulder.\n\n**Vanliga fallgropar**\n- Ej j\u00e4mf\u00f6rbart med banker/finans eftersom balansr\u00e4kningen fungerar annorlunda; kontrollera \u00e4ven kapitaldefinitionen.\n\n**Ramverk**\n- RR: k\u00e4rnm\u00e5tt f\u00f6r kapitaldisciplin och v\u00e4rdeskapande." };
metricInfoMap["rr_roce_flag"] = { title: "ROCE flag", body: "**Vad det m\u00e4ter**\nKvalitativ klassning av RR ROCE-niv\u00e5.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ber\u00e4kna RR ROCE.\n- Steg 2: Mappa till regelstyrd flaggniv\u00e5.\n- Formel: Flagga = etikett baserad p\u00e5 ROCE-zon.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: H\u00f6g flagga = stark kapitalavkastning, l\u00e5g flagga = svag.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: h\u00f6g niv\u00e5. Ok: medelniv\u00e5. Varning: l\u00e5g niv\u00e5.\n- Vad betyder ett extremt v\u00e4rde: Extremt h\u00f6g flagga b\u00f6r dubbelkollas om n\u00e4mnaren i ROCE \u00e4r ovanligt liten.\n\n**Vanliga fallgropar**\n- Flaggan \u00e4r bara en etikett; anv\u00e4nd alltid med faktisk ROCE-siffra och balansm\u00e5tt.\n\n**Ramverk**\n- RR: snabb sortering i kvalitetsfilter." };
metricInfoMap["margin_buffer"] = { title: "Margin buffer", body: "**Vad det m\u00e4ter**\nMarginalbuffert mot kostnads- eller prispress.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Utg\u00e5 fr\u00e5n operativ marginal/proxymarginal.\n- Steg 2: Bed\u00f6m hur stor nedg\u00e5ng i marginal som kan absorberas.\n- Formel: Buffer signal = niv\u00e5 p\u00e5 operativ marginal (proxy f\u00f6r st\u00f6td\u00e4mpning).\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: <10 % tunn buffert, 10\u201325 % ok, 25\u201340 % stark, >40 % mycket stark (branschberoende).\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: h\u00f6g och stabil buffert. Ok: medelniv\u00e5. Varning: tunn och fallande buffert.\n- Vad betyder ett extremt v\u00e4rde: Extremt h\u00f6g buffert kan vara tillf\u00e4llig cykeltopp.\n\n**Vanliga fallgropar**\n- J\u00e4mf\u00f6r inom samma bransch; strukturellt l\u00e5g marginal kan vara normal i vissa sektorer.\n\n**Ramverk**\n- RR: motst\u00e5ndskraft i l\u00f6nsamhet." };
metricInfoMap["cost_quartile"] = { title: "Cost quartile", body: "**Vad det m\u00e4ter**\nPosition i global kostnadskurva f\u00f6r produktion.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Matcha bolagets enhetskostnad mot branschkurva.\n- Steg 2: Placera i kvartil 1 till 4.\n- Formel: Kostnadskvartil = relativ kostnadsrang i marknaden.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: Kvartil 1 b\u00e4st (l\u00e4gst kostnad), kvartil 4 svagast.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: kvartil 1\u20132. Ok: kvartil 2\u20133. Varning: kvartil 4.\n- Vad betyder ett extremt v\u00e4rde: Extremt svag kvartil g\u00f6r bolaget k\u00e4nsligt vid prisfall.\n\n**Vanliga fallgropar**\n- Om benchmark saknas (null) ska m\u00e5ttet inte tolkas som neutralt.\n\n**Ramverk**\n- RR: kostnadsposition i cyklisk konkurrens." };
metricInfoMap["reserve_life"] = { title: "Reserve life", body: "**Vad det m\u00e4ter**\nHur l\u00e4nge reservbasen r\u00e4cker vid nuvarande produktion.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ta totala utvinningsbara reserver.\n- Steg 2: Dela med \u00e5rlig produktion.\n- Formel: Reserve life = reserver / \u00e5rsproduktion.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: <5 \u00e5r kort, 5\u201310 \u00e5r medel, >10 \u00e5r l\u00e4ngre uth\u00e5llighet.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: l\u00e5ng reservlivsl\u00e4ngd med rimlig kostnad. Ok: medel. Varning: kort livsl\u00e4ngd.\n- Vad betyder ett extremt v\u00e4rde: Extremt l\u00e5ng livsl\u00e4ngd kan \u00e4nd\u00e5 vara svag om reserverna \u00e4r ol\u00f6nsamma.\n\n**Vanliga fallgropar**\n- Null/saknad reservdata betyder os\u00e4kerhet, inte l\u00e5g eller h\u00f6g kvalitet.\n\n**Ramverk**\n- RR: uth\u00e5llighet i resursbas." };
metricInfoMap["rr_net_debt_fcf"] = { title: "Net debt / FCF", body: "**Vad det m\u00e4ter**\nSkuldbelastning relativt normaliserat fritt kassafl\u00f6de.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ta nettoskuld.\n- Steg 2: Dela med sustaining/normaliserat fritt kassafl\u00f6de.\n- Formel: Nettoskuld/FCF = nettoskuld / sustaining FCF.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: <0 nettokassa, 0\u20131.5 konservativt, 1.5\u20133 medel, >3 h\u00f6gt.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: under 1.5 eller nettokassa. Ok: 1.5\u20133. Varning: \u00f6ver 3.\n- Vad betyder ett extremt v\u00e4rde: Extremt h\u00f6gt uppst\u00e5r n\u00e4r FCF \u00e4r n\u00e4ra noll; d\u00e5 \u00e4r refinansieringsrisk h\u00f6g.\n\n**Vanliga fallgropar**\n- FCF i botten/topp av cykel kan ge fel riskniv\u00e5; anv\u00e4nd median \u00f6ver cykel.\n\n**Ramverk**\n- RR: skuldh\u00e5llbarhet under stress." };
metricInfoMap["rr_interest_coverage"] = { title: "RR interest coverage", body: "**Vad det m\u00e4ter**\nRR-r\u00e4ntet\u00e4ckning: r\u00f6relseresultat mot r\u00e4ntekostnad.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ta EBIT.\n- Steg 2: Dela med r\u00e4ntekostnad.\n- Formel: RR interest coverage = EBIT / r\u00e4ntekostnad.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: <1.5 stress, 1.5\u20133 sk\u00f6rt, 3\u20138 ok, >8 starkt.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: >8. Ok: 3\u20138. Varning: <3.\n- Vad betyder ett extremt v\u00e4rde: Extremt h\u00f6ga tal kan bero p\u00e5 mycket l\u00e5g r\u00e4ntekostnad snarare \u00e4n exceptionell drift.\n\n**Vanliga fallgropar**\n- N\u00e4r r\u00e4ntekostnad \u00e4r n\u00e4ra noll blir kvoten mindre anv\u00e4ndbar; komplettera med nettoskuld/FCF.\n\n**Ramverk**\n- RR: kreditrisk och \u00f6verlevnadsf\u00f6rm\u00e5ga." };
metricInfoMap["fv2_enterprise"] = { title: "FV2 Enterprise", body: "**Vad det m\u00e4ter**\nFV2 enterprisev\u00e4rde: v\u00e4rdet av verksamheten oavsett kapitalstruktur.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ta median FCF \u00f6ver 5 \u00e5r som normaliserad earning power.\n- Steg 2: Diskontera som perpetuitet med avkastningskrav r.\n- Formel: FV2 Enterprise = median FCF / r.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: H\u00f6gre FCF h\u00f6jer v\u00e4rdet, h\u00f6gre r s\u00e4nker v\u00e4rdet.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra/ok/varning bed\u00f6ms indirekt via EV/FV2_EV-zoner.\n- Vad betyder ett extremt v\u00e4rde: Extremt h\u00f6gt v\u00e4rde uppst\u00e5r ofta vid f\u00f6r l\u00e5g r eller tillf\u00e4lligt h\u00f6g FCF-median.\n\n**Vanliga fallgropar**\n- Enterprisev\u00e4rde \u00e4r inte samma som aktie\u00e4garv\u00e4rde; nettoskuld m\u00e5ste dras av f\u00f6r equity.\n\n**Ramverk**\n- RR + Syding: verksamhetsv\u00e4rde f\u00f6re finansieringsstruktur." };
metricInfoMap["fv2_equity"] = { title: "FV2 Equity", body: "**Vad det m\u00e4ter**\nFV2 equityv\u00e4rde: v\u00e4rdet som \u00e5terst\u00e5r till aktie\u00e4gare efter nettoskuld.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ber\u00e4kna FV2 enterprisev\u00e4rde.\n- Steg 2: Dra av nettoskuld (eller l\u00e4gg till nettokassa).\n- Formel: FV2 Equity = FV2 Enterprise \u2212 nettoskuld.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: H\u00f6g nettoskuld trycker ner equityv\u00e4rdet \u00e4ven om enterprisev\u00e4rdet \u00e4r of\u00f6r\u00e4ndrat.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: starkt positivt equityv\u00e4rde med rimlig skuld. Ok: positivt men skuldtyngt. Varning: l\u00e5gt/negativt.\n- Vad betyder ett extremt v\u00e4rde: Extremt l\u00e5gt equityv\u00e4rde indikerar att skulden \u00e4ter stor del av verksamhetsv\u00e4rdet.\n\n**Vanliga fallgropar**\n- J\u00e4mf\u00f6r inte direkt FV2 Equity med EV-multiplar utan basjustering.\n\n**Ramverk**\n- RR + Syding: \u00f6vers\u00e4ttning fr\u00e5n verksamhetsv\u00e4rde till \u00e4garv\u00e4rde." };
metricInfoMap["fv2_per_share"] = { title: "FV2 Per share", body: "**Vad det m\u00e4ter**\nFV2-v\u00e4rde per aktie.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ber\u00e4kna FV2 equityv\u00e4rde.\n- Steg 2: Dela med antal utest\u00e5ende aktier.\n- Formel: FV2 per aktie = FV2 Equity / antal aktier.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: J\u00e4mf\u00f6r mot aktuell kurs f\u00f6r upp-/nedsida.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: markant \u00f6ver kurs (med f\u00f6rsiktighet). Ok: n\u00e4ra kurs. Varning: klart under kurs.\n- Vad betyder ett extremt v\u00e4rde: Extrem skillnad mot kurs kan bero p\u00e5 os\u00e4kra indata (r, FCF, aktieantal).\n\n**Vanliga fallgropar**\n- Felaktigt eller f\u00f6r\u00e5ldrat aktieantal ger direkt fel per-aktie-v\u00e4rde.\n\n**Ramverk**\n- RR + Syding: praktisk \u00f6vers\u00e4ttning till investerarens prisniv\u00e5." };
metricInfoMap["ev_over_fv2"] = { title: "EV / FV2 Enterprise", body: "**Vad det m\u00e4ter**\nMarknadens enterprisev\u00e4rde relativt FV2 enterprisev\u00e4rde.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Ber\u00e4kna aktuellt EV (marknadsv\u00e4rde + skuld \u2212 kassa).\n- Steg 2: Dela med FV2 enterprise.\n- Formel: EV/FV2_EV = aktuellt EV / FV2 Enterprise.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: <0.8 potentiellt billigt, 0.8\u20131.2 n\u00e4ra rimligt, >1.2 potentiellt dyrt.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: under 0.8 med god kvalitet. Ok: 0.8\u20131.2. Varning: \u00f6ver 1.2 utan b\u00e4ttre utsikter.\n- Vad betyder ett extremt v\u00e4rde: Extremt l\u00e5gt kan vara v\u00e4rdef\u00e4lla; extremt h\u00f6gt kan vara f\u00f6r optimistisk priss\u00e4ttning.\n\n**Vanliga fallgropar**\n- K\u00e4nslig f\u00f6r antagen r och FCF-normalisering; anv\u00e4nd scenarioanalys.\n\n**Ramverk**\n- RR + Syding: snabb v\u00e4rderingssignal p\u00e5 enterprisebas." };
metricInfoMap["rr_classification"] = { title: "RR classification", body: "**Vad det m\u00e4ter**\nSamlad RR-klassning av kvalitet och robusthet.\n\n**Hur det ber\u00e4knas**\n- Steg 1: V\u00e4g ihop scale, ROCE, skuldm\u00e5tt, r\u00e4ntet\u00e4ckning och flaggor.\n- Steg 2: Mappa till slutklass enligt regelverk.\n- Formel: Klass = regelbaserad kombination av delm\u00e5tt.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: H\u00f6g klass kr\u00e4ver balans mellan kvalitet och risk, inte bara ett starkt enskilt m\u00e5tt.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: h\u00f6g klass med f\u00e5 missing/risk flags. Ok: mellanklass. Varning: l\u00e5g klass.\n- Vad betyder ett extremt v\u00e4rde: Extrem diskrepans mellan klass och enskilda m\u00e5tt b\u00f6r granskas manuellt.\n\n**Vanliga fallgropar**\n- Klassning f\u00f6renklar verkligheten; anv\u00e4nd som startpunkt, inte slutbeslut.\n\n**Ramverk**\n- RR: systematisk sortering f\u00f6r investerbar kvalitet." };
metricInfoMap["fv3_disabled"] = { title: "FV3", body: "**Vad det m\u00e4ter**\nInformationsrad: FV3 anv\u00e4nds inte i revenue-mode.\n\n**Hur det ber\u00e4knas**\n- Steg 1: Identifiera att modelltyp \u00e4r revenue-mode.\n- Steg 2: Blockera FV3-ber\u00e4kning eftersom projekt-/LOM-data saknas.\n- Formel: Status = 'Ej aktiv i revenue mode'.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: Ingen zonindelning; raden betyder endast att v\u00e4rdet inte ber\u00e4knas h\u00e4r.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: f\u00f6rst\u00e5 att fr\u00e5nvaro \u00e4r designval. Ok: anv\u00e4nd FV2 i st\u00e4llet. Varning: tolka inte som nollv\u00e4rde.\n- Vad betyder ett extremt v\u00e4rde: Extrem feltolkning \u00e4r att anta att FV3=0 eller negativt.\n\n**Vanliga fallgropar**\n- Detta \u00e4r en tillg\u00e4nglighets-/scope-signal, inte ett finansiellt nyckeltal.\n\n**Ramverk**\n- RR: metoddisciplin mellan revenue och project-model." };
metricInfoMap["quality_flags"] = { title: "Quality flags", body: "**Vad det m\u00e4ter**\nSamling av positiva kvalitetsm\u00f6nster i kassafl\u00f6de, marginaler och balans.\n\n**Hur det ber\u00e4knas**\n- Steg 1: L\u00e4s varje delsignal (t.ex. stark kassakonvertering, stabila marginaler, fallande skuld, l\u00e5g dilution).\n- Steg 2: Summera antal positiva flaggor.\n- Formel: Total kvalitet = antal positiva flaggor av totalt antal test.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: 0\u20131 svagt, 2\u20133 ok, 4+ starkt kvalitetsm\u00f6nster.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: m\u00e5nga flaggor utan motstridiga riskflaggor. Ok: blandad bild. Varning: f\u00e5 flaggor.\n- Vad betyder ett extremt v\u00e4rde: Extremt m\u00e5nga flaggor kan komma sent i cykel n\u00e4r allt ser b\u00e4st ut.\n\n**Vanliga fallgropar**\n- Flaggor \u00e4r heuristik; de ers\u00e4tter inte full analys av noterna och segmentmix.\n\n**Ramverk**\n- Buffetology + Syding: strukturell kvalitet + trendbekr\u00e4ftelse." };
metricInfoMap["risk_flags"] = { title: "Risk flags", body: "**Vad det m\u00e4ter**\nSamling av risksignaler som ofta f\u00f6reg\u00e5r svag avkastning.\n\n**Hur det ber\u00e4knas**\n- Steg 1: L\u00e4s risksignaler (t.ex. negativ FCF, utsp\u00e4dning, marginalpress, svag konvertering).\n- Steg 2: Summera antal riskflaggor.\n- Formel: Total risk = antal riskflaggor av totalt antal test.\n\n**Hur man tolkar v\u00e4rdet**\n- Zoner / tumregler: 0 l\u00e5g risk, 1\u20132 medelrisk, 3+ h\u00f6g risk.\n- Vad \u00e4r \u201cbra / ok / varning\u201d: Bra: f\u00e5 eller inga riskflaggor. Ok: enstaka flagga med tydlig f\u00f6rklaring. Varning: flera samtidiga flaggor.\n- Vad betyder ett extremt v\u00e4rde: Extremt m\u00e5nga flaggor \u00f6kar sannolikheten f\u00f6r nyemission, nedgradering eller multipelpress.\n\n**Vanliga fallgropar**\n- En enskild flagga kan vara \u00f6verg\u00e5ende; m\u00f6nster \u00f6ver tid \u00e4r viktigast.\n\n**Ramverk**\n- RR + Syding: riskscreening och skydd mot permanenta f\u00f6rluster." };
const PRICE_SERIES_COLORS = {
  close: "#0b0b0b",
  sma200: "#3a3a3a",
  sma50: "#3e5f8a",
  sma20: "#4b7f5a",
};

function parseFiscalYearEndMonth(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 12) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const digits = value.replace(/[^0-9]/g, "");
  if (digits.length < 2) {
    return null;
  }
  const month = Number(digits.slice(0, 2));
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  return month;
}

function normalizeDateSeries(data: (string | number | null)[][] | null) {
  if (!data || data.length === 0) {
    return data;
  }
  const [headers, ...rows] = data;
  const normalizedRows = rows.map((row) => {
    const [rawDate, ...rest] = row;
    const parsedDate = typeof rawDate === "string" || typeof rawDate === "number"
      ? new Date(rawDate)
      : null;
    const dateValue = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null;
    return [dateValue, ...rest] as (string | number | Date | null)[];
  });
  return [headers, ...normalizedRows];
}

export default function SingleStockDashboard() {
  const { ticker, setTicker, loading, error, data, fetchCompany } = useCompanyData("AAPL");
  const [formTicker, setFormTicker] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formSubcategory, setFormSubcategory] = useState("");
  const [formNote, setFormNote] = useState("");
  const [availableTickers, setAvailableTickers] = useState<string[]>([]);
  const [tickersError, setTickersError] = useState<string | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [priceData, setPriceData] = useState<{
    long: {
      price: (string | number | Date | null)[][] | null;
      volume: (string | number | Date | null)[][] | null;
    } | null;
    short: {
      price: (string | number | Date | null)[][] | null;
      volume: (string | number | Date | null)[][] | null;
    } | null;
  } | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>(() => readModeFromUrl());
  const [openInfoId, setOpenInfoId] = useState<string | null>(null);
  const [rrDiscountRateInput, setRrDiscountRateInput] = useState<string>("");

  useEffect(() => {
    let isMounted = true;
    async function loadPrice() {
      try {
        setPriceLoading(true);
        setPriceError(null);
        const response = await fetch(`/api/company/price?ticker=${encodeURIComponent(ticker)}`);
        const contentType = response.headers.get("content-type") ?? "";
        const rawPayload = await response.text();
        if (!contentType.toLowerCase().includes("application/json")) {
          throw new Error(
            `Expected JSON from /api/company/price (status=${response.status}, content-type=${contentType || "unknown"}, body=${rawPayload.slice(0, 120)})`
          );
        }
        const payload = rawPayload ? JSON.parse(rawPayload) : {};
        if (!response.ok) {
          const message = String(payload.error ?? "Failed to load price data.");
          const unsupported =
            response.status === 404 || message.toLowerCase().includes("not found");
          throw new Error(unsupported ? "Ticker not supported by data provider." : message);
        }
        if (isMounted) {
          const longPayload = payload.long ?? null;
          const shortPayload = payload.short ?? null;
          setPriceData({
            long: longPayload
              ? {
                price: normalizeDateSeries(longPayload.price),
                volume: normalizeDateSeries(longPayload.volume),
              }
              : null,
            short: shortPayload
              ? {
                price: normalizeDateSeries(shortPayload.price),
                volume: normalizeDateSeries(shortPayload.volume),
              }
              : null,
          });
          if (!longPayload && !shortPayload) {
            setPriceData(null);
          }
        }
      } catch (error) {
        if (isMounted) {
          setPriceData(null);
          setPriceError((error as Error).message);
        }
      } finally {
        if (isMounted) {
          setPriceLoading(false);
        }
      }
    }

    if (ticker) {
      void loadPrice();
    }

    return () => {
      isMounted = false;
    };
  }, [ticker]);


  useEffect(() => {
    function onScreeningOpen(event: Event) {
      const custom = event as CustomEvent<{ ticker?: string }>;
      const nextTicker = custom.detail?.ticker?.trim().toUpperCase();
      if (!nextTicker) {
        return;
      }
      void fetchCompany(nextTicker);
    }
    window.addEventListener("screening:open-ticker", onScreeningOpen as EventListener);
    return () => {
      window.removeEventListener("screening:open-ticker", onScreeningOpen as EventListener);
    };
  }, [fetchCompany]);

  const loadTickers = async () => {
    try {
      setTickersError(null);
      const response = await fetch("/api/company/list");
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load tickers.");
      }
      const list = Array.isArray(payload.tickers) ? payload.tickers : [];
      setAvailableTickers(list);
    } catch (error) {
      setTickersError((error as Error).message);
      console.error("Failed to load tickers", error);
    }
  };

  useEffect(() => {
    void loadTickers();
  }, []);



  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    params.set("mode", analysisMode);
    const nextUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }, [analysisMode]);
  useEffect(() => {
    let isMounted = true;
    async function loadProfile() {
      try {
        const response = await fetch(`/api/company/profile?ticker=${encodeURIComponent(ticker)}`);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load company profile.");
        }
        if (isMounted) {
          setProfile(payload.profile ?? null);
        }
      } catch {
        if (isMounted) {
          setProfile(null);
        }
      }
    }

    if (ticker) {
      void loadProfile();
    }

    return () => {
      isMounted = false;
    };
  }, [ticker]);

  const revenueData = buildSeriesData(
    buildSeries(data, [{ label: "Revenue", statement: "income", field: "revenue" }]),
    10,
  );
  const revenueGrowthData = buildSeriesData(buildRevenueGrowthSeries(data), 10);
  const grossProfitRatioData = buildSeriesData(
    buildSeries(data, [{ label: "Gross Profit Ratio", statement: "income", field: "grossProfitRatio" }]),
    10,
  );
  const ebitdaMarginData = buildSeriesData(
    buildSeries(data, [{ label: "EBITDA Margin", statement: "income", field: "ebitdaratio" }]),
    10,
  );
  const netIncomeMarginData = buildSeriesData(
    buildSeries(data, [{ label: "Net Income Margin", statement: "income", field: "netIncomeRatio" }]),
    10,
  );
  const cashFromOperationsData = buildSeriesData(
    buildSeries(data, [{ label: "Operating Cash Flow", statement: "cashflow", field: "operatingCashFlow" }]),
    10,
  );
  const cashFromInvestingData = buildSeriesData(
    buildSeries(data, [{ label: "Cash From Investing", statement: "cashflow", field: "netCashUsedForInvestingActivites" }]),
    10,
  );
  const freeCashFlowData = buildSeriesData(
    buildSeries(data, [{ label: "Free Cash Flow", statement: "cashflow", field: "freeCashFlow" }]),
    10,
  );
  const freeCashFlowPerShareData = buildSeriesData(buildFreeCashFlowPerShareSeries(data), 10);
  const equityData = buildSeriesData(
    buildSeries(data, [{ label: "Total Equity", statement: "balance", field: "totalStockholdersEquity" }]),
    10,
  );
  const roeData = buildSeriesData(buildRoeSeries(data), 10);

  const sydingBaseOptions = {
    colors: ["#0b0b0b"],
    trendlines: {
      0: {
        type: "linear",
        color: "#0b0b0b",
        lineWidth: 1,
        opacity: 0.6,
      },
    },
  };

  const priceChartOptions = {
    backgroundColor: "#e0e9ce",
    colors: [
      PRICE_SERIES_COLORS.close,
      PRICE_SERIES_COLORS.sma200,
      PRICE_SERIES_COLORS.sma50,
      PRICE_SERIES_COLORS.sma20,
    ],
    legend: { position: "bottom" },
    hAxis: {
      format: "yyyy",
      slantedText: true,
      slantedTextAngle: 45,
    },
    series: {
      0: { lineWidth: 2 },
      1: { lineWidth: 1 },
      2: { lineWidth: 1 },
      3: { lineWidth: 1 },
    },
  };

  const volumeChartOptions = {
    backgroundColor: "#e0e9ce",
    colors: [PRICE_SERIES_COLORS.close],
    legend: { position: "bottom" },
    hAxis: {
      format: "yyyy",
      slantedText: true,
      slantedTextAngle: 45,
    },
    vAxis: { format: "short" },
    bar: { groupWidth: "45%" },
  };

  const lineBehindBars = {
    seriesType: "bars",
    series: {
      0: { type: "area", lineWidth: 2, color: "#0b0b0b", areaOpacity: 0.25 },
    },
    colors: ["#0b0b0b", "#0b0b0b", "#0b0b0b", "#0b0b0b", "#0b0b0b"],
    isStacked: true,
    vAxis: { format: "short" },
  };

  const revenueVsCostData = buildSeriesData(
    buildSeries(data, [
      { label: "Revenue", statement: "income", field: "revenue" },
      { label: "Cost of Revenue", statement: "income", field: "costOfRevenue" },
    ]),
    15,
  );
  const grossProfitVsExpensesData = buildSeriesData(
    buildSeries(data, [
      { label: "Gross Profit", statement: "income", field: "grossProfit" },
      { label: "Selling & Marketing", statement: "income", field: "sellingAndMarketingExpenses" },
      { label: "G&A", statement: "income", field: "generalAndAdministrativeExpenses" },
      { label: "R&D", statement: "income", field: "researchAndDevelopmentExpenses" },
      { label: "Other Expenses", statement: "income", field: "otherExpenses" },
    ]),
    15,
  );
  const operatingProfitVsDepData = buildSeriesData(buildOperatingProfitVsDepSeries(data), 15);
  const ebitVsInterestData = buildSeriesData(buildOperatingIncomeVsInterestSeries(data), 15);
  const netEarningsData = buildSeriesData(computeNetEarningsSeries(data), 15);
  const netEarningsPerShareData = buildSeriesData(buildNetEarningsPerShareSeries(data), 15);

  const cashVsNetEarningsData = buildSeriesData(
    buildCashVsNetEarningsSeries(data, "cashAndShortTermInvestments"),
    15,
  );
  const cashVsShortTermDebtData = buildSeriesData(
    buildSeries(data, [
      { label: "Short Term Debt", statement: "balance", field: "shortTermDebt" },
      { label: "Cash & Short Term Investments", statement: "balance", field: "cashAndShortTermInvestments" },
    ]),
    15,
  );
  const inventoryVsNetEarningsData = buildSeriesData(
    buildCashVsNetEarningsSeries(data, "inventory"),
    15,
  );
  const ppeVsDepData = buildSeriesData(
    buildSeries(data, [
      { label: "Property Plant Equipment", statement: "balance", field: "propertyPlantEquipmentNet" },
      { label: "Depreciation", statement: "income", field: "depreciationAndAmortization" },
    ]),
    15,
  );
  const goodwillData = buildSeriesData(
    buildSeries(data, [{ label: "Goodwill", statement: "balance", field: "goodwill" }]),
    15,
  );
  const debtMixData = buildSeriesData(
    buildSeries(data, [
      { label: "Short Term Debt", statement: "balance", field: "shortTermDebt" },
      { label: "Long Term Debt", statement: "balance", field: "longTermDebt" },
    ]),
    15,
  );
  const ebitdaVsLongTermDebtData = buildSeriesData(
    buildSeries(data, [
      { label: "EBITDA", statement: "income", field: "ebitda" },
      { label: "Long Term Debt", statement: "balance", field: "longTermDebt" },
    ]),
    15,
  );
  const currentRatioData = buildSeriesData(buildCurrentRatioSeries(data), 15);
  const longTermDebtToNetEarningsData = buildSeriesData(buildLongTermDebtToNetEarningsSeries(data), 15);
  const debtToEquityData = buildSeriesData(buildDebtToEquitySeries(data), 15);
  const adjustedDebtToEquityData = buildSeriesData(buildAdjustedDebtToEquitySeries(data), 15);
  const retainedEarningsData = buildSeriesData(
    buildSeries(data, [
      { label: "Net Income", statement: "income", field: "netIncome" },
      { label: "Retained Earnings", statement: "balance", field: "retainedEarnings" },
    ]),
    15,
  );

  const capexVsNetEarningsData = buildSeriesData(
    buildCapitalExpenditureVsNetEarningsSeries(data),
    15,
  );
  const buybacksDividendsData = buildSeriesData(
    buildBuybacksDividendsSeries(data),
    15,
  );


  const producerCore = useMemo(() => (data?.producer_core as ProducerCorePanel | undefined) ?? null, [data]);
  const rrOverlay = useMemo(() => (data?.rr_overlay as RrOverlayPanel | undefined) ?? null, [data]);
  const producerCoreMissing = !producerCore || !producerCore.efficiency;
  const rrOverlayMissing = !rrOverlay || Object.keys(rrOverlay).length === 0;
  const rrDiscountRatePct = rrDiscountRateInput.trim() ? Number(rrDiscountRateInput) : null;
  const rrDiscountRate = rrDiscountRatePct !== null && Number.isFinite(rrDiscountRatePct) && rrDiscountRatePct > 0 && rrDiscountRatePct <= 25
    ? rrDiscountRatePct / 100
    : null;
  const rrNetDebt = typeof (rrOverlay as any)?.rr_net_debt === "number"
    ? Number((rrOverlay as any).rr_net_debt)
    : typeof (producerCore as any)?.efficiency?.balance_sheet?.net_debt === "number"
      ? Number((producerCore as any).efficiency.balance_sheet.net_debt)
      : null;
  const medianFcf5Y = typeof (producerCore as any)?.value?.medians_5Y?.median_fcf === "number"
    ? Number((producerCore as any).value.medians_5Y.median_fcf)
    : null;
  const sharesOutstanding = (() => {
    const candidates = [
      (data?.balance as any)?.sharesOutstanding,
      (data?.balance as any)?.commonStockSharesOutstanding,
      (data?.income as any)?.weightedAverageShsOut,
      (data?.income as any)?.weightedAverageShsOutDil,
    ];
    for (const series of candidates) {
      if (!Array.isArray(series)) continue;
      for (let i = series.length - 1; i >= 0; i -= 1) {
        const v = series[i];
        if (typeof v === "number" && Number.isFinite(v) && v > 0) {
          return v;
        }
      }
    }
    return null;
  })();
  const fv2Ev = rrDiscountRate !== null && medianFcf5Y !== null && medianFcf5Y > 0
    ? medianFcf5Y / rrDiscountRate
    : null;
  const fv2Equity = fv2Ev !== null && rrNetDebt !== null ? fv2Ev - rrNetDebt : null;
  const fv2PerShare = fv2Equity !== null && sharesOutstanding !== null && sharesOutstanding > 0
    ? fv2Equity / sharesOutstanding
    : null;
  const evFromNetDebtRatio = (() => {
    const netDebtOverEv = typeof (producerCore as any)?.value?.multiples?.net_debt_over_ev === "number"
      ? Number((producerCore as any).value.multiples.net_debt_over_ev)
      : null;
    if (rrNetDebt === null || netDebtOverEv === null || netDebtOverEv === 0) {
      return null;
    }
    const ev = rrNetDebt / netDebtOverEv;
    return Number.isFinite(ev) && ev > 0 ? ev : null;
  })();
  const fv2EvSignal = fv2Ev !== null && fv2Ev > 0 && evFromNetDebtRatio !== null
    ? evFromNetDebtRatio / fv2Ev
    : null;
  const fv2Flags = {
    missing_median_fcf: medianFcf5Y === null || medianFcf5Y <= 0,
    missing_net_debt: rrNetDebt === null,
    missing_shares: sharesOutstanding === null || sharesOutstanding <= 0,
    invalid_discount_rate: rrDiscountRate === null || rrDiscountRate <= 0,
  };
  const rrInputsReady = rrDiscountRate !== null && rrDiscountRate > 0;

  const fiscalYearEndMonth =
    parseFiscalYearEndMonth(data?.fiscal_year_end_month) ??
    parseFiscalYearEndMonth(data?.fiscal_year_end) ??
    parseFiscalYearEndMonth(profile?.fiscalYearEndMonth) ??
    parseFiscalYearEndMonth(profile?.fiscalYearEnd);

  return (
    <div className="single-stock-dashboard">
      <div className="stock-selector">
        <div className="stock-selector-row">
          <CompanyPicker
            label="Sök bolagsnamn"
            placeholder="T.ex. Apple"
            onSelect={(company) => {
              void fetchCompany(company.symbol);
            }}
          />
          <select defaultValue={CATEGORIES[0]}>
            {CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select defaultValue={SUBCATEGORIES[0]}>
            {SUBCATEGORIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            defaultValue="Välj En Aktie"
            onChange={(event) => {
              const value = event.target.value;
              if (value !== "Välj En Aktie") {
                void fetchCompany(value);
              }
            }}
          >
            <option value="Välj En Aktie">Välj En Aktie</option>
            {availableTickers.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          {tickersError && <p className="status error">{tickersError}</p>}
        </div>

        <div className="stock-selector-row form">
          <div>
            <label htmlFor="tickerSymbol">Ticker</label>
            <input
              id="tickerSymbol"
              type="text"
              placeholder="AAPL"
              value={formTicker}
              onChange={(event) => setFormTicker(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="category">Kategori</label>
            <input
              id="category"
              type="text"
              placeholder="Tech"
              value={formCategory}
              onChange={(event) => setFormCategory(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="subcategory">Underkategori</label>
            <input
              id="subcategory"
              type="text"
              placeholder="Software"
              value={formSubcategory}
              onChange={(event) => setFormSubcategory(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="note">Anteckning</label>
            <input
              id="note"
              type="text"
              placeholder="Notering"
              value={formNote}
              onChange={(event) => setFormNote(event.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              const nextTicker = formTicker.trim().toUpperCase();
              if (!nextTicker) {
                return;
              }
              void fetchCompany(nextTicker);
              setFormTicker("");
              setFormCategory("");
              setFormSubcategory("");
              setFormNote("");
            }}
          >
            Lägg till ticker
          </button>
        </div>
      </div>

      <Viewer
        ticker={ticker}
        loading={loading}
        error={error}
        data={data}
        onTickerChange={setTicker}
        onFetch={fetchCompany}
      />

      <div className="divider" />

      <div className="breadcontainersinglecolumn">
        <button
          type="button"
          className="admin-toggle"
          onClick={() => setShowAdmin((prev) => !prev)}
        >
          {showAdmin ? "Dölj admin" : "Visa admin"}
        </button>
      </div>

      {showAdmin && <Admin onTickersUpserted={loadTickers} />}

      <div className="breadcontainersinglecolumn">
        <h1 id="SingleStock_Stock_Name" className="subrub">
          {profile?.companyName ? `${profile.companyName}` : data?.ticker ?? ""}
          {data?.ticker ? ` (${data.ticker})` : ""}
        </h1>
        <p className="bread">
          {profile?.description
            ? String(profile.description)
            : "Här visas en enstaka aktie och dess analytiska instrumentbräda. Välj ticker och kör refresh i admin om data saknas."}
        </p>
      </div>

      {profile && (
        <div className="breadcontainerdoublecolumn">
          <p className="bread">Sektor: {String(profile.sector ?? "-")}</p>
          <p className="bread">Industri: {String(profile.industry ?? "-")}</p>
          <p className="bread">Valuta: {String(profile.currency ?? "-")}</p>
          <p className="bread">Börs: {String(profile.exchangeShortName ?? "-")}</p>
        </div>
      )}
      <div className="breadcontainersinglecolumn">
        <h2 className="subrub small">Price History</h2>
        <p className="bread">
          Pris- och volymgrafer laddas från backend när historik finns tillgänglig.
        </p>
        {priceLoading && <p className="status">Fetching data…</p>}
        {!priceLoading && priceError && <p className="status error">{priceError}</p>}
        {!priceLoading && !priceError && !priceData && (
          <p className="status empty">No historical data available.</p>
        )}
      </div>

      <div className="chartcontainerdoublecolumn">
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="LineChart"
          title="Aktieprishistoria"
          data={priceData?.long?.price ?? null}
          height={260}
          options={priceChartOptions}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="LineChart"
          title="Aktieprishistoria (kort)"
          data={priceData?.short?.price ?? null}
          height={260}
          options={priceChartOptions}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Volume"
          data={priceData?.long?.volume ?? null}
          height={200}
          options={volumeChartOptions}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Volume (kort)"
          data={priceData?.short?.volume ?? null}
          height={200}
          options={volumeChartOptions}
        />
      </div>

      <div className="breadcontainersinglecolumn">
        <h2 className="subrub small">Mode</h2>
        <div style={{ display: "flex", gap: "8px" }}>
          <button type="button" onClick={() => setAnalysisMode("revenue")} disabled={analysisMode === "revenue"}>
            Revenue (Producer)
          </button>
          <button type="button" onClick={() => setAnalysisMode("prerevenue")} disabled={analysisMode === "prerevenue"}>
            Pre-Revenue
          </button>
        </div>
      </div>

      {analysisMode === "revenue" && (
        <>
          <div className="breadcontainersinglecolumn">
            <h1 className="subrub">Producer Core (PVE v2)</h1>
            <p className="bread">Efficiency, Resilience, Value och Context snapshots för MAJOR/revenue-mode.</p>
          </div>
          {producerCoreMissing ? (
            <div className="breadcontainersinglecolumn">
              <p className="status empty">Data missing for Producer Core panel.</p>
            </div>
          ) : (
            <div className="producer-core-compact-card">
              <div className="producer-core-compact-grid">
                <section className="producer-core-section efficiency">
                  <div className="producer-core-title-row">
                    <h2 className="subrub small">Efficiency</h2>
                    <InfoPopover
                      id="efficiency"
                      openId={openInfoId}
                      onToggle={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
                      onClose={() => setOpenInfoId(null)}
                      title="Efficiency"
                      content={EFFICIENCY_INFO}
                    />
                  </div>
                  <div className="compact-metrics-grid">
                    {renderCompactMetrics("efficiency", [
                      { label: "Gross margin", value: (producerCore as any)?.efficiency?.margin_structure?.gross_margin, infoKey: "gross_margin" },
                      { label: "Operating margin", value: (producerCore as any)?.efficiency?.margin_structure?.operating_margin, infoKey: "operating_margin" },
                      { label: "Net margin", value: (producerCore as any)?.efficiency?.margin_structure?.net_margin, infoKey: "net_margin" },
                      { label: "Margin trend", value: (producerCore as any)?.efficiency?.margin_structure?.margin_trend_label, infoKey: "margin_trend_label" },
                      { label: "OCF / NI", value: (producerCore as any)?.efficiency?.cash_quality?.ocf_to_ni, infoKey: "ocf_to_ni" },
                      { label: "FCF / NI", value: (producerCore as any)?.efficiency?.cash_quality?.fcf_to_ni, infoKey: "fcf_to_ni" },
                      { label: "Accrual", value: (producerCore as any)?.efficiency?.cash_quality?.accrual_flag, infoKey: "accrual_flag" },
                      { label: "Capex / Revenue", value: (producerCore as any)?.efficiency?.capital_intensity?.capex_to_revenue, infoKey: "capex_to_revenue" },
                      { label: "Capex / OCF", value: (producerCore as any)?.efficiency?.capital_intensity?.capex_to_ocf, infoKey: "capex_to_ocf" },
                      { label: "PPE vs Revenue", value: (producerCore as any)?.efficiency?.capital_intensity?.ppe_vs_revenue_signal, infoKey: "ppe_vs_revenue_signal" },
                      { label: "Net debt", value: (producerCore as any)?.efficiency?.balance_sheet?.net_debt, infoKey: "net_debt" },
                      { label: "Net debt / EBITDA", value: (producerCore as any)?.efficiency?.balance_sheet?.net_debt_to_ebitda, infoKey: "net_debt_to_ebitda" },
                      { label: "Interest coverage", value: (producerCore as any)?.efficiency?.balance_sheet?.interest_coverage, infoKey: "interest_coverage" },
                      { label: "Debt trend", value: (producerCore as any)?.efficiency?.balance_sheet?.debt_trend_label, infoKey: "debt_trend_label" },
                      { label: "ROE", value: (producerCore as any)?.efficiency?.returns?.roe, infoKey: "roe" },
                      { label: "ROIC pre-tax", value: (producerCore as any)?.efficiency?.returns?.roic_pre_tax, infoKey: "roic_pre_tax" },
                      { label: "ROE trend 5Y", value: (producerCore as any)?.efficiency?.returns?.roe_trend_5Y, infoKey: "roe_trend_5Y" },
                      { label: "Shares trend 5Y", value: (producerCore as any)?.efficiency?.allocation?.shares_trend_5Y, infoKey: "shares_trend_5Y" },
                      { label: "Retained vs NI", value: (producerCore as any)?.efficiency?.allocation?.retained_vs_ni_signal, infoKey: "retained_vs_ni_signal" },
                      {
                        label: "Quality flags",
                        infoKey: "quality_flags",
                        value: Array.isArray((producerCore as any)?.efficiency?.quality_flags) && (producerCore as any).efficiency.quality_flags.length
                          ? (producerCore as any).efficiency.quality_flags.join(", ")
                          : "—",
                      },
                      {
                        label: "Risk flags",
                        infoKey: "risk_flags",
                        value: Array.isArray((producerCore as any)?.efficiency?.risk_flags) && (producerCore as any).efficiency.risk_flags.length
                          ? (producerCore as any).efficiency.risk_flags.join(", ")
                          : "—",
                      },
                      { label: "Invalid capital employed", value: (producerCore as any)?.efficiency?.diagnostics?.invalid_capital_employed, infoKey: "invalid_capital_employed" },
                      { label: "EV formula check", value: (producerCore as any)?.efficiency?.diagnostics?.ev_formula_check, infoKey: "ev_formula_check" },
                      { label: "Accounting anomaly", value: (producerCore as any)?.efficiency?.diagnostics?.accounting_anomaly, infoKey: "accounting_anomaly" },
                    ], openInfoId, setOpenInfoId)}
                  </div>
                </section>

                <section className="producer-core-section resilience">
                  <div className="producer-core-title-row">
                    <h2 className="subrub small">Resilience</h2>
                    <InfoPopover
                      id="resilience"
                      openId={openInfoId}
                      onToggle={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
                      onClose={() => setOpenInfoId(null)}
                      title="Resilience"
                      content={RESILIENCE_INFO}
                    />
                  </div>
                  <div className="compact-metrics-grid">
                    {renderCompactMetrics("resilience", [
                      { label: "Net debt", value: (producerCore as any)?.resilience?.leverage?.net_debt, infoKey: "net_debt" },
                      { label: "Net debt / EBITDA", value: (producerCore as any)?.resilience?.leverage?.net_debt_to_ebitda, infoKey: "net_debt_to_ebitda" },
                      { label: "Interest coverage", value: (producerCore as any)?.resilience?.leverage?.interest_coverage, infoKey: "interest_coverage" },
                      { label: "Current ratio", value: (producerCore as any)?.resilience?.liquidity?.current_ratio, infoKey: "current_ratio" },
                      { label: "Cash vs short debt", value: (producerCore as any)?.resilience?.liquidity?.cash_vs_short_term_debt, infoKey: "cash_vs_short_term_debt" },
                      { label: "FCF volatility 5Y", value: (producerCore as any)?.resilience?.stability?.fcf_volatility_5Y, infoKey: "fcf_volatility_5Y" },
                    ], openInfoId, setOpenInfoId)}                  </div>
                </section>

                <section className="producer-core-section value">
                  <div className="producer-core-title-row">
                    <h2 className="subrub small">Value</h2>
                    <InfoPopover
                      id="value"
                      openId={openInfoId}
                      onToggle={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
                      onClose={() => setOpenInfoId(null)}
                      title="Value"
                      content={VALUE_INFO}
                    />
                  </div>
                  <div className="compact-metrics-grid">
                    {renderCompactMetrics("value", [
                      { label: "P/E", value: (producerCore as any)?.value?.multiples?.pe, infoKey: "pe" },
                      { label: "Earnings yield", value: (producerCore as any)?.value?.multiples?.earnings_yield, infoKey: "earnings_yield" },
                      { label: "P/FCF", value: (producerCore as any)?.value?.multiples?.p_fcf, infoKey: "p_fcf" },
                      { label: "FCF yield", value: (producerCore as any)?.value?.multiples?.fcf_yield, infoKey: "fcf_yield" },
                      { label: "EV/EBITDA", value: (producerCore as any)?.value?.multiples?.ev_ebitda, infoKey: "ev_ebitda" },
                      { label: "EV/EBIT", value: (producerCore as any)?.value?.multiples?.ev_ebit, infoKey: "ev_ebit" },
                      { label: "EV/FCF", value: (producerCore as any)?.value?.multiples?.ev_fcf, infoKey: "ev_fcf" },
                      { label: "Net debt / EV", value: (producerCore as any)?.value?.multiples?.net_debt_over_ev, infoKey: "net_debt_over_ev" },
                      { label: "Median NI (5Y)", value: (producerCore as any)?.value?.medians_5Y?.median_ni, infoKey: "median_ni_5y" },
                      { label: "Median EBIT margin (5Y)", value: (producerCore as any)?.value?.medians_5Y?.median_ebit_margin, infoKey: "median_ebit_margin_5y" },
                      { label: "Median FCF (5Y)", value: (producerCore as any)?.value?.medians_5Y?.median_fcf, infoKey: "median_fcf_5y" },
                      { label: "Implied return", value: (producerCore as any)?.value?.implied_return, infoKey: "implied_return" },
                      { label: "Value band", value: (producerCore as any)?.value?.value_band, infoKey: "value_band" },
                    ], openInfoId, setOpenInfoId)}                  </div>
                </section>
              </div>

              <div className="producer-core-divider" />

              <section className="producer-core-section rr-snapshot">
                <div className="producer-core-title-row">
                  <h2 className="subrub small">RR Snapshot (Commodity Strength — MVP)</h2>
                  <InfoPopover
                    id="rr"
                    openId={openInfoId}
                    onToggle={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
                    onClose={() => setOpenInfoId(null)}
                    title="RR Snapshot"
                    content={RR_INFO}
                  />
                </div>
                <p className="bread">MVP proxies. Missing benchmark/reserve inputs visas som null + flags.</p>
                <div className="rr-input-row">
                  <label>Diskonteringsränta r (%)
                    <input value={rrDiscountRateInput} onChange={(e) => setRrDiscountRateInput(e.target.value)} placeholder="t.ex. 10" />
                  </label>
                </div>
                {!rrInputsReady && <p className="status empty">Ange giltig diskonteringsränta (0–25%) för att aktivera FV2.</p>}
                {rrOverlayMissing ? (
                  <p className="status empty">Data missing for RR Snapshot panel.</p>
                ) : (
                  <div className="rr-grid">
                    <div className="rr-group">
                      <h4>Scale</h4>
                      <div className="compact-metrics-grid">
                        {renderCompactMetrics("rr-scale", [
                          { label: "10Y recoverable value", infoKey: "rr_scale_10y_recoverable_value_usd", value: (rrOverlay as any)?.rr_scale_10y_recoverable_value_usd },
                          { label: "Scale flag", infoKey: "scale_flag", value: rrOverlay?.rr_scale_flag ?? "Unknown" },
                        ], openInfoId, setOpenInfoId)}
                      </div>
                    </div>
                    <div className="rr-group">
                      <h4>Capital</h4>
                      <div className="compact-metrics-grid">
                        {renderCompactMetrics("rr-capital", [
                          { label: "ROCE", infoKey: "rr_roce", value: (rrOverlay as any)?.rr_roce },
                          { label: "ROCE flag", infoKey: "rr_roce_flag", value: rrOverlay?.rr_roce_flag ?? "Unknown" },
                          { label: "Margin buffer", infoKey: "margin_buffer", value: (rrOverlay as any)?.rr_margin_buffer_pct },
                          { label: "Cost quartile", infoKey: "cost_quartile", value: (rrOverlay as any)?.rr_cost_quartile },
                          { label: "Reserve life", infoKey: "reserve_life", value: (rrOverlay as any)?.rr_reserve_life_years },
                        ], openInfoId, setOpenInfoId)}
                      </div>
                    </div>
                    <div className="rr-group">
                      <h4>Balance sheet</h4>
                      <div className="compact-metrics-grid">
                        {renderCompactMetrics("rr-balance", [
                          { label: "Net debt / FCF", infoKey: "rr_net_debt_fcf", value: (rrOverlay as any)?.rr_net_debt_fcf },
                          { label: "Interest coverage", infoKey: "rr_interest_coverage", value: rrOverlay?.rr_interest_coverage },
                          { label: "Missing benchmark", infoKey: "missing_flags", value: rrOverlay?.rr_cost_quartile_flags?.missing_benchmark ?? false },
                          { label: "Missing reserves", infoKey: "missing_flags", value: rrOverlay?.rr_reserve_life_flags?.missing_reserves ?? false },
                        ], openInfoId, setOpenInfoId)}
                      </div>
                    </div>
                    <div className="rr-group">
                      <h4>Fair value</h4>
                      <div className="compact-metrics-grid">
                        {renderCompactMetrics("rr-fv", [
                                                    { label: "FV2 (Enterprise, USD)", value: fv2Ev, infoKey: "fv2_enterprise" },
                          { label: "FV2 (Equity, USD)", value: fv2Equity, infoKey: "fv2_equity" },
                          { label: "FV2 (Per share, USD)", value: fv2PerShare, infoKey: "fv2_per_share" },
                          { label: "EV / FV2_EV", value: fv2EvSignal, infoKey: "ev_over_fv2" },
                          { label: "missing_median_fcf", value: fv2Flags.missing_median_fcf, infoKey: "missing_flags" },
                          { label: "missing_net_debt", value: fv2Flags.missing_net_debt, infoKey: "missing_flags" },
                          { label: "missing_shares", value: fv2Flags.missing_shares, infoKey: "missing_flags" },
                          { label: "invalid_discount_rate", value: fv2Flags.invalid_discount_rate, infoKey: "missing_flags" },
                          { label: "Fair value 3", infoKey: "fv3_disabled", value: "Ej aktiv i revenue mode" },
                          { label: "RR classification", infoKey: "rr_classification", value: rrOverlay?.rr_classification },
                        ], openInfoId, setOpenInfoId)}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}

      <div className="breadcontainersinglecolumn">
        <h1 className="subrub">Sydings Analytik</h1>
        <p className="bread">
          Sydings Analytik visar marginaler och kassaflöden över tid för att bedöma varaktig
          lönsamhet. Data hämtas via backendens materialiserade årsdata efter “Refresh Ticker”.
        </p>
      </div>

      <div className="chartcontainerdoublecolumn">
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Revenue"
          data={revenueData}
          options={{ ...sydingBaseOptions, vAxis: { format: "short" } }}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Revenue Growth"
          data={revenueGrowthData}
          options={{ ...sydingBaseOptions, vAxis: { format: "percent" } }}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Gross Profit Ratio"
          data={grossProfitRatioData}
          options={{ ...sydingBaseOptions, vAxis: { format: "percent" } }}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="EBITDA Margin"
          data={ebitdaMarginData}
          options={{ ...sydingBaseOptions, vAxis: { format: "percent" } }}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Net Income Margin"
          data={netIncomeMarginData}
          options={{ ...sydingBaseOptions, vAxis: { format: "percent" } }}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Operating Cash Flow"
          data={cashFromOperationsData}
          options={{ ...sydingBaseOptions, vAxis: { format: "short" } }}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Cash From Investing"
          data={cashFromInvestingData}
          options={{ ...sydingBaseOptions, vAxis: { format: "short" } }}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Free Cash Flow"
          data={freeCashFlowData}
          options={{ ...sydingBaseOptions, vAxis: { format: "short" } }}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Free Cash Flow/Share"
          data={freeCashFlowPerShareData}
          options={{ ...sydingBaseOptions, vAxis: { format: "short" } }}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Total Equity"
          data={equityData}
          options={{ ...sydingBaseOptions, vAxis: { format: "short" } }}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="ROE"
          data={roeData}
          options={{ ...sydingBaseOptions, vAxis: { format: "percent" } }}
        />
      </div>

      </>
      )}

      {analysisMode === "prerevenue" && (
        <div className="breadcontainersinglecolumn">
          <h1 className="subrub">Pre-Revenue</h1>
          <p className="bread">Pre-revenue view uses existing project/dilution/runway logic unchanged.</p>
        </div>
      )}

      <div className="breadcontainersinglecolumn">
        <h1 className="subrub">Buffetologisk Analytik</h1>
        <p className="bread">
          Buffetologi jämför intäkter, kostnader och kapitalstruktur för att förstå bolagets
          uthållighet. Graferna speglar samma legacy‑modell, men drivs nu av backendens
          årsvisa datapunkter.
        </p>
      </div>

      <div className="breadcontainersinglecolumn">
        <h2 className="subrub small">Income Statement</h2>
      </div>

      <div className="chartcontainerdoublecolumn">
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Revenue vs Cost of Revenue"
          data={revenueVsCostData}
          options={lineBehindBars}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Gross Profit vs Expenses"
          data={grossProfitVsExpensesData}
          options={lineBehindBars}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Operating Profit vs Depreciation"
          data={operatingProfitVsDepData}
          options={lineBehindBars}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="EBIT vs Interest"
          data={ebitVsInterestData}
          options={lineBehindBars}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Net Earnings"
          data={netEarningsData}
          options={lineBehindBars}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Revenue vs Net Earnings per Share"
          data={netEarningsPerShareData}
          options={lineBehindBars}
        />
      </div>

      <div className="breadcontainersinglecolumn">
        <h2 className="subrub small">Balance Sheet</h2>
      </div>

      <div className="chartcontainerdoublecolumn">
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Cash vs Net Earnings"
          data={cashVsNetEarningsData}
          options={lineBehindBars}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Cash vs Short Term Debt"
          data={cashVsShortTermDebtData}
          options={lineBehindBars}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Net Earnings vs Inventory"
          data={inventoryVsNetEarningsData}
          options={lineBehindBars}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="PPE vs Depreciation"
          data={ppeVsDepData}
          options={lineBehindBars}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Goodwill"
          data={goodwillData}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Short Term vs Long Term Debt"
          data={debtMixData}
          options={lineBehindBars}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="EBITDA vs Long Term Debt"
          data={ebitdaVsLongTermDebtData}
          options={lineBehindBars}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Current Ratio"
          data={currentRatioData}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Long Term Debt to Net Earnings"
          data={longTermDebtToNetEarningsData}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Debt to Equity"
          data={debtToEquityData}
          options={{ vAxis: { format: "percent" } }}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Adjusted Debt to Equity"
          data={adjustedDebtToEquityData}
          options={{ vAxis: { format: "percent" } }}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Retained Earnings vs Net Income"
          data={retainedEarningsData}
          options={lineBehindBars}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="ROE"
          data={roeData}
          options={{ vAxis: { format: "percent" } }}
        />
      </div>

      <div className="breadcontainersinglecolumn">
        <h2 className="subrub small">Cashflow Statement</h2>
      </div>

      <div className="chartcontainerdoublecolumn">
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Capital Expenditure vs Net Earnings"
          data={capexVsNetEarningsData}
          options={lineBehindBars}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Buybacks + Dividends vs Net Earnings"
          data={buybacksDividendsData}
          options={lineBehindBars}
        />
      </div>
    </div>
  );
}
