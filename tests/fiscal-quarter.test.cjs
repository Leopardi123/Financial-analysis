const test = require('node:test');
const assert = require('node:assert/strict');

function computeFiscalQuarterLabel(isoDate, fiscalYearEndMonth) {
  const [yearStr, monthStr] = isoDate.split('-');
  const endYear = Number(yearStr);
  const endMonth = Number(monthStr);
  const fyStartMonth = (fiscalYearEndMonth % 12) + 1;
  const idx = (endMonth - fyStartMonth + 12) % 12;
  const fiscalQuarter = Math.floor(idx / 3) + 1;
  const fiscalYearLabel = endYear + (endMonth > fiscalYearEndMonth ? 1 : 0);
  return `FY${fiscalYearLabel} Q${fiscalQuarter}`;
}

test('AAPL-style fiscal year ending in September', () => {
  assert.equal(computeFiscalQuarterLabel('2024-12-28', 9), 'FY2025 Q1');
  assert.equal(computeFiscalQuarterLabel('2024-06-29', 9), 'FY2024 Q3');
});

test('non-December fiscal year ending in March', () => {
  assert.equal(computeFiscalQuarterLabel('2024-06-30', 3), 'FY2025 Q1');
  assert.equal(computeFiscalQuarterLabel('2025-03-31', 3), 'FY2025 Q4');
});
