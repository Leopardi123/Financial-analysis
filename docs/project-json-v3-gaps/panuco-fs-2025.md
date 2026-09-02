# Panuco FS 2025 — project_json_v3 pilot gap

**Status: EJ VERIFIERAD — ENGINE_GAP**

Source: `Vizsla_Silver_Panuco_NI43-101_FS_2025-12-02.pdf`  
Effective date: 4 November 2025  
Report date: 2 December 2025

This pilot intentionally creates no fixture and no test. Existing code is unchanged.

## Verified report evidence

- Table 19-1, p. 403: silver US$35.50/oz; gold US$3,100/oz.
- Section 22 / Tables 22-1 and 22-2, pp. 454–461: 14 report periods (`-2, -1, 1 ... 12`), 5% discount rate and mid-period discounting.
- Table 22-1, pp. 457–459:
  - Pre-tax NPV5 US$2.842bn; IRR 159.3%.
  - Post-tax NPV5 US$1.802bn; IRR 111.1%.
  - Initial capital US$239m; preproduction revenue US$128m; preproduction costs US$62m; net “Initial Costs” US$173m.
  - Expansion US$15m; sustaining US$287m; closure US$38m; salvage US$10m.
- Table 22-2, pp. 459–461 publishes annual pre- and post-tax cash flow and tax series.

## Blocking mapping issue

The report produces and sells metal before commercial production. It records that revenue and the associated costs inside the net “Initial Costs” line:

```text
Initial capital + preproduction costs - preproduction revenue = Initial Costs
```

The current V3 schema has no explicit preproduction/capitalized-revenue classification. Normal payable-metal revenue would put the same sales into operating revenue instead.

The total cash flow could be forced to match by combining unlike items into aggregate operating costs or by inserting a balancing series. That would lose the report’s classification, hide royalties/off-site costs, and invent an unsupported runtime mapping. This is prohibited.

The report also gives only an aggregate preproduction-cost row by year. It does not provide enough annual detail to split those amounts among mining, processing, G&A, off-site costs and royalties without guessing. Private royalties apply at different rates (2% and 3.5% NSR), so one runtime proxy rate cannot be inferred safely.

## Required before a fixture can be created

One of the following needs to be supported and tested by the engine:

1. explicit preproduction revenue and preproduction cost series that are capitalized without double counting; or
2. a source-faithful net development-cost ledger that permits the report’s negative revenue offset and preserves component provenance.

The engine must then demonstrate:

- exact period mapping;
- period-by-period pre- and post-tax FCFF against Table 22-2;
- report-deck NPV/IRR within 2%;
- no balancing entries and no guessed royalty allocation.

Until then, this project remains **EJ VERIFIERAD** and must not be registered as a runnable fixture.
