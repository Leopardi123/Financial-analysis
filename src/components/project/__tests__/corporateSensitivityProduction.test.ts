import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { stableCorporateRequestHash } from '../../../hooks/useCorporateMetalPriceSensitivity.ts';

const dashboard = await readFile('src/components/SingleStockDashboard.tsx', 'utf8');
const component = await readFile('src/components/project/CorporateMetalPriceSensitivity.tsx', 'utf8');
const chart = await readFile('src/components/project/ValueRangeSnapshotCard.tsx', 'utf8');
const css = await readFile('src/index.css', 'utf8');
const dashboardCss = await readFile('src/styles/dashboard.css', 'utf8');

test('production mount is Corporate-only and reuses the existing chart component', () => {
  const mount = dashboard.indexOf('<CorporateMetalPriceSensitivity');
  assert.ok(mount > dashboard.indexOf('Corporate (modeled)'));
  assert.ok(mount < dashboard.indexOf('primaryView === "projects"', mount));
  assert.match(dashboard.slice(mount, mount + 9000), /baseContent=\{<>[\s\S]*<ValueRangeSnapshotCard/);
  assert.match(dashboard.slice(mount, mount + 9000), /renderChart=.*[\s\S]*<ValueRangeSnapshotCard/);
  assert.equal((dashboard.match(/<CorporateMetalPriceSensitivity/g) ?? []).length, 1);
});

test('lazy loading, real buttons, reset, aria, focus mapping and two-page snap contracts exist', () => {
  assert.match(component, /onSensitivityOpen\?\.\(\)/);
  assert.match(component, /aria-pressed=\{pressed\}/);
  assert.match(component, /Återställ till Spot/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /props\.renderChart\(multiplier, metric\?\.focus/);
  assert.match(css, /scroll-snap-type: x mandatory/);
  assert.match(css, /overscroll-behavior-x: contain/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /\.corporate-finance-card[\s\S]*inline-size: 100%[\s\S]*overflow: hidden/);
  assert.match(css, /\.corporate-finance-pages[\s\S]*contain: inline-size/);
  assert.match(css, /\.corporate-finance-page[\s\S]*max-inline-size: 100%[\s\S]*overflow: hidden/);
  assert.match(css, /\.corporate-sensitivity-table \{[\s\S]*font-size: 11px[\s\S]*table-layout: fixed/);
  assert.match(css, /\.corporate-sensitivity-table button \{[\s\S]*min-height: 26px[\s\S]*padding: 1px 3px/);
  assert.match(dashboardCss, /\.breadcontainersinglecolumn[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(chart, /emphasisFocus === 'quality'/);
  assert.match(chart, /emphasisFocus === 'combined'/);
});

test('stable Corporate request hash ignores object key ordering and changes with economic inputs', () => {
  const a = { targetCurrency: 'CAD', discountRate: 0.1, scenario: { mode: 'spot' }, projects: [], fx: { source: 'auto', anchor: 'today', scenario: { mode: 'spot' } }, valuationYear: 2026 } as any;
  const reordered = { ...a, scenario: { mode: 'spot' }, discountRate: 0.1 };
  assert.equal(stableCorporateRequestHash(a), stableCorporateRequestHash(reordered));
  assert.notEqual(stableCorporateRequestHash(a), stableCorporateRequestHash({ ...a, discountRate: 0.11 }));
  assert.notEqual(stableCorporateRequestHash(a), stableCorporateRequestHash({ ...a, market: { shares_current: 2 } }));
});
