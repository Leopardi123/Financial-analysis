from pathlib import Path

resolver_path = Path('src/lib/corporate/snapshotInputResolver.ts')
resolver = resolver_path.read_text()
old = "  const request: SnapshotRequest = {\n"
new = "  const request = {\n"
if old not in resolver:
    raise SystemExit('snapshotInputResolver request typing anchor missing')
resolver = resolver.replace(old, new, 1)
old = "    manualMetalPrices: args.manualMetalPrices,\n  };\n\n  return {\n"
new = "    manualMetalPrices: args.manualMetalPrices,\n  } as unknown as SnapshotRequest;\n\n  return {\n"
if old not in resolver:
    raise SystemExit('snapshotInputResolver request cast anchor missing')
resolver = resolver.replace(old, new, 1)
resolver_path.write_text(resolver)

compare_path = Path('src/components/CompareStocksDashboard.tsx')
compare = compare_path.read_text()
old = "const readFinite = (value: unknown): number | null => finite(value) ? value : null;\n"
if old not in compare:
    raise SystemExit('Compare readFinite cleanup anchor missing')
compare = compare.replace(old, '', 1)
compare_path.write_text(compare)
