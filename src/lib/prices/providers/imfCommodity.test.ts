import assert from 'node:assert/strict';
import { getImfCommodityPriceMapping, IMF_PRIMARY_COMMODITY_WORKBOOK_URL } from './imfCommodity.js';

const mapping = getImfCommodityPriceMapping('MO_USD_TONNE');
assert.ok(mapping);
assert.equal(mapping.datasetSeriesId, 'PLMMODY');
assert.equal(mapping.providerUnit, 'USD_PER_TONNE');
assert.match(IMF_PRIMARY_COMMODITY_WORKBOOK_URL, /external-data\.xlsx$/);
