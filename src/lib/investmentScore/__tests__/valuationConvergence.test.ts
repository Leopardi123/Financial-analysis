import assert from 'node:assert/strict';
import { assessValuationConvergence, valuationConvergencePasses } from '../valuationConvergence.ts';

assert.equal(assessValuationConvergence({ pNav: 0.13, peak6xVsPrice: 5.2 }).classification, 'EXTREME');
assert.equal(assessValuationConvergence({ pNav: 0.22, peak6xVsPrice: 3.4 }).classification, 'VERY_STRONG');
assert.equal(assessValuationConvergence({ pNav: 0.37, peak6xVsPrice: 2.3 }).classification, 'STRONG');
assert.equal(assessValuationConvergence({ pNav: 0.13, peak6xVsPrice: 1.4 }).classification, 'CONTRADICTORY');
assert.equal(assessValuationConvergence({ pNav: 0.31, peak6xVsPrice: 1.7 }).classification, 'MIXED');
assert.equal(assessValuationConvergence({ pNav: null, peak6xVsPrice: 5 }).classification, 'NOT_VERIFIED');

assert.equal(valuationConvergencePasses('EXTREME', 'EXTREME'), true);
assert.equal(valuationConvergencePasses('VERY_STRONG', 'EXTREME'), false);
assert.equal(valuationConvergencePasses('EXTREME', 'VERY_STRONG'), true);
assert.equal(valuationConvergencePasses('STRONG', 'STRONG'), true);
assert.equal(valuationConvergencePasses('CONTRADICTORY', 'STRONG'), false);
assert.equal(valuationConvergencePasses('NOT_VERIFIED', 'STRONG'), null);
