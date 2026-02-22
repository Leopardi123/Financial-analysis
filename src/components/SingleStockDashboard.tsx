import { useEffect, useMemo, useState } from "react";
import Admin from "./Admin";
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
    const info = metricInfoMap[metric.infoKey ?? metric.label] ?? defaultMetricInfo(metric.label);
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
            sections={info.sections}
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

const INFO_SECTION_HEADINGS = {
  measure: "Vad det mäter",
  formula: "Hur det beräknas",
  interpretation: "Hur man tolkar värdet",
  pitfalls: "Vanliga fallgropar",
  framework: "Ramverk",
} as const;

type MetricInfoSection = { heading: string; lines: string[] };
type MetricInfo = { title: string; sections: MetricInfoSection[] };

function buildMetricInfo(
  title: string,
  measure: string[],
  formula: string[],
  interpretation: string[],
  pitfalls: string[],
  framework: string[],
): MetricInfo {
  return {
    title,
    sections: [
      { heading: INFO_SECTION_HEADINGS.measure, lines: measure },
      { heading: INFO_SECTION_HEADINGS.formula, lines: formula },
      { heading: INFO_SECTION_HEADINGS.interpretation, lines: interpretation },
      { heading: INFO_SECTION_HEADINGS.pitfalls, lines: pitfalls },
      { heading: INFO_SECTION_HEADINGS.framework, lines: framework },
    ],
  };
}

const metricInfoMap: Record<string, MetricInfo> = {
  Efficiency: buildMetricInfo(
    "Efficiency",
    ["Sektionen sammanfattar marginaler, kassakonvertering, kapitalintensitet och avkastning."],
    ["Bygger på rapporterad data från resultaträkning, kassaflöde och balansräkning i Producer Core."],
    ["Starkt utfall kräver både god nivå och stabilitet över flera år.", "Jämför med historik och relevanta peers för att skilja cyklisk medvind från strukturell kvalitet."],
    ["Enstaka toppår kan ge falsk trygghet.", "Isolerade nyckeltal utan korscheck mot skuld och kassaflöde ökar feltolkning."],
    ["Buffetology + Syding."]
  ),
  Resilience: buildMetricInfo(
    "Resilience",
    ["Sektionen mäter finansiell motståndskraft via skuldsättning, likviditet och stabilitet i kassaflöde."],
    ["Kombinerar nettoskuld, räntetäckning, current ratio och volatilitet i fritt kassaflöde."],
    ["Lägre belåning och högre täckningsgrader är positivt, särskilt om de håller över en hel konjunkturcykel."],
    ["Likviditet kan tillfälligt se stark ut efter kapitalanskaffning.", "Bedöm alltid tillsammans med skuldtrend och kassaflödeskvalitet."],
    ["RR + Buffetology."]
  ),
  Value: buildMetricInfo(
    "Value",
    ["Sektionen visar multiplar, kassaflödesavkastning och förenklade värderingssignaler."],
    ["Bygger på marknadsvärde/enterprise value i relation till resultat- och kassaflödesmått, plus 5-årsmedianer."],
    ["Billig multipel är mest användbar när kvalitet och balansräkning också är stabil.", "Jämför med bolagets egen historik, peers och ränteläge."],
    ["Låga multiplar kan spegla verklig risk i stället för felprissättning.", "Undvik att läsa implied return utan att kontrollera antaganden bakom vinst/FCF."],
    ["Syding + Buffetology."]
  ),
  "RR Snapshot": buildMetricInfo(
    "RR Snapshot",
    ["Sektionen sammanfattar RR-overlay med skala, kapitalavkastning, balansrisk och enkel fair value-signal."],
    ["Bygger på rr_overlay-output samt FV2-beräkning i UI för revenue mode."],
    ["Hög klassning kräver balans mellan skala, avkastning och robust balansräkning.", "Använd utfallet som triagering före djupare analys."],
    ["Null/false i flaggor kan bero på datagap snarare än låg kvalitet.", "Övertolka inte enstaka RR-mått utan stöd av Producer Core."],
    ["RR-framework."]
  ),
  gross_margin: buildMetricInfo("Gross margin", ["Bruttomarginal visar hur stor andel av intäkterna som återstår efter direkta kostnader."], ["Gross margin = Gross profit delat med Revenue."], ["Stigande och stabil nivå över tid signalerar prissättningskraft eller kostnadsfördel.", "Jämför med egen historik och peers i samma delbransch."], ["Råvarupris eller mixskifte kan driva tillfälliga hopp.", "Hög nivå ett enskilt år är svag evidens utan flerårs-stabilitet."], ["Buffetology."]),
  operating_margin: buildMetricInfo("Operating margin", ["Rörelsemarginal mäter kärnverksamhetens lönsamhet före finansiering och skatt."], ["Operating margin = Operating income delat med Revenue."], ["Förbättring över flera år tyder på effektivisering eller starkare konkurrensposition.", "Jämför mot peers eftersom normalnivå varierar kraftigt mellan branscher."], ["Engångsposter kan tillfälligt lyfta marginalen.", "Kostnadskutt kan ge kortsiktig förbättring som inte är hållbar."], ["Syding + Buffetology."]),
  net_margin: buildMetricInfo("Net margin", ["Nettomarginal visar slutlig lönsamhet efter alla kostnader inklusive räntor och skatt."], ["Net margin = Net income delat med Revenue."], ["Stabil nettomarginal över tid visar motståndskraft genom cykler.", "Använd tillsammans med operating margin för att skilja operativ effekt från finansiering/skatt."], ["Skatte- och finansieringseffekter kan ge stora svängningar.", "En hög nettomarginal utan starkt kassaflöde kan vara lågkvalitativ."], ["Syding."]),
  margin_trend_label: buildMetricInfo("Margin trend", ["Visar riktning på marginalutvecklingen de senaste fem åren."], ["Bygger på trendklassning av historiska marginalserier i Producer Core."], ["Positiv trend stärker tesen om förbättrad affärskvalitet.", "Flat eller negativ trend bör vägas mot värdering och skuldrisk."], ["Trend kan påverkas av låg bas efter svagt år.", "Trendetikett ersätter inte faktisk nivåanalys."], ["Syding."]),
  ocf_to_ni: buildMetricInfo("OCF / NI", ["Mäter hur väl redovisad vinst blir operativt kassaflöde."], ["OCF / NI = Operating cash flow delat med Net income."], ["Över cirka 1.0 över flera år är normalt ett kvalitetsbevis.", "Under 1.0 under längre perioder kräver förklaring och peer-jämförelse."], ["Working capital-svängningar kan ge tillfälliga avvikelser.", "Ett starkt år räcker inte; bedöm minst 3–5 år."], ["Buffetology."]),
  fcf_to_ni: buildMetricInfo("FCF / NI", ["Visar hur stor del av vinsten som blir fritt kassaflöde efter investeringar."], ["FCF / NI = Free cash flow delat med Net income."], ["Hög och stabil kvot indikerar god kassakvalitet och finansieringsflexibilitet.", "Låg kvot kräver kontroll av capexbehov och arbetskapital."], ["Tillväxtfaser kan pressa kvoten trots stark affär.", "Negativ FCF i enstaka år är inte alltid varningssignal utan kontext."], ["Buffetology."]),
  accrual_flag: buildMetricInfo("Accrual", ["Flaggar risk för svag kassakonvertering relativt redovisad vinst."], ["Sätts när OCF återkommande understiger NI enligt Producer Core-regeln."], ["True är en varningssignal som bör korscheckas mot kundfordringar, lager och capex.", "False minskar risken men eliminerar den inte."], ["Redovisningsförändringar kan ge brus i flaggan.", "Läs tillsammans med OCF/NI och FCF/NI, inte isolerat."], ["Buffetology."]),
  capex_to_revenue: buildMetricInfo("Capex / Revenue", ["Mäter kapitalintensitet i förhållande till omsättning."], ["Capex / Revenue = Absolutvärde av Capex delat med Revenue."], ["Hög kvot kräver att avkastningen på investerat kapital också är hög.", "Jämför med historik och peers för att avgöra om nivån är strukturell."], ["Engångsinvesteringar kan ge tillfälliga toppar.", "Låg kvot kan betyda underinvestering snarare än styrka."], ["Buffetology."]),
  capex_to_ocf: buildMetricInfo("Capex / OCF", ["Visar hur stor del av operativt kassaflöde som binds i investeringar."], ["Capex / OCF = Absolutvärde av Capex delat med Operating cash flow."], ["Lägre kvot ger mer utrymme för skuldneddragning, utdelning och återköp.", "Hög kvot kan vara sund i expansionsfas om avkastningen följer med."], ["Negativt eller mycket lågt OCF gör kvoten instabil.", "Bedöm minst en hel cykel för att undvika fel slutsatser."], ["Buffetology."]),
  ppe_vs_revenue_signal: buildMetricInfo("PPE vs Revenue", ["Signal om investeringstakt i anläggningstillgångar matchar intäktstillväxt."], ["Jämför trend i PPE mot trend i Revenue över flerårsperiod."], ["PPE som växer snabbare än revenue länge kan indikera pressad kapitalproduktivitet.", "Liknande tillväxttakt stödjer effektiv kapitalallokering."], ["Stora projekt har naturlig ledtid innan intäkter syns.", "Engångsavyttringar kan tillfälligt förvränga signalen."], ["Syding."]),
  net_debt: buildMetricInfo("Net debt", ["Nettoskuld visar räntebärande skuld efter avdrag för kassa."], ["Net debt = Total debt minus Cash och cash equivalents."], ["Lägre eller fallande nettoskuld förbättrar motståndskraft och valfrihet.", "Negativ nettoskuld innebär nettokassa och ofta lägre finansieringsrisk."], ["Tillfällig kassa från emission eller tillgångsförsäljning kan överskatta styrkan.", "Jämför alltid mot kassaflöde (exempelvis Net debt/FCF)."], ["RR + Buffetology."]),
  net_debt_to_ebitda: buildMetricInfo("Net debt / EBITDA", ["Mäter skuldbörda relativt löpande intjäningskapacitet före avskrivningar."], ["Net debt / EBITDA = Net debt delat med EBITDA."], ["<1.5x är ofta konservativt, 1.5–3x medelnivå, >3x förhöjd risk i cykliska bolag.", "Tolka alltid nivå med hänsyn till stabilitet i EBITDA och ränteläge."], ["EBITDA kan överdriva betalningsförmåga i kapitalintensiva bolag.", "Engångsvinster i EBITDA kan tillfälligt förbättra kvoten."], ["RR."]),
  interest_coverage: buildMetricInfo("Interest coverage", ["Mäter Producer Core-bolagets förmåga att täcka räntekostnader med rörelseresultat."], ["Interest coverage = EBIT delat med Interest expense."], ["<1.5x är stressat, 1.5–3x skört, 3–8x okej och >8x starkt.", "Extremt höga nivåer kan bero på tillfälligt låga räntor; korschecka mot nettoskuld och FCF."], ["Negativ EBIT gör kvoten svårtolkad och kräver djupare analys.", "Jämför över flera år och mot peers, inte bara senaste året."], ["Producer Core (RR-inspirerad balansanalys)."]),
  debt_trend_label: buildMetricInfo("Debt trend", ["Visar riktning på bolagets nettoskuld över tid."], ["Trendklassning baserad på flerårsserie för nettoskuld."], ["Nedåtgående trend är positiv om den inte drivs av kortsiktiga engångseffekter.", "Uppåtgående trend kräver att avkastning och kassaflöde förbättras samtidigt."], ["Förvärv kan öka skuld kortsiktigt men vara värdeskapande.", "Trendetikett utan nivå- och kassaflödesanalys kan bli missvisande."], ["Syding."]),
  roe: buildMetricInfo("ROE", ["Mäter avkastning på aktieägarnas bokförda kapital."], ["ROE = Net income delat med Average equity."], ["Stabilt hög ROE över flera år kan indikera konkurrensfördel.", "Jämför med peers och kontrollera att skuldsättning inte ensamt driver nivån."], ["Återköp kan lyfta ROE genom lägre eget kapitalbas.", "Engångsvinster kan ge falskt hög ROE."], ["Buffetology."]),
  roic_pre_tax: buildMetricInfo("ROIC pre-tax", ["Mäter operativ avkastning före skatt på investerat kapital."], ["ROIC pre-tax = EBIT delat med investerat kapital (proxy i Producer Core)."], ["Hög och stabil ROIC över kapitalkostnad tyder på värdeskapande.", "Jämför med historik och peers för att verifiera hållbar nivå."], ["Definitionen av investerat kapital varierar mellan datakällor.", "Engångsposter i EBIT kan tillfälligt förvränga kvoten."], ["Buffetology + RR."]),
  roe_trend_5Y: buildMetricInfo("ROE trend 5Y", ["Visar om avkastning på eget kapital förbättras eller försämras över fem år."], ["Trendklassning av historiska ROE-observationer under 5 år."], ["Positiv trend stärker tesen om bättre kapitalallokering.", "Negativ trend kan vara varning även om nuvarande ROE ser hög ut."], ["Trend från mycket låg bas kan överskatta förbättring.", "Utvärdera tillsammans med skuldnivå och marginaltrend."], ["Syding."]),
  shares_trend_5Y: buildMetricInfo("Shares trend 5Y", ["Visar förändringstakt i antal utestående aktier."], ["Beräknas som CAGR för shares outstanding över 5 år."], ["Negativ/flat trend är ofta aktieägarvänlig, positiv trend signalerar utspädning.", "Jämför med kassaflöde och avkastning för att bedöma kvaliteten i kapitalallokeringen."], ["Aktiebaserad ersättning kan skapa gradvis utspädning.", "M&A-finansiering med aktier kan vara rationell trots stigande aktieantal."], ["Buffetology."]),
  retained_vs_ni_signal: buildMetricInfo("Retained vs NI", ["Jämför återhållen vinst med redovisad nettoinkomst över tid."], ["Signal bygger på relation mellan kumulativ retained earnings och kumulativ net income."], ["Stödjande signal tyder på att vinster i större grad stannar i bolaget och kan återinvesteras.", "Avvikelse kräver kontroll av utdelning, återköp och engångsposter."], ["Kapitaltransaktioner kan påverka retained earnings utan att spegla underliggande kvalitet.", "Signalen ersätter inte analys av faktisk avkastning på återinvesterat kapital."], ["Buffetology."]),
  quality_flags: buildMetricInfo("Quality flags", ["Samlar positiva signaler kring kassakonvertering, marginaler och kapitaldisciplin."], ["Antal/utfall härleds från Producer Core-regler över flera nyckeltal."], ["Fler positiva flaggor stärker kvalitetscaset när de är konsekventa över tid.", "Bekräfta med historik, peers och värdering innan slutsats."], ["Flaggor är förenklingar och fångar inte alla nyanser.", "Hög score utan rimlig värdering kan fortfarande ge svag risk/reward."], ["Producer Core."]),
  risk_flags: buildMetricInfo("Risk flags", ["Samlar varningssignaler som svag FCF, marginalpress och möjlig utspädning."], ["Flaggor sätts av Producer Core-regler när riskmönster upptäcks i tidsserier."], ["Flera samtidiga riskflaggor talar för högre säkerhetsmarginal i värderingen.", "Kontrollera om signalerna är tillfälliga eller återkommande i flerårsdata."], ["Enskilda flaggor kan vara cykliska och reversera snabbt.", "Att ignorera flaggor i högt belånade bolag ökar nedsidesrisk."], ["Producer Core."]),
  invalid_capital_employed: buildMetricInfo("Invalid capital employed", ["Diagnostikflagga för bristfällig eller orimlig kapitalbas i avkastningsmått."], ["Sätts när kapital employed inte kan beräknas robust från tillgängliga datapunkter."], ["True innebär att ROCE/ROIC-relaterade slutsatser ska viktas ned tills data är verifierad."], ["Att behandla flaggan som neutral kan ge felklassning av kapitalavkastning."], ["Datakvalitetskontroll."]),
  ev_formula_check: buildMetricInfo("EV formula check", ["Kontrollerar att enterprise value-komponenter hänger ihop enligt intern formel."], ["Jämför EV-komponenter mot formelutfall i Producer Core-diagnostik."], ["Avvikelse indikerar att värderingsmultiplar kan vara opålitliga tills felkälla är löst."], ["Små avrundningsskillnader är normalt, stora differenser är varningssignal."], ["Datakvalitetskontroll."]),
  accounting_anomaly: buildMetricInfo("Accounting anomaly", ["Flagga för ovanliga redovisningsmönster som kan försvåra jämförelser."], ["Sätts när interna regler hittar avvikande relationer i rapporterad data."], ["True kräver extra konservatism och manuell kontroll av noter/engångsposter."], ["Anomalier behöver inte betyda manipulation men ökar osäkerheten i modellutfall."], ["Datakvalitetskontroll."]),
  current_ratio: buildMetricInfo("Current ratio", ["Likviditetsmått för kortsiktig betalningsförmåga."], ["Current ratio = Omsättningstillgångar delat med kortfristiga skulder."], ["Runt 1.2–2.0 är ofta balanserat; under 1.0 kan signalera pressad likviditet.", "För höga nivåer kan betyda ineffektivt bundet kapital."], ["Säsongsvariationer kan ge missvisande kvartalsnivåer.", "Måttet fångar inte kvaliteten i tillgångarna."], ["Resilience-analys."]),
  cash_vs_short_term_debt: buildMetricInfo("Cash vs short debt", ["Jämför kassaposition mot skulder som förfaller inom kort tid."], ["Cash vs short debt = Cash och likvida medel dividerat med short-term debt."], ["Över 1.0 innebär i regel bättre refinansieringsmarginal på kort sikt.", "Under 1.0 kräver kontroll av kreditlinor och operativt kassaflöde."], ["Tillfällig kassa runt bokslutsdatum kan ge för optimistisk bild.", "Måttet bör kombineras med räntetäckning och skuldprofil."], ["Resilience-analys."]),
  fcf_volatility_5Y: buildMetricInfo("FCF volatility 5Y", ["Visar hur stabilt fritt kassaflöde varit över fem år."], ["Volatilitet beräknas på 5-årsserie för fritt kassaflöde."], ["Lägre volatilitet ökar förutsägbarhet i skuldservice och värdering.", "Hög volatilitet kräver större säkerhetsmarginal och stresstest."], ["Cykelbolag kan naturligt ha hög volatilitet.", "Kort historik kan ge instabil uppskattning."], ["Resilience-analys."]),
  pe: buildMetricInfo("P/E", ["Värderingsmultipel mellan aktiekurs och vinst per aktie."], ["P/E = Price per share delat med Earnings per share."], ["Lågt P/E kan vara attraktivt om vinsten är hållbar.", "Högt P/E kan vara rimligt vid hög kvalitet och tillväxt med låg balansrisk."], ["Negativ eller tillfälligt uppblåst vinst gör multipeln svårtolkad.", "Jämför alltid mot historik, peers och räntemiljö."], ["Syding."]),
  earnings_yield: buildMetricInfo("Earnings yield", ["Inverterat P/E som visar vinstavkastning på priset."], ["Earnings yield = EPS delat med Price (eller 1 / P/E)."], ["Högre yield kan indikera lägre värdering relativt vinstnivå.", "Jämför mot obligationsräntor, historik och vinststabilitet."], ["Engångsvinster kan ge artificiellt hög yield.", "Låg kvalitet i vinsten minskar informationsvärdet."], ["Syding."]),
  p_fcf: buildMetricInfo("P/FCF", ["Värderingsmultipel mellan marknadsvärde och fritt kassaflöde."], ["P/FCF = Price per share delat med Free cash flow per share."], ["Lägre multipel är positiv om FCF är uthålligt och inte toppcykliskt.", "Använd flerårsmedian för att dämpa cykelbrus."], ["Negativt eller extremt svängigt FCF gör måttet instabilt.", "Tillfälligt låg capex kan överdriva styrkan."], ["Syding + Buffetology."]),
  fcf_yield: buildMetricInfo("FCF yield", ["Visar fritt kassaflöde relativt marknadsvärde."], ["FCF yield = Free cash flow delat med Market cap."], ["Högre yield är positivt när kassaflödet är stabilt och skuldnivån rimlig.", "Korschecka mot Net debt/FCF och capexbehov."], ["Cyklisk topp i FCF kan ge falskt hög yield.", "Jämför med peers för att skilja strukturell kvalitet från kortsiktig effekt."], ["Syding."]),
  ev_ebitda: buildMetricInfo("EV/EBITDA", ["Enterprise-multipel som värderar hela verksamheten mot EBITDA."], ["EV/EBITDA = Enterprise value delat med EBITDA."], ["Lägre multipel kan indikera billigare totalvärdering.", "Tolka i relation till tillväxt, marginalstabilitet och capexintensitet."], ["EBITDA bortser från investeringar och kan överskatta kassagenerering.", "Olika leasing/redovisning kan påverka jämförbarhet."], ["Syding."]),
  ev_ebit: buildMetricInfo("EV/EBIT", ["Enterprise-multipel mot rörelseresultat efter avskrivningar."], ["EV/EBIT = Enterprise value delat med EBIT."], ["Mer konservativ än EV/EBITDA i kapitalintensiva bolag.", "Lägre nivå är generellt bättre givet liknande kvalitet och risk."], ["Tillfälligt högt/lågt EBIT kan förvränga signalen.", "Redovisningsskillnader i avskrivningar påverkar jämförelse."], ["Syding."]),
  ev_fcf: buildMetricInfo("EV/FCF", ["Enterprise-multipel mot fritt kassaflöde."], ["EV/FCF = Enterprise value delat med Free cash flow."], ["Låg multipel kombinerad med stabil FCF kan ge attraktiv risk/reward.", "Jämför med historik för att undvika köp i tillfällig topp-FCF."], ["Negativt FCF gör måttet svåranvänt.", "FCF-definition (maintenance vs growth capex) måste vara konsekvent."], ["Syding + RR."]),
  net_debt_over_ev: buildMetricInfo("Net debt / EV", ["Visar hur stor del av enterprise value som utgörs av nettoskuld."], ["Net debt / EV = Net debt delat med Enterprise value."], ["Lägre kvot innebär att equity står för större del av värdet och ger mer finansiell flexibilitet.", "Hög kvot kräver starkare kassaflöde och räntetäckning."], ["Fallande EV kan höja kvoten snabbt utan att skulden ändras.", "Jämför med Net debt/FCF och maturitetsprofil."], ["Value + Resilience."]),
  median_ni_5y: buildMetricInfo("Median NI (5Y)", ["Femårsmedian av nettoresultat för att dämpa engångsvariationer."], ["Tar medianen av årliga net income-värden under de senaste fem åren."], ["Högre och stabil median stödjer robust intjäningskapacitet.", "Jämför median mot senaste år för att se om bolaget är över eller under normalnivå."], ["Kort historik eller stora strukturella skiften minskar jämförbarheten.", "Median fångar inte trendriktning på egen hand."], ["Syding."]),
  median_ebit_margin_5y: buildMetricInfo("Median EBIT margin (5Y)", ["Normaliserad rörelsemarginal baserad på femårsmedian."], ["Median EBIT margin = median av EBIT/Revenue över 5 år."], ["Ger bättre basnivå än ett enskilt år i cykliska bolag.", "Använd som ankare när du tolkar EV/EBIT och implied return."], ["Om affärsmodellen ändrats nyligen kan historisk median vara inaktuell.", "Måttet måste jämföras med peers för rätt kontext."], ["Syding."]),
  median_fcf_5y: buildMetricInfo("Median FCF (5Y)", ["Normaliserat fritt kassaflöde över fem år."], ["Median FCF (5Y) = median av årligt fritt kassaflöde under 5 år."], ["Minskar risken att värdera bolaget på topp- eller bottenår.", "Jämför mot capexbehov och skuld för att bedöma hållbarhet."], ["Snabba strukturella förändringar kan göra historisk median mindre relevant.", "Valutaeffekter och engångsposter bör justeras i djupare analys."], ["Syding + RR."]),
  implied_return: buildMetricInfo("Implied return", ["Snabbheuristik för förväntad avkastning givet nuvarande värdering och normaliserad intjäning."], ["Bygger på relationen mellan normaliserad earning power/FCF och aktuellt pris eller EV."], ["Högre implied return är positivt om antagandena om hållbar vinst och risk är rimliga.", "Jämför mot avkastningskrav och alternativa investeringar."], ["Överkänslig för antaganden om normaliserad vinst och diskonteringskrav.", "Använd inte isolerat utan stöd av kvalitets- och balansmått."], ["Syding."]),
  value_band: buildMetricInfo("Value band", ["Klassificerar värdering i zoner utifrån samlad signal från multiplar och avkastningsmått."], ["Regelbaserad klassning från Producer Core value-modul."], ["Band i attraktiv zon är mest användbart när kvalitet och balansrisk samtidigt är god.", "Gränsfall bör valideras med scenarioanalys och peer-jämförelse."], ["Band är en förenkling och kan dölja viktiga nyanser.", "Snabba marknadsrörelser kan flytta klassning utan att fundamenta ändras."], ["Value framework."]),
  rr_scale_10y_recoverable_value_usd: buildMetricInfo("10Y recoverable value", ["Proxy för återvinningsbart värde över 10 år i RR-skala."], ["Bygger på RR-overlay-data för långsiktig återvinningsbar värdebas i USD."], ["Högre nivå kan stödja institutionsskala om data är komplett.", "Jämför med marknadsvärde och reserver för rimlighetskontroll."], ["Måttet är känsligt för antaganden om reserver och långsiktiga priser.", "Datagap kan ge null utan att affären är svag."], ["RR."]),
  scale_flag: buildMetricInfo("Scale flag", ["Kvalitativ RR-klassning av bolagets institutionsskala."], ["Härleds från RR-regler som använder scale-relaterade indikatorer."], ["InstitutionalScale är positivt, Subscale signalerar begränsad skalfördel.", "Bekräfta med historisk lönsamhet och kapitaldisciplin."], ["Skala i sig säger inte om avkastningen är god.", "Flaggan kan vara oklar när underliggande data saknas."], ["RR."]),
  rr_roce: buildMetricInfo("ROCE", ["RR-kontextens avkastning på sysselsatt kapital."], ["ROCE = EBIT delat med capital employed i RR-lagret."], ["<10% svagt, 10–20% okej, 20–40% starkt, >40% mycket starkt.", "Extremt höga värden bör korscheckas mot kapitaldefinition och hållbarhet."], ["Låg kapitalbas kan blåsa upp kvoten.", "Engångsposter i EBIT kan ge missvisande toppar."], ["RR."]),
  rr_roce_flag: buildMetricInfo("ROCE flag", ["Klassificerar ROCE-nivån i RR-overlay."], ["Bygger på tröskelregler applicerade på rr_roce."], ["Hög flaggnivå är positiv när den är stabil över flera år.", "Korschecka med skuldmått för att undvika att belåning maskerar risk."], ["Flaggan förenklar ett kontinuerligt mått och tappar nyanser.", "Se upp med klassgränser nära trösklar."], ["RR."]),
  margin_buffer: buildMetricInfo("Margin buffer", ["RR-proxy för motståndskraft i marginal mot kostnads- och prisstress."], ["Bygger på operativ marginal i RR-lagret som buffertmått."], ["<10% tunn buffert, 10–25% okej, 25–40% stark, >40% mycket stark (branschberoende).", "Verifiera stabilitet över tid och mot peers."], ["Temporära prisuppgångar kan blåsa upp bufferten.", "Hög marginal utan kassakonvertering är en varningssignal."], ["RR."]),
  cost_quartile: buildMetricInfo("Cost quartile", ["Mäter kostnadsposition relativt global kostnadskurva i RR."], ["Bygger på extern benchmark för kostnadskvartil när sådan finns."], ["Lägre kvartil är bättre och indikerar högre robusthet vid prisfall.", "Null betyder oftast datagap, inte neutral kvalitet."], ["Saknad benchmark får inte tolkas som låg risk.", "Olika benchmarkkällor kan ge olika kvartilutfall."], ["RR."]),
  reserve_life: buildMetricInfo("Reserve life", ["Visar hur länge reserver kan stödja nuvarande produktion."], ["Reserve life = Reserver dividerat med årlig produktion (år), när data finns."], ["Längre reservliv minskar reinvesteringspress och produktionsrisk.", "Kort reservliv kräver tydlig plan för ersättningsreserver."], ["Null i revenue mode beror ofta på saknad projekt/reservdata.", "Lång reservlivslängd utan lönsamhet är inte tillräckligt."], ["RR."]),
  rr_net_debt_fcf: buildMetricInfo("Net debt / FCF", ["RR-mått på skuldbörda relativt uthålligt fritt kassaflöde."], ["Net debt / FCF = Net debt delat med sustaining FCF."], ["<0 nettokassa, 0–1.5x konservativt, 1.5–3x medel, >3x förhöjd risk.", "Tolka med FCF-stabilitet och refinansieringsbehov."], ["Tillfällig FCF-topp kan ge falskt trygg kvot.", "Negativ FCF gör kvoten svårtolkad och kräver scenarioanalys."], ["RR."]),
  rr_interest_coverage: buildMetricInfo("Interest coverage (RR)", ["RR-kontextens räntetäckning för kreditstressbedömning."], ["Interest coverage = EBIT delat med Interest expense i RR-lagret."], ["<1.5x stressat, 1.5–3x skört, 3–8x okej och >8x starkt.", "Extremt höga nivåer kan bero på mycket låg räntekostnad; korschecka med nettoskuld och FCF."], ["Engångseffekter i EBIT kan ge övertolkning.", "Jämför över flera år för att bedöma hållbarhet."], ["RR."]),
  fv2_enterprise: buildMetricInfo("FV2 (Enterprise, USD)", ["Förenklad enterprise valuation baserad på normaliserat fritt kassaflöde."], ["Steg 1: median FCF (5Y). Steg 2: FV2 enterprise = median FCF delat med discount rate."], ["Lägre diskonteringsränta ger högre värde och tvärtom.", "Jämför med aktuellt EV för att bedöma relativ över-/undervärdering."], ["Modellen antar perpetuitet och fångar inte cykel/regimskiften fullt ut.", "Små ändringar i r ger stor effekt på utfallet."], ["RR FV2."]),
  fv2_equity: buildMetricInfo("FV2 (Equity, USD)", ["Värde till aktieägare efter avdrag för nettoskuld."], ["Steg 1: FV2 enterprise. Steg 2: FV2 equity = FV2 enterprise minus Net debt."], ["Starkt equityvärde kräver både rimligt enterprisevärde och kontrollerad skuldsättning.", "Negativt equityvärde signalerar hög finansieringsrisk."], ["Fel i nettoskuld slår direkt på equityvärdet.", "Bör valideras mot alternativa värderingsmetoder."], ["RR FV2."]),
  fv2_per_share: buildMetricInfo("FV2 (Per share, USD)", ["Översätter FV2 equity till ett värde per aktie."], ["FV2 per share = FV2 equity delat med utestående aktier."], ["Jämför med marknadspris för snabb värderingssignal.", "Null eller extremt värde kräver kontroll av shares-data."], ["Felaktigt aktieantal ger direkt missvisande värde per aktie.", "Utspädning över tid bör beaktas i jämförelsen."], ["RR FV2."]),
  ev_over_fv2: buildMetricInfo("EV / FV2_EV", ["Relativ multipel mellan aktuellt enterprise value och FV2 enterprise."], ["EV / FV2 = Aktuellt EV delat med FV2 enterprise."], ["<0.8 kan indikera rabatt, 0.8–1.2 nära fair value, >1.2 möjlig premie.", "Tolka zon tillsammans med kvalitet och balansrisk.", "Om aktuellt EV saknas eller är <= 0 visas värdet som — (missing EV)."], ["Förenklad FV2 kan avvika kraftigt från full DCF.", "Kortsiktiga marknadsrörelser kan flytta kvoten snabbt."], ["RR FV2."]),
  rr_classification: buildMetricInfo("RR classification", ["Samlad RR-klassning av skala, avkastning och balansrobusthet."], ["Härleds från RR-overlay-regler där flera delmått vägs samman."], ["Hög klass är starkast när delmåtten pekar åt samma håll över tid.", "Använd klassningen som startpunkt för vidare analys, inte slutbeslut."], ["Klassning nära gränser kan ändras snabbt av små dataskift.", "Datagap i underliggande mått kan ge underskattad kvalitet."], ["RR."]),
  fv3_disabled: buildMetricInfo("Fair value 3", ["Markerar att FV3-modellen inte används i revenue mode."], ["FV3 kräver projekt/LOM-antaganden och är därför avstängd i denna vy."], ["Statusen 'Ej aktiv' är förväntad och inte ett systemfel."], ["Att tolka avsaknad av FV3 som negativ signal är fel.", "Använd FV2 och övriga RR-mått tills FV3-data finns."], ["UI-designregel."]),
  missing_median_fcf: buildMetricInfo("missing_median_fcf", ["Flagga för att femårsmedian av FCF saknas."], ["Sätts när inputdata inte räcker för att beräkna median FCF (5Y)."], ["True innebär att FV2 blir osäkert eller ej beräkningsbart."], ["Tolka inte false som kvalitetsbevis, endast datatillgänglighet."], ["RR datakvalitet."]),
  missing_net_debt: buildMetricInfo("missing_net_debt", ["Flagga för saknad nettoskuld i FV2-beräkningen."], ["Sätts när debt/cash-data inte räcker för Net debt."], ["True betyder att equity-härledningen i FV2 inte kan valideras robust."], ["Saknat värde är datagap, inte neutral balanssignal."], ["RR datakvalitet."]),
  missing_shares: buildMetricInfo("missing_shares", ["Flagga för saknat antal utestående aktier."], ["Sätts när shares-data saknas för beräkning av FV2 per share."], ["True gör per-share-tolkning opålitlig även om enterprise/equity finns."], ["Aldrig jämför per-share mot kurs när flaggan är true."], ["RR datakvalitet."]),
  invalid_discount_rate: buildMetricInfo("invalid_discount_rate", ["Flagga för ogiltig diskonteringsränta i FV2."], ["Sätts när discount rate är noll, negativ eller utanför tillåtet intervall."], ["True innebär att FV2-värden inte ska användas beslutsmässigt förrän input är korrigerad."], ["Små inmatningsfel i r kan ge stora värderingsfel."], ["RR datakvalitet."]),
  missing_benchmark: buildMetricInfo("Missing benchmark", ["Visar att extern benchmark för cost quartile saknas."], ["Sätts från rr_cost_quartile_flags.missing_benchmark."], ["True betyder att cost quartile-analysen är ofullständig och måste kompletteras manuellt."], ["Detta är ett datatäckningsproblem, inte en kvalitetsdom om bolaget."], ["RR datakvalitet."]),
  missing_reserves: buildMetricInfo("Missing reserves", ["Visar att reservdata saknas för reserve life-analys."], ["Sätts från rr_reserve_life_flags.missing_reserves."], ["True innebär att långsiktig produktionsuthållighet inte kan bedömas fullt ut i RR."], ["Tolka inte saknad reservdata som kort reservlivslängd."], ["RR datakvalitet."]),
};

const defaultMetricInfo = (label: string): MetricInfo => buildMetricInfo(
  label,
  ["Måttet sammanfattar en central signal i panelen."],
  ["Beräkningen baseras på rapporterad finansiell data och respektive modulregler."],
  ["Tolka nivån mot bolagets historik, peers och stabilitet över flera år."],
  ["Undvik att dra slutsatser från ett enskilt datapunkt eller enbart ett mått."],
  ["Producer Core / RR beroende på sektion."]
);



const BUFFETOLOGY_CHART_INFO_MAP: Record<string, MetricInfo> = {
  "EBITDA Margin": {
    title: "EBITDA Margin",
    sections: [
      { heading: "LEGACY", lines: [`Warren Buffett tittar inte på EBITDA som primärt mått, men han är mycket intresserad av rörelsens inneboende lönsamhet.  

EBITDA visar hur stark affärsmodellen är innan kapitalintensitet och finansiering påverkar resultatet.  

Ett bolag med stabil och hög EBITDA-marginal indikerar ofta:
- Prissättningsmakt
- Operativ hävstång
- Strukturell kostnadsfördel  

Om EBITDA är volatil eller cyklisk utan tydlig förbättring, tyder det på att bolaget saknar moat.`] },
      { heading: "CENTRAL ADDITION", lines: ["- EBITDA kan dölja reinvesteringsbehov. Tolka alltid tillsammans med Capex och Free Cash Flow för att se om lönsamheten är “kassareell”.", "- För kapitalintensiva bolag, var extra försiktig med att dra moat-slutsatser från EBITDA-marginal isolerat."] },
    ],
  },
  "Net Income Margin": {
    title: "Net Income Margin",
    sections: [
      { heading: "LEGACY", lines: [`Buffett föredrar företag som konsekvent kan behålla en hög andel av varje intäktskrona som vinst.  

Net income margin visar affärens fulla ekonomiska kraft, efter alla kostnader, inklusive ränta och skatt.  

Ett kvalitetsbolag kännetecknas av:
- Stabil eller stigande nettomarginal över lång tid
- Låg känslighet för konjunktursvängningar  

Kraftiga svängningar kan indikera svag konkurrensposition.`] },
      { heading: "CENTRAL ADDITION", lines: ["- Nettomarginal påverkas starkt av kapitalstruktur och skatt. Jämför därför också Operating Cash Flow och skuldsättningsgrafer för att skilja affärskvalitet från finansieringsval."] },
    ],
  },
  "Cash vs Net Earnings": {
    title: "Cash vs Net Earnings",
    sections: [
      { heading: "LEGACY", lines: [`Buffett är extremt skeptisk till bokföringsvinster som inte omvandlas till kassaflöde.  

Ett av hans centrala filter:  

“Earnings must convert to cash.”  

Om Operating Cash Flow konsekvent är lika med eller större än Net Income är det ett styrketecken.  

Om vinsterna över tid inte genererar kassaflöde är det ett varningstecken för aggressiv redovisning.`] },
      { heading: "CENTRAL ADDITION", lines: ["- Enstaka avvikelser kan bero på rörelsekapital. Titta på flera år och kombinera med Inventory-grafen och kundfordringar om de finns i datat."] },
    ],
  },
  "Free Cash Flow": {
    title: "Free Cash Flow",
    sections: [
      { heading: "LEGACY", lines: [`Detta är det viktigaste måttet i Buffett-analys.  

Free Cash Flow visar vad ägarna faktiskt kan ta ut utan att skada verksamheten.  

Buffett kallar detta för “owner earnings”.  

Ett bolag med:
- Stabil FCF
- Växande FCF
- Låg Capex relativt kassaflöde  

är ofta en kandidat för långsiktig kapitalallokering.`] },
      { heading: "CENTRAL ADDITION", lines: ["- “Owner earnings” handlar om kassaflöde efter nödvändiga investeringar för att bibehålla konkurrenskraft. Tolka därför FCF tillsammans med Depreciation vs PPE för att se om bolaget underinvesterar.", "- Återkommande “engångs-justeringar” som krävs för att få fram FCF är en varningsflagga."] },
    ],
  },
  "Capital Expenditure vs Net Earnings": {
    title: "Capital Expenditure vs Net Earnings",
    sections: [
      { heading: "LEGACY", lines: [`Buffett föredrar verksamheter som inte kräver ständigt reinvesterande av vinsten för att överleva.  

Om Capex över lång tid ≈ Net Income betyder det att:
- Hela vinsten måste återinvesteras
- Det finns lite ägarvärde kvar  

Låg kapitalintensitet är ett tecken på stark affärsmodell.`] },
      { heading: "CENTRAL ADDITION", lines: ["- Skilj mellan underhållsinvesteringar och expansionsinvesteringar när det går. Stabil FCF trots hög Capex kan vara OK om Capex är värdeskapande expansion, men det ska synas i långsiktigt ökande FCF per aktie."] },
    ],
  },
  "Retained Earnings vs Net Income": {
    title: "Retained Earnings vs Net Income",
    sections: [
      { heading: "LEGACY", lines: [`Buffett analyserar hur väl bolag förvaltar kvarhållna vinster.  

Han ställer frågan:  

“För varje dollar som behålls i bolaget, hur mycket marknadsvärde skapas?”  

Om retained earnings växer men:
- ROE faller
- Aktiekursen inte reflekterar värdeskapande  

är kapitalallokeringen ineffektiv.`] },
      { heading: "CENTRAL ADDITION", lines: ["- Nyckeln är att retained earnings ska leda till högre framtida “owner earnings”. Om retained earnings växer men FCF per aktie inte gör det, är det ett tydligt disciplinproblem."] },
    ],
  },
  "ROE": {
    title: "ROE",
    sections: [
      { heading: "LEGACY", lines: [`Buffett älskar bolag med hög och stabil ROE, utan överdriven skuldsättning.  

En ROE över 15% under lång tid indikerar ofta:
- Moat
- Kapitaldisciplin
- Effektiv ledning  

Men hög ROE driven av hög skuld är inte attraktiv.`] },
      { heading: "CENTRAL ADDITION", lines: ["- Tolka alltid ROE tillsammans med Debt to Equity och räntetäckning. Ett “bra” ROE som faller kraftigt när equity växer kan signalera avtagande avkastning på återinvesterat kapital."] },
    ],
  },
  "Debt to Equity": {
    title: "Debt to Equity",
    sections: [
      { heading: "LEGACY", lines: [`Buffett undviker bolag som är beroende av skuld för att generera avkastning.  

Ett kvalitetsbolag ska kunna överleva svåra tider utan att vara beroende av kreditmarknaden.  

Låg skuld:
- Minskar risk
- Ökar optionalitet
- Förhindrar permanent kapitalförlust`] },
      { heading: "CENTRAL ADDITION", lines: ["- Hög skuld ökar risken för permanent kapitalförlust via refinansieringsstress och framtida utspädning. Det är ofta inte volatilitet som dödar ägaren, det är behovet av kapital vid fel tidpunkt."] },
    ],
  },
  "EBIT vs Interest": {
    title: "EBIT vs Interest",
    sections: [
      { heading: "LEGACY", lines: [`Buffett föredrar bolag som kan täcka sina räntekostnader flera gånger om utan stress.  

Svag räntetäckning indikerar:
- Operativ sårbarhet
- Risk vid ränteuppgång
- Potentiell equity-utspädning`] },
      { heading: "CENTRAL ADDITION", lines: ["- Om räntetäckningen ser OK ut bara i högkonjunktur, men kollapsar i sämre år, är bolaget cykliskt sårbart även om snittet ser bra ut."] },
    ],
  },
  "Gross Profit Ratio": {
    title: "Gross Profit Ratio",
    sections: [
      { heading: "LEGACY", lines: [`Buffett analyserar bruttomarginalens stabilitet för att identifiera moat.  

Hög och stabil gross margin över tid är ett av de tydligaste tecknen på:
- Prissättningsmakt
- Varumärkesstyrka
- Strukturell konkurrensfördel`] },
      { heading: "CENTRAL ADDITION", lines: ["- En gross margin som hålls uppe via tillfälliga råvarufördelar eller konjunktur kan lura. Bekräfta med flera cykler och se om Operating margin och FCF följer med."] },
    ],
  },
  "Buybacks + Dividends vs Net Earnings": {
    title: "Buybacks + Dividends vs Net Earnings",
    sections: [
      { heading: "LEGACY", lines: [`Kapitalallokering är centralt i Buffett-filosofin.  

Om ett bolag:
- Genererar överskott
- Återköper aktier under intrinsic value
- Delar ut kapital disciplinerat  

då arbetar ledningen för aktieägarna.  

Men återköp över intrinsic value förstör värde.`] },
      { heading: "CENTRAL ADDITION", lines: ["- Kombinera med Shares Outstanding-trenden. Återköp som inte minskar aktieantalet över tid är ofta kosmetik, särskilt om SBC är hög."] },
    ],
  },
  "Total Equity": {
    title: "Total Equity",
    sections: [
      { heading: "LEGACY", lines: [`Equity ska växa organiskt via retained earnings, inte genom emissioner.  

Buffett föredrar bolag där:
- Equity växer
- ROE förblir hög
- Ingen konstant utspädning sker  

Detta är tecken på intern kapitalgenerering.`] },
      { heading: "CENTRAL ADDITION", lines: ["- Var extra uppmärksam på perioden där equity växer men emissioner avtar. Det är ofta första visuella tecknet på att bolaget går från “finansierat” till “självfinansierande”."] },
    ],
  },
};

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

function toFiniteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function formatPriceValue(value: number | null) {
  if (value === null) {
    return "—";
  }
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMarketCapValue(value: number | null) {
  if (value === null) {
    return "—";
  }
  return value.toLocaleString("en-US", { maximumFractionDigits: 0, useGrouping: true });
}

function parseChartDate(rawDate: unknown): Date | null {
  if (rawDate instanceof Date) {
    return Number.isNaN(rawDate.getTime()) ? null : rawDate;
  }
  if (typeof rawDate === "number" && Number.isFinite(rawDate)) {
    const fromNumber = new Date(rawDate);
    return Number.isNaN(fromNumber.getTime()) ? null : fromNumber;
  }
  if (typeof rawDate === "string") {
    const trimmed = rawDate.trim();
    if (!trimmed) return null;
    const isoDateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (isoDateMatch) {
      const year = Number(isoDateMatch[1]);
      const month = Number(isoDateMatch[2]);
      const day = Number(isoDateMatch[3]);
      const utcDate = new Date(Date.UTC(year, month - 1, day));
      return Number.isNaN(utcDate.getTime()) ? null : utcDate;
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function normalizeDateSeries(data: (string | number | Date | null)[][] | null) {
  if (!data || data.length === 0) {
    return data;
  }
  const [headers, ...rows] = data;
  const normalizedRows = rows
    .map((row) => {
      const [rawDate, ...rest] = row;
      const parsedDate = parseChartDate(rawDate);
      if (!parsedDate) {
        return null;
      }
      const normalizedValues = rest.map((value) => {
        if (value === null) return null;
        if (typeof value === "number" && Number.isFinite(value)) return value;
        if (typeof value === "string") {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
      });
      if (normalizedValues.length > 0 && normalizedValues.every((value) => value === null)) {
        return null;
      }
      return [parsedDate, ...normalizedValues] as (string | number | Date | null)[];
    })
    .filter((row): row is (string | number | Date | null)[] => row !== null)
    .sort((a, b) => (a[0] as Date).getTime() - (b[0] as Date).getTime());

  if (normalizedRows.length === 0) {
    return null;
  }

  return [headers, ...normalizedRows];
}

export default function SingleStockDashboard() {
  const { ticker, data, fetchCompany } = useCompanyData("AAPL");
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
  const buildCommitSha =
    (import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA as string | undefined)
    || (import.meta.env.VITE_GIT_COMMIT_SHA as string | undefined)
    || (import.meta.env.VERCEL_GIT_COMMIT_SHA as string | undefined)
    || "unknown";
  const buildEnv =
    (import.meta.env.VITE_VERCEL_ENV as string | undefined)
    || (import.meta.env.VERCEL_ENV as string | undefined)
    || "unknown";
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
  const statementDerivedSharesOutstanding = (() => {
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
  const sharesOutstanding =
    toFiniteNumber((profile as any)?.sharesOutstanding) ??
    toFiniteNumber((data as any)?.quote?.sharesOutstanding) ??
    statementDerivedSharesOutstanding;

  const totalDebt = (() => {
    const series = (data?.balance as any)?.totalDebt;
    if (!Array.isArray(series)) return null;
    for (let i = series.length - 1; i >= 0; i -= 1) {
      const value = toFiniteNumber(series[i]);
      if (value !== null) return value;
    }
    return null;
  })();
  const cashAndShortTermInvestments = (() => {
    const series = (data?.balance as any)?.cashAndShortTermInvestments;
    if (!Array.isArray(series)) return null;
    for (let i = series.length - 1; i >= 0; i -= 1) {
      const value = toFiniteNumber(series[i]);
      if (value !== null) return value;
    }
    return null;
  })();
  const marketCapForEv =
    toFiniteNumber((profile as any)?.mktCap) ??
    toFiniteNumber((profile as any)?.marketCap) ??
    toFiniteNumber((data as any)?.quote?.marketCap);
  const currentEnterpriseValue = marketCapForEv !== null && totalDebt !== null && cashAndShortTermInvestments !== null
    ? marketCapForEv + totalDebt - cashAndShortTermInvestments
    : null;

  const fv2Ev = rrDiscountRate !== null && medianFcf5Y !== null && medianFcf5Y > 0
    ? medianFcf5Y / rrDiscountRate
    : null;
  const fv2Equity = fv2Ev !== null && rrNetDebt !== null ? fv2Ev - rrNetDebt : null;
  const fv2PerShare = fv2Equity !== null && sharesOutstanding !== null && sharesOutstanding > 0
    ? fv2Equity / sharesOutstanding
    : null;
  const fv2EvSignal = fv2Ev !== null && fv2Ev > 0 && currentEnterpriseValue !== null && currentEnterpriseValue > 0
    ? currentEnterpriseValue / fv2Ev
    : null;
  const fv2Flags = {
    missing_median_fcf: medianFcf5Y === null || medianFcf5Y <= 0,
    missing_net_debt: rrNetDebt === null,
    missing_shares: sharesOutstanding === null || sharesOutstanding <= 0,
    invalid_discount_rate: rrDiscountRate === null || rrDiscountRate <= 0,
  };
  const missingEvForFv2 = currentEnterpriseValue === null || currentEnterpriseValue <= 0;
  const rrInputsReady = rrDiscountRate !== null && rrDiscountRate > 0;

  const fiscalYearEndMonth =
    parseFiscalYearEndMonth(data?.fiscal_year_end_month) ??
    parseFiscalYearEndMonth(data?.fiscal_year_end) ??
    parseFiscalYearEndMonth(profile?.fiscalYearEndMonth) ??
    parseFiscalYearEndMonth(profile?.fiscalYearEnd);

  const exchangeDisplay = [
    profile?.exchangeShortName,
    profile?.exchange,
    profile?.exchangeSymbol,
    profile?.symbolExchange,
  ].find((value) => typeof value === "string" && value.trim().length > 0);

  const priceValue = toFiniteNumber(profile?.price);
  const marketCapValue =
    toFiniteNumber(profile?.mktCap) ??
    toFiniteNumber(profile?.marketCap);

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
          <p className="bread">Sektor: {String(profile.sector ?? "—")}</p>
          <p className="bread">Industri: {String(profile.industry ?? "—")}</p>
          <p className="bread">Valuta: {String(profile.currency ?? "—")}</p>
          <p className="bread">Börs: {exchangeDisplay ? String(exchangeDisplay) : "—"}</p>
          <p className="bread">Aktiepris: {formatPriceValue(priceValue)}</p>
          <p className="bread">Börsvärde: {formatMarketCapValue(marketCapValue)}</p>
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
            <p className="bread" style={{ fontSize: "11px", opacity: 0.8 }}>Build: {buildCommitSha} • Env: {buildEnv}</p>
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
                      sections={metricInfoMap.Efficiency.sections}
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
                      sections={metricInfoMap.Resilience.sections}
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
                      sections={metricInfoMap.Value.sections}
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
                    sections={metricInfoMap["RR Snapshot"].sections}
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
                          { label: "Missing benchmark", infoKey: "missing_benchmark", value: rrOverlay?.rr_cost_quartile_flags?.missing_benchmark ?? false },
                          { label: "Missing reserves", infoKey: "missing_reserves", value: rrOverlay?.rr_reserve_life_flags?.missing_reserves ?? false },
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
                          { label: "missing_median_fcf", value: fv2Flags.missing_median_fcf, infoKey: "missing_median_fcf" },
                          { label: "missing_net_debt", value: fv2Flags.missing_net_debt, infoKey: "missing_net_debt" },
                          { label: "missing_shares", value: fv2Flags.missing_shares, infoKey: "missing_shares" },
                          { label: "invalid_discount_rate", value: fv2Flags.invalid_discount_rate, infoKey: "invalid_discount_rate" },
                          { label: "Fair value 3", infoKey: "fv3_disabled", value: "Ej aktiv i revenue mode" },
                        ], openInfoId, setOpenInfoId)}
                        {missingEvForFv2 && <p className="status empty">missing EV (market cap + debt - cash)</p>}
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
          id="Gross Profit Ratio"
          infoSections={BUFFETOLOGY_CHART_INFO_MAP["Gross Profit Ratio"]?.sections}
          openInfoId={openInfoId}
          onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
          onCloseInfo={() => setOpenInfoId(null)}
          data={grossProfitRatioData}
          options={{ ...sydingBaseOptions, vAxis: { format: "percent" } }}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="EBITDA Margin"
          id="EBITDA Margin"
          infoSections={BUFFETOLOGY_CHART_INFO_MAP["EBITDA Margin"]?.sections}
          openInfoId={openInfoId}
          onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
          onCloseInfo={() => setOpenInfoId(null)}
          data={ebitdaMarginData}
          options={{ ...sydingBaseOptions, vAxis: { format: "percent" } }}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="Net Income Margin"
          id="Net Income Margin"
          infoSections={BUFFETOLOGY_CHART_INFO_MAP["Net Income Margin"]?.sections}
          openInfoId={openInfoId}
          onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
          onCloseInfo={() => setOpenInfoId(null)}
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
          id="Free Cash Flow"
          infoSections={BUFFETOLOGY_CHART_INFO_MAP["Free Cash Flow"]?.sections}
          openInfoId={openInfoId}
          onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
          onCloseInfo={() => setOpenInfoId(null)}
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
          id="Total Equity"
          infoSections={BUFFETOLOGY_CHART_INFO_MAP["Total Equity"]?.sections}
          openInfoId={openInfoId}
          onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
          onCloseInfo={() => setOpenInfoId(null)}
          data={equityData}
          options={{ ...sydingBaseOptions, vAxis: { format: "short" } }}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ColumnChart"
          title="ROE"
          id="ROE"
          infoSections={BUFFETOLOGY_CHART_INFO_MAP["ROE"]?.sections}
          openInfoId={openInfoId}
          onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
          onCloseInfo={() => setOpenInfoId(null)}
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
          id="EBIT vs Interest"
          infoSections={BUFFETOLOGY_CHART_INFO_MAP["EBIT vs Interest"]?.sections}
          openInfoId={openInfoId}
          onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
          onCloseInfo={() => setOpenInfoId(null)}
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
          id="Cash vs Net Earnings"
          infoSections={BUFFETOLOGY_CHART_INFO_MAP["Cash vs Net Earnings"]?.sections}
          openInfoId={openInfoId}
          onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
          onCloseInfo={() => setOpenInfoId(null)}
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
          id="Debt to Equity"
          infoSections={BUFFETOLOGY_CHART_INFO_MAP["Debt to Equity"]?.sections}
          openInfoId={openInfoId}
          onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
          onCloseInfo={() => setOpenInfoId(null)}
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
          id="Retained Earnings vs Net Income"
          infoSections={BUFFETOLOGY_CHART_INFO_MAP["Retained Earnings vs Net Income"]?.sections}
          openInfoId={openInfoId}
          onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
          onCloseInfo={() => setOpenInfoId(null)}
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
          id="Capital Expenditure vs Net Earnings"
          infoSections={BUFFETOLOGY_CHART_INFO_MAP["Capital Expenditure vs Net Earnings"]?.sections}
          openInfoId={openInfoId}
          onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
          onCloseInfo={() => setOpenInfoId(null)}
          data={capexVsNetEarningsData}
          options={lineBehindBars}
        />
        <ChartCard
          fiscalYearEndMonth={fiscalYearEndMonth}
          chartType="ComboChart"
          title="Buybacks + Dividends vs Net Earnings"
          id="Buybacks + Dividends vs Net Earnings"
          infoSections={BUFFETOLOGY_CHART_INFO_MAP["Buybacks + Dividends vs Net Earnings"]?.sections}
          openInfoId={openInfoId}
          onToggleInfo={(id) => setOpenInfoId((prev) => (prev === id ? null : id))}
          onCloseInfo={() => setOpenInfoId(null)}
          data={buybacksDividendsData}
          options={lineBehindBars}
        />
      </div>
    </div>
  );
}
