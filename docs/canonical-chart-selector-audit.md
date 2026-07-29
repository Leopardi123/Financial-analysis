# Canonical chart selector audit

This audit was completed before changing the selector implementation.

## Existing field wiring after the timeline migration

| Point | Project | Corporate |
| --- | --- | --- |
| today Low | ordinary row `periods[0].navPerShareTarget`, but the dashboard/debug still supplied and described `NPV_perShare` through `npvLow` | ordinary corporate row `navPerShare`; scalar prop was `NAV_perShare` |
| today High | ordinary row `periods[0].dcfPerShareTarget`; scalar prop was production-start present-value DCF | ordinary row `dcfExCapexPerShare`; scalar prop was production-start present-value DCF |
| start Low | `periods[productionStartPeriod].navPerShareTarget` | corporate row `navPerShare` at a project start year |
| start High | `periods[productionStartPeriod].dcfPerShareTarget` | corporate row `dcfExCapexPerShare` at a project start year |
| peak Low | absent | value from the High peak's row, not the Low series maximum |
| peak High | absent in Project | first maximum of High, except suppressed when it coincided with today or a project start |

The timeline builder already contains both required today values:
`today.navPerShareTarget` is canonical NAV today per PF share, and
`productionStart.dcfPresentValueTodayPerShareTarget` is canonical production-start
DCF discounted to today per PF share. No builder or economic assumption change is
needed.

## Root cause

The migration correctly exposed the required fields but used a generic rolling-period
mapping for the ordinary curve. At period zero that mapping selected
`dcfPerShareTarget`, whose remaining tail still contains the construction periods and
therefore coincides economically with the today NPV path in the observed AbraSilver
case. Separately, the dashboard continued to pass Project `NPV_perShare` as the legacy
`npvLow` prop. Corporate had an independent row adapter, while peak handling found
only the High maximum and attached both peak columns to that one row.

The correction is selector-only: today Low selects `today.navPerShareTarget`; today
High selects `productionStart.dcfPresentValueTodayPerShareTarget`; start points select
the start period's NAV and DCF; all other curve points retain their period NAV/DCF.
Low and High peaks are selected independently from their own economic series before
presentation rounding.
