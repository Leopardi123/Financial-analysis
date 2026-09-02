import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const testDirectory = resolve(repositoryRoot, 'src/lib/project/jsonv3/__tests__');

const entries = await readdir(testDirectory, { withFileTypes: true });
const testFiles = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith('.test.ts'))
  .map((entry) => entry.name)
  .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

if (testFiles.length === 0) {
  console.error('No project_json_v3 test files were discovered.');
  process.exit(1);
}

console.log(`Discovered ${testFiles.length} project_json_v3 test files:`);
for (const testFile of testFiles) {
  console.log(`- ${testFile}`);
}

for (const testFile of testFiles) {
  const absoluteTestPath = resolve(testDirectory, testFile);
  const displayPath = relative(repositoryRoot, absoluteTestPath).replaceAll('\\\\', '/');
  console.log(`\nRunning ${displayPath}`);

  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', absoluteTestPath],
    {
      cwd: repositoryRoot,
      stdio: 'inherit',
    },
  );

  if (result.error) {
    console.error(`Failed to start ${displayPath}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`${displayPath} failed with exit code ${result.status ?? 'unknown'}.`);
    process.exit(result.status ?? 1);
  }
}

console.log(`\nAll ${testFiles.length} project_json_v3 test files passed.`);
