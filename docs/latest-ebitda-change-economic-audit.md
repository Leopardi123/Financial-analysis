# Full audit av senaste EBITDA-ändringen – Viscaria FS+ JSON

## Slutsats först

Den kostnad som ändrades var **sustaining CAPEX**. Ändringen var inte en ren presentationsändring: den tog bort det andra, separata FCFF-avdraget. EBIT och skatt är oförändrade. FCFF ökade med exakt sustaining CAPEX i varje berörd period.

För just denna ändring gäller därför **C: sustaining CAPEX räknades tidigare dubbelt och den nya kassaflödesbehandlingen räknar posten en gång**.

Men den bifogade JSON-filen säger uttryckligen att `revenueUSD` redan innehåller koppar och nettointäkt från järnkoncentrat och att `byproductCreditsUSD` speglar samma Fe-intäkt och **inte får läggas till igen**. Produktionskoden lägger ändå credits till EBITDA, EBIT, skatt och FCFF. Det är en separat, verifierad dubbelräkning på totalt USD 536,964,370 före skatt.

**Slutverdict för den faktiska JSON-modellen: ✗ Modellen innehåller fortfarande ett kassaflödesfel.** Sustaining-fixen är korrekt; by-product-felet gör fortfarande NPV/DCF för höga.

## 1. Exakt före och efter

### Före (`00b9bd1^`)

I `computeProjectPhase1` var serien med namnet EBITDA:

```text
oldEBITDA = Revenue - Operating costs - Sustaining CAPEX
            - Site G&A - Royalties - Reclamation + By-product credits
EBIT       = oldEBITDA - Depreciation
Tax        = max(0, EBIT) × taxRate
FCFF       = EBIT - Tax + Depreciation
             - (capexUSD + Sustaining CAPEX) - ΔWC
```

Sustaining CAPEX förekom alltså först i `oldEBITDA`/EBIT och därefter en andra gång i `totalCapexUSD` som drogs från FCFF. Före-koden finns i parent-versionen av `src/lib/project/phase1.ts`, historiska rader 86–89, 142–151.

### Efter (`00b9bd1`)

`src/lib/project/phase1.ts:87-101,150-162` implementerar:

```text
EBITDA = Revenue - Operating costs - Site G&A
         - Royalties - Reclamation + By-product credits

Sustaining-adjusted operating earnings = EBITDA - Sustaining CAPEX
EBIT = Sustaining-adjusted operating earnings - Depreciation
Tax  = max(0, EBIT) × taxRate
FCFF = EBIT - Tax + Depreciation - capexUSD - ΔWC
```

`totalCapexUSD = capexUSD + sustainingCapexUSD` finns kvar som rapportserie men används inte längre som FCFF-avdrag. Samma ändring duplicerades i snapshotens live reconstruction i `src/lib/snapshot/runCorporateSnapshot.ts:1806-1842`; Corporate aggregerar sedan färdiga project-serier i `:802-835`.

## 2. Kostnadens fulla spårning

| Steg | Före | Efter | Status för sustaining CAPEX |
|---|---|---|---|
| Revenue | Ingen effekt | Ingen effekt | Kvar utanför revenue |
| EBITDA | `−SC` i det då namngivna EBITDA | Ingen effekt i verklig EBITDA | Flyttad från EBITDA |
| Sustaining-adjusted earnings | Fanns under namnet EBITDA | `EBITDA−SC` | Kvar exakt en gång |
| EBIT | `Revenue−op−SC−G&A−roy−rec+bp−D&A` | Exakt samma formel via SAOE | **Oförändrat** |
| Taxable income | `max(0, EBIT)` | Samma | **Oförändrat** |
| Tax | taxable × 20.6% | Samma | **Oförändrat** |
| FCFF | EBIT−tax+D&A−capex−**SC**−ΔWC | EBIT−tax+D&A−capex−ΔWC | Andra avdraget eliminerat |
| NPV | Diskonterade gamla FCFF | Diskonterade nya FCFF | Ökar med PV av borttaget dubbelavdrag |

Sustaining CAPEX har alltså inte tappats bort. Den sänker fortfarande EBIT och FCFF efter skatt genom sustaining-adjusted earnings. Den tas bara inte dessutom bort som ett fullständigt kassautflöde en andra gång.

## 3. Kontroll mot begärda standardidentiteter

Påståendet `EBITDA = Revenue − Operating costs` är **inte hela den faktiska modellen**. Project JSON anger att `operatingCostsUSD` exkluderar site G&A och royalties. Den kodade, fullständiga EBITDA-bryggan måste därför även dra site G&A, royalties och eventuell reclamation. Den lägger dessutom till credits:

```text
Modeled EBITDA = Revenue − Operating costs − Site G&A
                 − Royalties − Reclamation + By-product credits
```

`EBIT = EBITDA − D&A` gäller **inte** i denna projektspecifika kalkylkedja, eftersom sustaining CAPEX fortfarande tas genom SAOE före EBIT:

```text
Modeled EBIT = EBITDA − Sustaining CAPEX − D&A
```

Detta är ett medvetet bevarande av den tidigare skattebasen, inte konventionell redovisnings-EBIT. FCFF-identiteten är:

```text
FCFF = EBIT − Tax + D&A − capexUSD − ΔWC
```

Den är algebraiskt korrekt för den valda policyn därför att sustaining CAPEX redan ligger i EBIT. Om man i framtiden byter till konventionell `EBIT=EBITDA−D&A` måste sustaining CAPEX återinföras som separat FCFF-CAPEX-avdrag. Att göra båda samtidigt vore dubbelt; att göra inget vore bortfall.

## 4. Numerisk före/efter-reconciliation

`scripts/debug/viscariaEbitdaChangeAudit.ts` använder exakt de 21 bifogade periodserierna och den historiska formeln från parent commit. Assertions bevisar periodvis att:

* `EBIT_after = EBIT_before`;
* `Tax_after = Tax_before`;
* `FCFF_after − FCFF_before = sustainingCapexUSD`.

Belopp nedan är USD:

| t | År | Sustaining CAPEX | FCFF före | FCFF efter | Differens |
|---:|---:|---:|---:|---:|---:|
| 2 | 2027 | 5,193,107 | -149,574,661 | -144,381,554 | 5,193,107 |
| 3 | 2028 | 95,190,971 | -11,652,751 | 83,538,220 | 95,190,971 |
| 4 | 2029 | 30,323,107 | 139,101,041 | 169,424,148 | 30,323,107 |
| 5 | 2030 | 14,486,408 | 187,176,585 | 201,662,993 | 14,486,408 |
| 6 | 2031 | 22,294,757 | 191,013,686 | 213,308,443 | 22,294,757 |
| 7 | 2032 | 20,549,223 | 180,308,672 | 200,857,895 | 20,549,223 |
| 8 | 2033 | 17,714,272 | 183,828,254 | 201,542,526 | 17,714,272 |
| 9 | 2034 | 19,106,117 | 164,914,566 | 184,020,683 | 19,106,117 |
| 10 | 2035 | 12,027,379 | 196,566,065 | 208,593,444 | 12,027,379 |
| 11 | 2036 | 9,197,767 | 195,956,487 | 205,154,254 | 9,197,767 |
| 12 | 2037 | 18,956,602 | 102,891,341 | 121,847,943 | 18,956,602 |
| 13 | 2038 | 12,358,350 | 89,641,338 | 101,999,688 | 12,358,350 |
| 14 | 2039 | 5,737,961 | 47,188,001 | 52,925,962 | 5,737,961 |
| 15 | 2040 | 3,964,660 | 40,815,731 | 44,780,391 | 3,964,660 |
| 16 | 2041 | 12,034,563 | 24,606,758 | 36,641,321 | 12,034,563 |
| 17 | 2042 | 5,404,757 | 40,837,795 | 46,242,552 | 5,404,757 |
| 18 | 2043 | 1,780,777 | 44,276,826 | 46,057,603 | 1,780,777 |
| 19 | 2044 | 18,956,796 | 1,000,641 | 19,957,437 | 18,956,796 |

Perioderna t0, t1 och t20 har sustaining CAPEX noll och ingen differens.

### Totalsamband

| Mått | Före | Efter | Differens |
|---|---:|---:|---:|
| Odiskonterad FCFF | USD 1,304,025,888.84 | USD 1,629,303,462.84 | **USD 325,277,574.00** |
| NPV10 från t0 | USD 344,430,506.66 | USD 516,492,343.16 | **USD 172,061,836.50** |
| NPV10-differens i SEK, 10.3 SEK/USD | – | – | **SEK 1,772,236,915.92** |

Den beräknade SEK-differensen på cirka SEK 1.77 miljarder förklarar nästan exakt den rapporterade ökningen 9.6 → 11.4 miljarder. Storleken är därför väntad för borttagandet av ett verkligt dubbelt kassaflödesavdrag; ändringen var aldrig enbart presentation.

Att NAV uppges vara nästan oförändrat kan inte användas som bevis för FCFF-identiteten: NAV-vyn kan använda en annan net-cash/CAPEX/tidsdefinition. Den verifierade project-NPV-effekten är PV av sustaining-serien.

## 5. Separat verifierat fel i den bifogade JSON-filen

JSON-noten säger:

```text
revenueUSD is total net revenue after ... iron-concentrate realization costs.
byproductCreditsUSD mirrors net Fe-concentrate revenue ...;
do not add it again where revenueUSD is already used.
```

Trots detta läser `computeProjectPhase1` båda serierna och använder `+ bp` i både EBITDA och SAOE (`src/lib/project/phase1.ts:72-94`). Följden är:

```text
Revenue (inklusive Fe-nettointäkt)
+ By-product credits (samma Fe-nettointäkt enligt datanoten)
= dubbel ekonomisk intäkt
```

Credits summerar till **USD 536,964,370**. De höjer SAOE/EBIT med samma nominella belopp, höjer skatt i positiva perioder och höjer FCFF med beloppet efter skatt. Detta fel fanns både före och efter sustaining-ändringen; det är inte orsaken till just före/efter-differensen, men det gör båda värderingarna för höga.

Revenue-resolvern kan dessutom rekonstruera gross revenue från betalbar Cu × pris. Därför måste valet mellan explicit total `revenueUSD` och rekonstruerad metallrevenue dokumenteras vid en full snapshotkörning. Oavsett vald revenue-källa är `+byproductCreditsUSD` fel för denna JSON när källans total redan inkluderar Fe, eftersom datakontraktet uttryckligen förbjuder tillägget.

## 6. Svar på kontrollfrågorna

1. **Vilken kostnad ändrades?** Sustaining CAPEX: det andra FCFF-avdraget togs bort i Project phase1 och snapshot live reconstruction.
2. **Har EBIT förändrats?** Nej, verifierat identiskt i alla 21 perioder.
3. **Har skatt förändrats?** Nej, verifierat identisk i alla 21 perioder.
4. **Har FCFF blivit högre?** Ja, med exakt sustaining CAPEX i t2–t19; totalt USD 325,277,574.
5. **Var detta endast EBITDA-presentation?** Nej. EBITDA-definitionen ändrades och ett kassaflödesavdrag togs bort.
6. **Försvann sustaining CAPEX?** Nej. Den ligger kvar i SAOE → EBIT → tax → FCFF, med nettoeffekt efter skatt.
7. **A/B/C?** **C** för den senaste ändringen. Tidigare räknades sustaining CAPEX dubbelt.
8. **Är hela modellen korrekt för bifogad JSON?** Nej. Fe by-product credits räknas bevisligen ovanpå revenue som enligt JSON redan innehåller samma Fe-nettointäkt.

## Slutverdict

**✗ Modellen innehåller fortfarande ett kassaflödesfel.**

Den senaste sustaining-CAPEX-korrigeringen är ekonomiskt riktig och dess stora NPV-effekt är fullt reconcilerad. Nästa separata korrigering måste göra revenue/credit-kontraktet entydigt och för denna JSON förhindra att `byproductCreditsUSD` adderas när `revenueUSD` redan inkluderar Fe-intäkten. Därefter måste NPV, Corporate DCF, CF LOM ETLV och NAV testköras från samma revenue source och reconcileras igen.
