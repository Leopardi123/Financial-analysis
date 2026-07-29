# Pre-production High series audit

This audit was recorded before changing the selector.

`selectValuationChart` currently maps High as follows:

* today: selected start state's `dcfPresentValueTodayPerShareTarget`;
* every other period, including construction periods before start:
  `period.dcfPerShareTarget`;
* start and post-start: `period.dcfPerShareTarget`.

The first and last mappings are correct. The middle mapping is not the same economic
series: before production, `period.dcfPerShareTarget` is the value of that period's
remaining FCFF tail and still includes unpassed construction CAPEX. It therefore
cannot be used as an interpolation between a production-start DCF present value and
the nominal production-start DCF.

For the repository Abra fixture the raw Corporate High values before correction are:

| year | selected High | old source |
| --- | ---: | --- |
| 2026 | 1.444762286312244 | start DCF present value |
| 2027 | 1.222390688856512 | `periods[1].dcfPerShareTarget` |
| 2028 | 1.7481623664378156 | start `dcfPerShareTarget` |

The 2027 construction-tail DCF causes the observed dip. The canonical timeline
already stores the selected start DCF and each period's discount factor, so the
builder and economic assumptions do not need to change. The chart selector must use
one start-DCF roll-up curve before start, then switch to each period's remaining DCF
at and after start.
