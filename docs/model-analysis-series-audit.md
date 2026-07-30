# Modellanalys: audit av befintliga modellrelationer

Kartläggningen gjordes innan konvergensmotorn ändrades. Corporate-snapshotens periodaxel innehåller redan
`oreMinedTonnes`, `oreMilledTonnes`, payable kvantitet och pris per metall, metallintäkt och total intäkt,
operating costs, sustaining CAPEX, site G&A, royalties, reclamation, working capital, skatt, EBITDA, FCFF,
initial CAPEX och total CAPEX. Snapshoten innehåller också throughput-enhet/nameplate/utilization när projektfilen
har dessa värden. Corporate-finansieringen innehåller cash-first, skuld, equity raise och post-financing shares.
Corporate-värderingstidslinjen innehåller DCF/NAV samt 5×, 6× och 7× EV/EBITDA per aktie.

## Existerande kausala regler

* Metallintäkt räknas som payable kvantitet gånger respektive periods metalldeck. Samma faktor kan därför
  appliceras på alla metalldeck utan att ändra kvantitet eller FX.
* EBITDA räknas från intäkt minus operating costs, sustaining CAPEX, site G&A, royalty och reclamation plus
  by-product credits. EBITDA ändras aldrig direkt.
* Taxable income är `max(0, EBITDA - depreciation)` och FCFF byggs från NOPAT, depreciation, initial och
  sustaining CAPEX samt working-capital delta. Reclamation dras inte en andra gång i FCFF.
* Revenue-baserade NSR/ad-valorem royalties har både periodserie och regel i projektmotorn. Royaltyscenario
  tillåts bara när Corporate-snapshoten har faktisk royaltydetalj; en explicit royaltyserie kan reduceras men
  priselasticitet för en sådan serie antas inte.
* DCF räknas genom periodvis diskontering av omräknad FCFF. EV/EBITDA räknas från omräknad EBITDA i samma
  referensperiod, vald 6×-multipel, net cash och post-financing shares.
* Operating-cost- och sustaining-CAPEX-paket kan räknas genom att skala sina respektive faktiska periodserier.
  Övriga kostnadsposter hålls oförändrade; detta undviker dubbelräkning.
* Diskonteringsräntan kan sökas direkt mot omräknad FCFF utan att ändra något kassaflöde.

## Paketgränser

Metallpris, operating cost, sustaining CAPEX, royalty och diskonteringsränta kan räknas deterministiskt när
ovanstående serier är kompletta. Ren throughputacceleration kan endast räknas när ore-milled/payable-serierna
kan komprimeras tillsammans med alla periodbundna kostnader och slutposter utan att dela en periods grade/recovery
godtyckligt. Expansion-throughput kräver fortfarande användarens CAPEX-tidpunkt, cost scaling, byggtid,
produktionsstörning och finansieringsrelation; inga sådana värden härleds eller hårdkodas.
