# Investment Score / Tier calibration — 2026-09-06

Decision record for the calibration implemented in this branch.

## Tier scale

- Physical production, unit conversions, per-product equivalents and sustained-window selection stay full precision.
- The selected final combined scale is rounded to one decimal before Tier classification.
- Existing boundaries remain Tier 1 >= 1.0x, Tier 2 >= 0.4x, Tier 3 < 0.4x.

## Score 3 downside robustness

- No longer aliases the Tier-1 cycle pass.
- Uses the already-computed canonical seven-year survival NPV10 from the Tier cycle runtime.
- PASS: survival NPV10 > 0.
- FAIL: survival NPV10 <= 0.
- Missing value: Ej verifierad.

## Exceptional Tier-3 -> Score-3 path

Allowed only when Tier 3 is caused by scale and/or LOM. Capital returns and cycle must each be no worse than Tier 2. The path additionally requires EXTREME valuation convergence, management >= Strong, optionality >= Strong, positive seven-year survival NPV10 and no fatal flaw.

This is a central policy. There are no project-specific exceptions.
