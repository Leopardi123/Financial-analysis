# Screening: Simple + Advanced på gemensam motor

## Varför gemensam motor
Screening-sidan exponerar nu två användarlägen (`Simple` och `Advanced`) men båda använder samma regelmotor (`evaluateScreen`).
Det ger:
- enhetlig logik för match/fail
- samma resultattabell
- möjlighet att öppna presets i Advanced och fortsätta justera
- enklare framtida utökning med nya fältkällor.

## Intern representation
Presets representeras som `ScreenDefinition` med regelgrupper:
- `mustHave` (implementerad)
- `niceToHave` (förberedd i typer)
- `excludeIf` (förberedd i typer)

Varje regel har:
- `field`
- `operator`
- `value` (kan vara konstant eller parameterreferens)
- valfri metadata (`label`, `weight`, `group`).

## Simple mode
Simple visar:
- universe
- preset-val
- checks/ignores
- begränsade override-fält från preset defaults
- möjlighet att "Öppna i avancerat läge"

## Advanced mode
Advanced bygger en `ScreenDefinition` med användarens regler (första version: AND/mustHave).
Det är samma regelmotor och samma resultatmodell som i Simple.

## Fältkatalog och datakällor
`SCREENING_FIELDS` definierar:
- fältnyckel
- label
- grupp (price, fundamentals, risk, mining, manual)
- datatype
- source
- synlighet i simple/advanced

Prisfält hämtas primärt från `price_screen_snapshot` via `/api/screening/price-snapshot`.
Fundamental/risk/manual hämtas från befintliga company-data och analyst overrides.

## Universe-derivering (default-beteende)
- Default-universe är `All available data`.
- Bas-universe hämtas från alla tickers i `company/list`.
- Aktiv screen läser vilka `mustHave`-fält som krävs.
- Efter körning klassas varje bolag som:
  - `passed`
  - `failed`
  - `not_evaluated` (saknar obligatorisk data för minst ett required field)
- UI visar både bas-universe och hur många som faktiskt kunde utvärderas.

## Lägga till nya screeningfält
1. Lägg till fält i `SCREENING_FIELDS`.
2. Lägg till resolver i `resolveFieldValue`.
3. Använd fältet i presets eller Advanced-regler.

Detta möjliggör senare integration av exempelvis `ev_over_npv`, `nav` och längre cykelmått utan att skapa en separat screeningmotor.
