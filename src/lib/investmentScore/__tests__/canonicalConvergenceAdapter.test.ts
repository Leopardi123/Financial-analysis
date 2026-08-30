import assert from 'node:assert/strict';
import { assessValuationConvergence } from '../valuationConvergence.ts';

const extreme = assessValuationConvergence({ pNav: 0.15, peak6xVsPrice: 4.0 });
assert.equal(extreme.classification, 'EXTREME');

const score2Boundary = assessValuationConvergence({ pNav: 0.25, peak6xVsPrice: 3.0 });
assert.equal(score2Boundary.classification, 'VERY_STRONG');

const score3Boundary = assessValuationConvergence({ pNav: 0.40, peak6xVsPrice: 2.0 });
assert.equal(score3Boundary.classification, 'STRONG');
