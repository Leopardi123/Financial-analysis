import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildSubsectorCoverageAuditReport } from "../../src/lib/macro/subsectorCoverageAudit.ts";

const outDir = resolve(process.cwd(), "scripts/out");
mkdirSync(outDir, { recursive: true });

const report = buildSubsectorCoverageAuditReport();
const outPath = resolve(outDir, "subsectorCoverageAudit.json");
writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log(`Wrote subsector coverage audit to ${outPath}`);
