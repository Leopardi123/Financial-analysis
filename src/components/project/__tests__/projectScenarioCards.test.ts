import assert from 'node:assert/strict';
import fs from 'node:fs';

const dashboard = fs.readFileSync(new URL('../../SingleStockDashboard.tsx', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../../../styles/dashboard.css', import.meta.url), 'utf8');

assert.match(dashboard, /<NpvSpotRangeComparisonCard[\s\S]*?chartFlows\?\.yearsByPeriod/);
assert.match(dashboard, /<AlltGickFelCard[\s\S]*?chartFlows\?\.yearsByPeriod/);
assert.match(dashboard, /<h2 className="subrub small">ALLT GICK FEL<\/h2>/);
assert.match(dashboard, /project\.modeled\.npvSpotRange/);

const pagerRule = styles.match(/\.project-list2-pager\s*\{([^}]*)\}/)?.[1] ?? '';
assert.match(pagerRule, /grid-auto-flow:\s*row/);
assert.doesNotMatch(pagerRule, /overflow-x:\s*auto/);

console.log('Project scenario card rendering contract tests passed');
