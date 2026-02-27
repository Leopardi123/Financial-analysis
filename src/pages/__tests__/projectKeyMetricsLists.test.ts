import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProjectKeyMetricsSections } from '../projectKeyMetricsLists.ts';

test('CF_LOM label does not contain nu while NPV label includes discount-rate nu', () => {
  const model = buildProjectKeyMetricsSections({
    snapshot: {
      NPV_today_TargetCurrency: 100,
      CF_LOM_TargetCurrency: 200,
    },
    discountRate: 0.1,
  });

  const lista1 = model.sections.find((section) => section.id === 'lista1');
  assert.ok(lista1);
  const npv = lista1!.rows.find((row) => row.key === 'NPV_today_TargetCurrency');
  const cflom = lista1!.rows.find((row) => row.key === 'CF_LOM_TargetCurrency');

  assert.equal(npv?.label, 'NPV (r=10 %) nu');
  assert.equal(cflom?.label.includes('nu'), false);
  assert.equal(cflom?.label, 'CF LOM (odiskonterad)');
});

test('sections render all five lists in required order for multi-column layout', () => {
  const model = buildProjectKeyMetricsSections({ snapshot: null, discountRate: 0.1 });
  assert.deepEqual(model.sections.map((section) => section.id), ['lista1', 'lista2', 'lista3', 'lista4', 'lista5']);
});
