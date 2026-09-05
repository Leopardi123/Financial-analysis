import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cycleSource = readFileSync(new URL('../cyclePolicyRuntime.ts', import.meta.url), 'utf8');
const routeSource = readFileSync(new URL('../../../server/routes/tier1/pre-revenue.ts', import.meta.url), 'utf8');

assert.equal(cycleSource.includes('refreshHistoryRangeToMonthlyBlobs'), false, 'Tier cycle read-path must never run provider history refresh');
assert.equal(cycleSource.includes('resolveProjectPricesToEngineInput'), false, 'Tier cycle must reuse the already-resolved base case');
assert.equal(cycleSource.includes('loadProjectsForSymbol'), false, 'Tier cycle must not reload project_json independently');
assert.equal(cycleSource.includes('computeTier1CyclePolicyFromPreparedProjects'), true);

assert.equal(routeSource.includes('computeTier1CyclePolicyForSymbol'), false, 'Tier route must not invoke the legacy duplicate cycle resolver');
assert.equal(routeSource.includes('computeTier1CyclePolicyFromPreparedProjects'), true);
assert.equal(routeSource.includes('allowRefresh: true'), false, 'Tier read-path must not trigger provider refresh');
assert.equal(routeSource.includes('allowRefresh: false'), true);
assert.match(routeSource, /preparedProjects\.map\(\(project\) => project\.cycleProject\)/);

console.log('cycleRuntimeReadPathContract tests passed');
