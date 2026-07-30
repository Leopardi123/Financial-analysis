import assert from 'node:assert/strict';
import fs from 'node:fs';

const dashboard = fs.readFileSync(new URL('../../SingleStockDashboard.tsx', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../../../styles/dashboard.css', import.meta.url), 'utf8');

assert.match(dashboard, /<NpvSpotRangeComparisonCard[\s\S]*?chartFlows\?\.yearsByPeriod/);
assert.match(dashboard, /<AlltGickFelCard[\s\S]*?chartFlows\?\.yearsByPeriod/);
assert.match(dashboard, /<h2 className="subrub small">ALLT GICK FEL<\/h2>/);
assert.match(dashboard, /project\.modeled\.npvSpotRange/);
assert.match(dashboard, /className="project-list2-pager" aria-label="Corporate modeled valuation pages"/);
assert.match(dashboard, /key="corporate-list2-pager"[\s\S]*?\{section\}[\s\S]*?<ModelAnalysis/);

const pagerRule = styles.match(/\.project-list2-pager\s*\{([^}]*)\}/)?.[1] ?? '';
assert.match(pagerRule, /grid-auto-flow:\s*column/);
assert.match(pagerRule, /grid-auto-columns:\s*minmax\(100%,\s*100%\)/);
assert.match(pagerRule, /overflow-x:\s*auto/);
assert.match(pagerRule, /scroll-snap-type:\s*x mandatory/);
assert.match(styles, /\.project-list2-page\s*\{[^}]*scroll-snap-align:\s*start/s);
assert.match(styles, /-webkit-overflow-scrolling:\s*touch/);

console.log('Project scenario card rendering contract tests passed');
