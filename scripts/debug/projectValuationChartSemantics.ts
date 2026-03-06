import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runCorporateSnapshotPipeline } from '../../src/lib/snapshot/runCorporateSnapshot.ts';

type Row = {
  year: number;
  idx: number;
  dcf_value: number | null;
  nav_value: number | null;
  dcf_source: string;
  nav_source: string;
  dcf_discount_basis: string;
  nav_discount_basis: string;
};

function fmt(v: number | null): string {
  return v === null || !Number.isFinite(v) ? 'null' : v.toFixed(4);
}

function interp(a: number | null, b: number | null, t: number): number | null {
  if (a === null || b === null) return null;
  return a + (b - a) * t;
}

async function loadFixture(): Promise<Record<string, unknown>> {
  const fixturePath = path.resolve('scripts/fixtures/snapshot-requests/abra_minimal.json');
  const fixtureRaw = await readFile(fixturePath, 'utf8');
  const parsed = JSON.parse(fixtureRaw) as Record<string, unknown>;
  const currentYear = new Date().getUTCFullYear();
  const projects = Array.isArray(parsed.projects) ? parsed.projects as Array<Record<string, unknown>> : [];
  for (const project of projects) {
    const rawJson = (project.rawJson ?? null) as Record<string, unknown> | null;
    if (!rawJson || typeof rawJson !== 'object') continue;
    rawJson.version = 'project_json_v2';
    const time = (rawJson.time ?? null) as Record<string, unknown> | null;
    if (!time || typeof time !== 'object') continue;
    const tp = Number.isInteger(time.productionStartPeriod) ? (time.productionStartPeriod as number) : 0;
    time.productionStartYear = currentYear + tp;
  }
  return parsed;
}

async function main() {
  const body = await loadFixture();
  const result = await runCorporateSnapshotPipeline({ body, refresh: false, debug: true });
  if (!result.ok) {
    console.error('pipeline failed');
    process.exit(1);
  }

  const snapshot = result.snapshot;
  const seriesYears = snapshot.series?.yearsByPeriod ?? [];
  const currentYear = seriesYears[0] ?? null;

  const projects = Array.isArray((body as { projects?: unknown[] }).projects) ? ((body as { projects?: unknown[] }).projects as unknown[]) : [];
  const firstProject = (projects[0] ?? null) as { rawJson?: { time?: { productionStartYear?: unknown } } } | null;
  const tpYear = typeof firstProject?.rawJson?.time?.productionStartYear === 'number' ? firstProject.rawJson.time.productionStartYear : null;

  const tpOffset = (typeof currentYear === 'number' && typeof tpYear === 'number') ? Math.max(1, tpYear - currentYear) : 1;

  const sharesPf = typeof snapshot.financing?.shares_post_financing === 'number' && Number.isFinite(snapshot.financing.shares_post_financing)
    ? snapshot.financing.shares_post_financing
    : null;
  const npvTodayPerShare = typeof snapshot.NPV_today_TargetCurrency === 'number' && sharesPf && sharesPf > 0
    ? snapshot.NPV_today_TargetCurrency / sharesPf
    : null;
  const dcfTodayDiscountedPerShare = typeof snapshot.DCF_prodStart_present_perShare_TargetCurrency === 'number'
    ? snapshot.DCF_prodStart_present_perShare_TargetCurrency
    : null;
  const navTpPerShare = typeof snapshot.NAV_prodStart_perShare_TargetCurrency === 'number'
    ? snapshot.NAV_prodStart_perShare_TargetCurrency
    : null;
  const dcfTpPerShare = typeof snapshot.DCF_prodStart_exCapex_perShare_TargetCurrency === 'number'
    ? snapshot.DCF_prodStart_exCapex_perShare_TargetCurrency
    : null;

  const chartFlows = (snapshot as { project?: { chartFlows?: { dcfProdstartPresentPerShareSeries?: Array<number | null>; navProdstartPerShareSeries?: Array<number | null> } } }).project?.chartFlows;
  const dcfFlow = Array.isArray(chartFlows?.dcfProdstartPresentPerShareSeries) ? chartFlows.dcfProdstartPresentPerShareSeries : [];
  const navFlow = Array.isArray(chartFlows?.navProdstartPerShareSeries) ? chartFlows.navProdstartPerShareSeries : [];

  const pick = [0, Math.max(0, tpOffset - 1), tpOffset, tpOffset + 1, tpOffset + 2];

  const rows: Row[] = pick.map((idx) => {
    const year = (typeof currentYear === 'number' ? currentYear : new Date().getUTCFullYear()) + idx;

    let dcf_value: number | null;
    let nav_value: number | null;
    let dcf_source: string;
    let nav_source: string;
    let dcf_discount_basis: string;
    let nav_discount_basis: string;

    if (idx === 0) {
      dcf_value = dcfTodayDiscountedPerShare;
      nav_value = npvTodayPerShare;
      dcf_source = 'projectViewMetrics.list2.DCF_Target_discounted_perShare';
      nav_source = 'projectViewMetrics.list2.NPV_perShare';
      dcf_discount_basis = 'discounted to TODAY';
      nav_discount_basis = 'discounted to TODAY (NPV)';
    } else if (idx < tpOffset) {
      const t = idx / tpOffset;
      dcf_value = interp(dcfTodayDiscountedPerShare, dcfTpPerShare, t);
      nav_value = interp(npvTodayPerShare, navTpPerShare, t);
      dcf_source = 'Synthetic interpolation in ValueRangeSnapshotCard (today->tp)';
      nav_source = 'Synthetic interpolation in ValueRangeSnapshotCard (today->tp)';
      dcf_discount_basis = 'none (visual interpolation between TODAY and TP-basis endpoint)';
      nav_discount_basis = 'none (visual interpolation between TODAY and TP-basis endpoint)';
    } else if (idx === tpOffset) {
      dcf_value = dcfTpPerShare;
      nav_value = navTpPerShare;
      dcf_source = 'projectViewMetrics.list2.DCF_perShare';
      nav_source = 'projectViewMetrics.list2.NAV_prodStart_perShare';
      dcf_discount_basis = 'discounted to TP';
      nav_discount_basis = 'TP-basis (NPV@TP + netCash_t0)';
    } else {
      const flowIndex = idx - tpOffset;
      dcf_value = typeof dcfFlow[flowIndex] === 'number' ? dcfFlow[flowIndex] as number : null;
      nav_value = typeof navFlow[flowIndex] === 'number' ? navFlow[flowIndex] as number : null;
      dcf_source = `snapshot.project.chartFlows.dcfProdstartPresentPerShareSeries[${flowIndex}]`;
      nav_source = `snapshot.project.chartFlows.navProdstartPerShareSeries[${flowIndex}]`;
      dcf_discount_basis = 'discounted to TODAY (rolling hypothetical tp_k)';
      nav_discount_basis = 'TP_k-basis NAV (NPV@tp_k + netCash_t0)';
    }

    return { year, idx, dcf_value, nav_value, dcf_source, nav_source, dcf_discount_basis, nav_discount_basis };
  });

  console.log('PROJECT VALUATION CHART SEMANTICS DEBUG');
  console.log(`currentYear=${currentYear} tpYear=${tpYear} tpOffset=${tpOffset}`);
  console.log(`shares_post_financing=${sharesPf}`);
  console.log('');
  console.log('year | idx | dcf_value | nav_value | dcf_source | nav_source | dcf_discount_basis | nav_discount_basis');
  for (const r of rows) {
    console.log(`${r.year} | ${r.idx} | ${fmt(r.dcf_value)} | ${fmt(r.nav_value)} | ${r.dcf_source} | ${r.nav_source} | ${r.dcf_discount_basis} | ${r.nav_discount_basis}`);
  }

  const conclusion = (() => {
    const hasInterpolation = rows.some((r) => r.dcf_source.includes('Synthetic interpolation'));
    const dcfMixed = rows.some((r) => r.dcf_discount_basis.includes('TP')) && rows.some((r) => r.dcf_discount_basis.includes('TODAY'));
    const navMixed = rows.some((r) => r.nav_discount_basis.includes('TODAY')) && rows.some((r) => r.nav_discount_basis.includes('TP'));
    return {
      hasInterpolation,
      dcfMixed,
      navMixed,
      classification: hasInterpolation
        ? 'C) endpoint values patched together (plus rolling chartFlows after TP)'
        : (dcfMixed || navMixed ? 'B) definition switch at TP' : 'A) same definition across all points'),
    };
  })();

  console.log('');
  console.log('classification=', JSON.stringify(conclusion));
}

void main();
