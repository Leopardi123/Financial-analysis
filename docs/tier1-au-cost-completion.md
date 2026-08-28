# Au cost Tier completion note

Au is considered engine-complete for the reported, definition-locked AISC path when all of the following hold:

1. Project evidence uses `AISC_AU_USD_PER_TOZ` with basis `S_AND_P_CO_PRODUCT_AISC_AU`.
2. `costBaseYear` matches an exact Au benchmark snapshot; no implicit inflation/backcast is allowed.
3. The benchmark exposes a full P25/P50/P75 curve.
4. The runtime cost gate classifies Tier 1/2/3 using the selected snapshot.
5. A real-project regression locks the evidence-to-gate chain.

Current verified Au benchmark snapshot: 2025E S&P Capital IQ / G2 Goldfields global co-product gold AISC curve, P25/P50/P75 = 1,228 / 1,501 / 1,840 USD/toz.

Real-project regression: Bilboes Gold Project 2025 Technical Report Summary. Table 19-6 (p. 158) reports LOM AISC of US$1,061/oz real 2025; Table 19-4 (p. 157) reports 1.55 Moz recovered gold. The regression verifies extraction, exact-year benchmark selection, and Cost Tier 1 classification.

Important limitation: this does not mean every Au project can be classified. A project without a definition-compatible reported AISC remains `NOT_VERIFIED`; the engine does not synthesize missing corporate G&A, sustaining exploration/studies, or other WGC/S&P AISC components from incomplete project data.
