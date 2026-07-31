# Multipelkontrast Fas A — numerisk fixture-audit

## Scope och källa

Rapporten kör den isolerade kvalitetsmotorn genom `runCorporateSnapshotPipeline`
utan någon UI-consumer. Single-project-caset är den incheckade
`scripts/fixtures/snapshot-requests/abra_minimal.json`. Multi-project-caset använder
de incheckade projekt-fixturerna `p5.los-ricos-north.project_json_v1.json` och
`p6.los-ricos-south.project_json_v1.json` i ett Corporate snapshot-request.

Fixturernas ekonomiska data ändrades inte. Precis som snapshot-testerna görs endast
den kontraktsmässiga v1→v2-märkningen och `productionStartYear` härleds från
fixturens befintliga `periodEndDatesUtc[productionStartPeriod]` innan körning.

Kolumnen `Adj.` visar i ordning: remaining years, front-loading, stability,
sustaining intensity och margin. Per-share-kolumnerna visar low/mid/high i
target currency.

## Single project — Abra Minimal

| År | EBITDA USD | Forward avg USD | Rem. aktiva | Front | Neg. tail | CV | Sust. | Margin | Adj. | Raw / low / mid / high | Annual/share L/M/H | Forward/share L/M/H | Status / diagnostics |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| 2028 | 169,500,000 | 169,500,000 | 8 | 0.625000 | 0 | 0 | 0.088496 | 0.478138 | 0 / +0.25 / +0.50 / +0.25 / +0.50 | 7.50 / 6.50 / 7.50 / 8.50 | 3.356799 / 3.874972 / 4.393144 | 3.356799 / 3.874972 / 4.393144 | COMPUTABLE / FULL_WINDOW |
| 2030 | 169,500,000 | 169,500,000 | 6 | 0.833333 | 0 | 0 | 0.088496 | 0.478138 | -0.50 / 0 / +0.50 / +0.25 / +0.50 | 6.75 / 5.75 / 6.75 / 7.75 | 2.968170 / 3.486342 / 4.004515 | 2.968170 / 3.486342 / 4.004515 | COMPUTABLE / FULL_WINDOW |
| 2033 | 169,500,000 | 169,500,000 | 3 | 1.000000 | 0 | 0 | 0.088496 | 0.478138 | -1.00 / -0.25 / +0.50 / +0.25 / +0.50 | 6.00 / 5.00 / 6.00 / 7.00 | 2.579540 / 3.097713 / 3.615885 | 2.579540 / 3.097713 / 3.615885 | COMPUTABLE / SHORT_WINDOW |
| 2034 | 169,500,000 | null | 2 | null | 0 | null | null | null | -1.50 / null / null / null / null | null | null | null | NOT_COMPUTABLE / INSUFFICIENT_REMAINING_PERIODS |

## Multi project — Los Ricos North + Los Ricos South

| År | EBITDA USD | Forward avg USD | Rem. aktiva | Front | Neg. tail | CV | Sust. | Margin | Adj. | Raw / low / mid / high | Annual/share L/M/H | Forward/share L/M/H | Status / diagnostics |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|---|---|
| 2029 | 15,586,350.5 | 19,583,390.6 | 7 | 0.943056 | 0.995344 | 0.922914 | 0.833359 | 0.158329 | -0.50 / -0.25 / -0.75 / -0.75 / -0.50 | 3.25 / 3.00 / 3.25 / 4.25 | 0.118391 / 0.129105 / 0.171964 | 0.151363 / 0.164826 / 0.218675 | COMPUTABLE / FULL_WINDOW |
| 2033 | 2,815,869 | -21,590.1 | 3 | 1.000000 | 11.840352 | null | 9.303095 | -0.000174 | -1.00 / -0.25 / null / -0.75 / -1.00 | null | null | null | null | NOT_COMPUTABLE / FULL_WINDOW, NON_POSITIVE_EBITDA_MEAN |
| 2041 | -15,291,700.5 | -14,221,252.333333 | null | null | null | null | null | -0.567790 | null / null / null / null / -1.00 | null | null | null | null | NOT_COMPUTABLE / SHORT_WINDOW, NO_ACTIVE_ECONOMIC_YEARS, NON_POSITIVE_EBITDA_MEAN, NON_POSITIVE_POSITIVE_EBITDA_DENOMINATOR |
| 2042 | -10,881,616 | null | null | null | null | null | null | null | null / null / null / null / null | null | null | null | null | NOT_COMPUTABLE / INSUFFICIENT_REMAINING_PERIODS, NO_ACTIVE_ECONOMIC_YEARS, NON_POSITIVE_POSITIVE_EBITDA_DENOMINATOR |

## Icke-regressionsverdict

Motorn kopplas in först efter att canonical valuation timeline och de befintliga
statiska 5x/6x/7x-raderna har beräknats. Den läser kopierade canonical serier och
publicerar endast `corporateQualityMultipleTimeSeries`. Tester fryser och jämför
befintliga economics-, aggregation-, financing-, DCF/NPV/NAV- och statiska
multipeloutputs före och efter ett separat motoranrop samt verifierar exakt
5x/6x/7x bridge-paritet. Ingen befintlig consumer läser det nya fältet.
