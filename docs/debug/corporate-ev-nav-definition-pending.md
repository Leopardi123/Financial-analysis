# Corporate EV/NAV — DEBUG / pending definition

Status: **quarantined; do not use for investment decisions until redesigned.**

## Problem

The existing Corporate EV/NAV mixes valuation layers:

- equity leg: current market cap = current share price × current shares;
- balance-sheet leg: post-financing debt and post-financing cash;
- denominator: Corporate NAV, which is an equity NAV because net cash/debt is already included.

This creates a hybrid current/PF numerator and then compares enterprise value with an equity-value denominator.

## Why it is quarantined

A naive replacement with `current price × shares PF + PF debt − PF cash` is also unsafe. Project FCFF/NPV already includes construction CAPEX, while the financing waterfall raises debt/equity to fund that same construction need. A PF EV formula can therefore double-count the economic burden unless the valuation date and enterprise-NAV denominator are explicitly reconciled.

Manual extra shares are additionally an explicit dilution adjustment without assumed financing proceeds. They must not automatically create cash or enterprise value.

## Current decision

1. Corporate **P/NAV** is replaced in the canonical Corporate presentation by **P/NAV PF**:

   `current share price / canonical NAV per share PF`

   The canonical PF share denominator includes modeled financing shares and the existing manual-extra-share adjustment applied by the Corporate valuation timeline.

2. Existing Corporate **EV/NAV** is shown as DEBUG/unavailable in the canonical Corporate presentation pending redesign.

3. Do not change project FCFF, NPV, NAV, financing waterfall, debt/equity mix, cash usage or valuation timeline to solve EV/NAV.

## Candidate future definition to audit

A future EV/NAV should compare like with like, most likely either:

- **Current EV / enterprise asset value**, using current cash/debt only; or
- another explicitly dated enterprise-value pair where both numerator and denominator are reconstructed at the same point in time.

The final definition must prove that construction CAPEX and financing proceeds/debt are not counted twice.
