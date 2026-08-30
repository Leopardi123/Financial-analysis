from pathlib import Path

path = Path('src/lib/snapshot/runCorporateSnapshot.ts')
text = path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    text = text.replace(old, new, 1)

replace_once(
"""  workingCapitalDeltaUSD: Array<number | null>;
  sustainingCapexUSD: Array<number | null>;
  reclamationUSD: Array<number | null>;
  byproductCreditsUSD: Array<number | null>;
""",
"""  workingCapitalDeltaUSD: Array<number | null>;
  terminalProceedsUSD: Array<number | null>;
  sustainingCapexUSD: Array<number | null>;
  reclamationUSD: Array<number | null>;
  byproductCreditsUSD: Array<number | null>;
""",
'identity input terminal proceeds',
)

replace_once(
"""    const fcffActual = toFiniteOrNull(input.fcffUSD[t]);
    const capex = toFiniteOrNull(input.capexUSD[t]);
    const wc = toFiniteOrNull(input.workingCapitalDeltaUSD[t]);
    const tax = toFiniteOrNull(input.taxUSD[t]);
    if (
      ebitActual !== null
      && tax !== null
      && dep !== null
      && capex !== null
      && wc !== null
      && fcffActual !== null
    ) {
      const expected = ebitActual - tax + dep - capex - wc;
""",
"""    const fcffActual = toFiniteOrNull(input.fcffUSD[t]);
    const capex = toFiniteOrNull(input.capexUSD[t]);
    const wc = toFiniteOrNull(input.workingCapitalDeltaUSD[t]);
    const terminalProceeds = toFiniteOrNull(input.terminalProceedsUSD[t]);
    const tax = toFiniteOrNull(input.taxUSD[t]);
    if (
      ebitActual !== null
      && tax !== null
      && dep !== null
      && capex !== null
      && wc !== null
      && terminalProceeds !== null
      && fcffActual !== null
    ) {
      const expected = ebitActual - tax + dep - capex - wc + terminalProceeds;
""",
'identity formula terminal proceeds',
)

replace_once(
"""          const taxableIncomeUSD = ebitUSD.map((ebit) => (ebit === null ? null : Math.max(0, ebit)));
          const taxByRule = taxableIncomeUSD.map((taxable) => (taxRate === null || taxable === null ? null : taxable * taxRate));
          const effectiveTaxRate = ebitUSD.map((ebit, t) => (ebit !== null && ebit > 0 && taxByRule[t] !== null ? (taxByRule[t] as number) / ebit : null));
          const fcffByCentralEbit = ebitUSD.map((ebit, t) => {
            if (ebit === null) return null;
            const tax = taxByRule[t] ?? 0;
            const dep = depreciationUSD[t] ?? 0;
            const cx = capexUSD_used[t] ?? 0;
            const dWC = workingCapitalDeltaUSD_effective[t] ?? 0;
            // Reclamation is already included in EBITDA/EBIT and must not be deducted twice in FCFF.
            return ebit - tax + dep - cx - dWC;
          });
          const usesTaxRateRule = taxRate !== null;
""",
"""          const taxableIncomeUSD = ebitUSD.map((ebit) => (ebit === null ? null : Math.max(0, ebit)));
          const hasExplicitTaxCashFlow = Array.isArray(resolved.phase1.taxCashFlowUSD);
          const hasTerminalProceeds = Array.isArray(resolved.phase1.terminalProceedsUSD);
          // Preserve the legacy snapshot rule exactly when explicit tax is absent.
          // Opt-in explicit tax consumes canonical Phase1 taxUSD so construction
          // credits and operating tax payments retain their disclosed cash signs.
          const taxByRule = hasExplicitTaxCashFlow
            ? sanitizeSeries(out.phase1.taxUSD)
            : taxableIncomeUSD.map((taxable) => (taxRate === null || taxable === null ? null : taxable * taxRate));
          const effectiveTaxRate = hasExplicitTaxCashFlow
            ? sanitizeSeries(out.phase1.effectiveTaxRate)
            : ebitUSD.map((ebit, t) => (ebit !== null && ebit > 0 && taxByRule[t] !== null ? (taxByRule[t] as number) / ebit : null));
          const terminalProceedsUSD_effective = hasTerminalProceeds
            ? sanitizeSeries(out.phase1.terminalProceedsUSD_effective)
            : new Array<number | null>(projectLength).fill(0);
          const fcffByCentralEbit = ebitUSD.map((ebit, t) => {
            if (ebit === null) return null;
            if (hasExplicitTaxCashFlow && taxByRule[t] === null) return null;
            if (hasTerminalProceeds && terminalProceedsUSD_effective[t] === null) return null;
            const tax = taxByRule[t] ?? 0;
            const dep = depreciationUSD[t] ?? 0;
            const cx = capexUSD_used[t] ?? 0;
            const dWC = workingCapitalDeltaUSD_effective[t] ?? 0;
            const terminal = terminalProceedsUSD_effective[t] ?? 0;
            // Reclamation is already included in EBITDA/EBIT and must not be deducted twice in FCFF.
            // Terminal proceeds are non-operating cash and enter only at FCFF level.
            return ebit - tax + dep - cx - dWC + terminal;
          });
          const usesTaxRateRule = !hasExplicitTaxCashFlow && taxRate !== null;
""",
'canonical explicit tax and terminal FCFF',
)

replace_once(
"""          diagnostics.warnings.push(`[${projectId}] fcff source path=ebit - tax + depreciation - capex - workingCapitalDelta (sustaining CAPEX and reclamation already included in operating earnings)`);
          diagnostics.warnings.push(`[${projectId}] ebitPath_projectTable=series.ebitUSD (central revenue-cost builder)`);
          diagnostics.warnings.push(`[${projectId}] ebitPath_corporateNopat=projectSeriesContexts.economics.ebitUSD (central revenue-cost builder)`);
          diagnostics.warnings.push(`[${projectId}] sameEbitSource=true`);
          diagnostics.warnings.push(`[${projectId}] tax source of truth=phase1.taxUSD (derived from economics.taxRate + taxableIncomeUSD)`);
          diagnostics.warnings.push(`[${projectId}] tax rule=taxUSD[t]=max(0, EBIT[t])*taxRate`);
          diagnostics.warnings.push(`[${projectId}] tax rate source=${usesTaxRateRule ? 'economics.taxRate' : 'missing economics.taxRate (tax series unresolved)'}`);
""",
"""          diagnostics.warnings.push(`[${projectId}] fcff source path=ebit - tax + depreciation - capex - workingCapitalDelta + terminalProceeds (sustaining CAPEX and reclamation already included in operating earnings)`);
          diagnostics.warnings.push(`[${projectId}] ebitPath_projectTable=series.ebitUSD (central revenue-cost builder)`);
          diagnostics.warnings.push(`[${projectId}] ebitPath_corporateNopat=projectSeriesContexts.economics.ebitUSD (central revenue-cost builder)`);
          diagnostics.warnings.push(`[${projectId}] sameEbitSource=true`);
          diagnostics.warnings.push(`[${projectId}] tax source of truth=${hasExplicitTaxCashFlow ? 'phase1.taxUSD from explicit taxCashFlowUSD' : 'snapshot taxRate rule'}`);
          diagnostics.warnings.push(`[${projectId}] tax rule=${hasExplicitTaxCashFlow ? 'taxUSD[t]=-taxCashFlowUSD[t]' : 'taxUSD[t]=max(0, EBIT[t])*taxRate'}`);
          diagnostics.warnings.push(`[${projectId}] tax rate source=${hasExplicitTaxCashFlow ? 'explicit tax cash-flow series' : usesTaxRateRule ? 'economics.taxRate' : 'missing economics.taxRate (legacy zero-tax FCFF behavior preserved)'}`);
          diagnostics.warnings.push(`[${projectId}] terminal proceeds source=${hasTerminalProceeds ? 'phase1.terminalProceedsUSD_effective' : 'absent (0)'}`);
""",
'diagnostics tax and terminal source',
)

replace_once(
"""              `[${projectId}] central-ebit-trace t=${t} revenue=${String(centralRevenueUSD[t])} operatingCosts=${String(operatingCostsUSD[t])} siteGandA=${String(siteGandA_USD[t])} royalties=${String(royaltiesUSD[t])} depreciationRaw=${String(parsed.context.series?.depreciationUSD?.[t] ?? null)} depreciationNormalized=${String(depreciationUSD[t] ?? 0)} ebit=${String(ebitUSD[t])} tax=${String(taxByRule[t])} fcff=${String(fcffByCentralEbit[t])}`,
""",
"""              `[${projectId}] central-ebit-trace t=${t} revenue=${String(centralRevenueUSD[t])} operatingCosts=${String(operatingCostsUSD[t])} siteGandA=${String(siteGandA_USD[t])} royalties=${String(royaltiesUSD[t])} depreciationRaw=${String(parsed.context.series?.depreciationUSD?.[t] ?? null)} depreciationNormalized=${String(depreciationUSD[t] ?? 0)} ebit=${String(ebitUSD[t])} tax=${String(taxByRule[t])} terminalProceeds=${String(terminalProceedsUSD_effective[t])} fcff=${String(fcffByCentralEbit[t])}`,
""",
'trace terminal proceeds',
)

replace_once(
"""            workingCapitalDeltaUSD: workingCapitalDeltaUSD_effective,
            sustainingCapexUSD,
""",
"""            workingCapitalDeltaUSD: workingCapitalDeltaUSD_effective,
            terminalProceedsUSD: terminalProceedsUSD_effective,
            sustainingCapexUSD,
""",
'identity call terminal proceeds',
)

path.write_text(text)
print('patched runCorporateSnapshot.ts')
