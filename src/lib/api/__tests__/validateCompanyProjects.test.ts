import { getProjectJsonV1Template } from '../../project/jsonv1/template.ts';
import { validateCompanyProjectUpsert } from '../validateCompanyProjects.ts';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

(function runTests() {
  const template = getProjectJsonV1Template();

  const invalidSymbol = validateCompanyProjectUpsert({
    symbol: '###',
    project_id: 'p1',
    raw_json: template,
  });
  assert(!invalidSymbol.ok, 'invalid symbol should fail');

  const wrongVersion = validateCompanyProjectUpsert({
    symbol: 'ABRA.V',
    project_id: 'p1',
    raw_json: {
      ...template,
      version: 'project_json_v0',
    },
  });
  assert(!wrongVersion.ok, 'wrong raw_json version should fail');

  const valid = validateCompanyProjectUpsert({
    symbol: 'ABRA.V',
    project_id: 'p1',
    project_name: 'Diablillos',
    raw_json: template,
  });
  assert(valid.ok, 'template json should validate');

  console.log('validateCompanyProjects tests passed');
})();
