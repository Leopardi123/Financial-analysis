import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Targeted compatibility transform for the grouped Project table in
 * SingleStockDashboard. The dashboard currently owns that renderer inside a
 * very large component while the canonical snapshot already exposes unit-safe
 * revenue. Keep the UI calculation anchored to the snapshot identity:
 * display price = canonical revenue / displayed payable quantity.
 *
 * The transform is deliberately fail-fast: if the source shape changes, the
 * build fails instead of silently restoring the old unit-mismatched path.
 */
function groupedProjectPriceRowsPatch(): Plugin {
  const target = "/src/components/SingleStockDashboard.tsx";
  return {
    name: "grouped-project-price-rows-patch",
    enforce: "pre",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith(target)) return null;

      const oldPriceSource = "        priceUSDByMetal: (projectSeriesRecord.priceUsedByMetal_USD as Record<string, Array<number | null>> | undefined) ?? {},";
      const newPriceSource = `        // priceUsedByMetal_USD may use a different source-key unit than the\n        // displayed payable quantity. Derive the display-unit price from the\n        // canonical snapshot revenue identity instead of multiplying mismatched units.\n        priceUSDByMetal: (() => {\n          const revenueByMetal = (projectSeriesRecord.revenueByMetal_USD as Record<string, Array<number | null>> | undefined) ?? {};\n          return Object.fromEntries(\n            Object.entries(revenueByMetal).map(([metal, revenueSeries]) => {\n              const payableSeries = payableSeriesByMetal[metal] ?? [];\n              return [metal, revenueSeries.map((revenue, t) => {\n                const quantity = payableSeries[t];\n                if (typeof revenue !== 'number' || !Number.isFinite(revenue) || typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity === 0) return null;\n                return revenue / quantity;\n              })];\n            }),\n          );\n        })(),`;

      const payableBlock = `      ...orderedMetals.map((metal) => {\n        const values = getSeries(payableSeriesByMetal[metal]);\n        const unit = payableUnits[metal];\n        const include = rowHasDisplayValue(values);\n        return {\n          label: \`Payable \${metal} (\${unit ?? '—'})\`,\n          values: include ? values : null,\n        };\n      }),`;
      const priceRows = `      ...orderedMetals.map((metal) => {\n        const unit = payableUnits[metal] ?? '—';\n        const label = \`Price \${metal} (USD/\${unit})\`;\n        const values = seriesByLabel.get(label) ?? null;\n        if (!rowHasDisplayValue(values)) return null;\n        return { label, values };\n      }),`;

      if (!code.includes(oldPriceSource)) {
        throw new Error("Grouped Project price patch: canonical price source anchor not found.");
      }
      if (!code.includes(payableBlock)) {
        throw new Error("Grouped Project price patch: payable-row anchor not found.");
      }

      return {
        code: code
          .replace(oldPriceSource, newPriceSource)
          .replace(payableBlock, `${payableBlock}\n${priceRows}`),
        map: null,
      };
    },
  };
}

export default defineConfig({
  plugins: [groupedProjectPriceRowsPatch(), react()],
});
