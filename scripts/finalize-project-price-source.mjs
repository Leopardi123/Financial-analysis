import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

if (process.env.GITHUB_ACTIONS === 'true') {
  const path = 'src/components/SingleStockDashboard.tsx';
  let text = readFileSync(path, 'utf8');

  const oldPrice = "        priceUSDByMetal: (projectSeriesRecord.priceUsedByMetal_USD as Record<string, Array<number | null>> | undefined) ?? {},";
  const newPrice = `        // priceUsedByMetal_USD may use a different source-key unit than the
        // displayed payable quantity. Derive the display-unit price from the
        // canonical snapshot revenue identity instead of multiplying mismatched units.
        priceUSDByMetal: (() => {
          const revenueByMetal = (projectSeriesRecord.revenueByMetal_USD as Record<string, Array<number | null>> | undefined) ?? {};
          return Object.fromEntries(
            Object.entries(revenueByMetal).map(([metal, revenueSeries]) => {
              const payableSeries = payableSeriesByMetal[metal] ?? [];
              return [metal, revenueSeries.map((revenue, t) => {
                const quantity = payableSeries[t];
                if (
                  typeof revenue !== 'number'
                  || !Number.isFinite(revenue)
                  || typeof quantity !== 'number'
                  || !Number.isFinite(quantity)
                  || quantity === 0
                ) return null;
                return revenue / quantity;
              })];
            }),
          );
        })(),`;

  if (!text.includes(oldPrice)) throw new Error('Project price finalizer: price source anchor not found');
  text = text.replace(oldPrice, newPrice);

  const payableBlock = `      ...orderedMetals.map((metal) => {
        const values = getSeries(payableSeriesByMetal[metal]);
        const unit = payableUnits[metal];
        const include = rowHasDisplayValue(values);
        return {
          label: \`Payable \${metal} (\${unit ?? '—'})\`,
          values: include ? values : null,
        };
      }),`;
  const priceRows = `      ...orderedMetals.map((metal) => {
        const unit = payableUnits[metal] ?? '—';
        const label = \`Price \${metal} (USD/\${unit})\`;
        const values = seriesByLabel.get(label) ?? null;
        if (!rowHasDisplayValue(values)) return null;
        return { label, values };
      }),`;

  if (!text.includes(payableBlock)) throw new Error('Project price finalizer: payable row anchor not found');
  text = text.replace(payableBlock, `${payableBlock}\n${priceRows}`);
  writeFileSync(path, text);

  writeFileSync('vite.config.ts', `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\n\nexport default defineConfig({\n  plugins: [react()],\n});\n`);

  execFileSync('git', ['add', path, 'vite.config.ts'], { stdio: 'inherit' });
}
