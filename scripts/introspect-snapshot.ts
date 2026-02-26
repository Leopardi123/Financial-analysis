import { readdir, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { introspectSnapshot, compareSnapshotKeys } from '../src/lib/snapshot/introspect.ts';
import { EXPECTED_SNAPSHOT_KEYS } from '../src/lib/snapshot/expectedKeys.ts';
import { runCorporateSnapshotPipeline } from '../src/lib/snapshot/runCorporateSnapshot.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, 'fixtures', 'snapshot-requests');
const outDir = path.join(__dirname, 'out', 'snapshot-shapes');

async function run(): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const fixtureFiles = (await readdir(fixturesDir))
    .filter((name) => name.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b));

  for (const fixtureFile of fixtureFiles) {
    const fixturePath = path.join(fixturesDir, fixtureFile);
    const fixtureName = fixtureFile.replace(/\.json$/i, '');
    const raw = await readFile(fixturePath, 'utf8');
    const requestBody = JSON.parse(raw);

    const result = await runCorporateSnapshotPipeline({ body: requestBody, refresh: false });
    if (!result.ok) {
      throw new Error(`Fixture ${fixtureFile} failed: ${result.diagnostics.errors.join('; ')}`);
    }

    const shape = introspectSnapshot(result.snapshot);
    const compare = compareSnapshotKeys(shape, EXPECTED_SNAPSHOT_KEYS);

    if (!shape.arrayKeys.includes('series.periodIndex')) {
      throw new Error(`Fixture ${fixtureFile} missing required array key series.periodIndex`);
    }

    const hasNumericSeriesArray = shape.arrayKeys.some((key) =>
      key.startsWith('series.') && shape.arrayValueTypes[key] === 'number|null',
    );

    if (!hasNumericSeriesArray) {
      throw new Error(`Fixture ${fixtureFile} missing numeric series arrays under snapshot.series`);
    }

    await writeFile(
      path.join(outDir, `${fixtureName}.shape.json`),
      `${JSON.stringify(shape, null, 2)}\n`,
      'utf8',
    );

    await writeFile(
      path.join(outDir, `${fixtureName}.compare.json`),
      `${JSON.stringify(compare, null, 2)}\n`,
      'utf8',
    );

    console.log(
      `[${fixtureName}] scalar=${shape.scalarKeys.length} array=${shape.arrayKeys.length} object=${shape.objectKeys.length}`,
    );
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
