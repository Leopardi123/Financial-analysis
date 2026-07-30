export type ConvergenceStatus = "Fullt beräkningsbart" | "Matematiskt lösbart – utanför modellintervall" | "Kräver användarindata" | "Ej beräkningsbart";

export type ConvergencePackage = {
  id: string;
  name: string;
  status: ConvergenceStatus;
  changedAssumptions: string[];
  requiredChange: string;
  effects: string[];
  dcfBefore: number | null;
  dcfAfter: number | null;
  multipleBefore: number | null;
  multipleAfter: number | null;
  absoluteGap: number | null;
  relativeGapPct: number | null;
  additionalCapital: number | null;
  dilutionPct: number | null;
  conclusion: string;
  missingRelation?: string;
};

type MultiplePoint = { multiple: number; valuePerShare: number };

export type ConvergenceInput = {
  dcfPerShare: number | null;
  referenceMultiple: number;
  multiplePoints: MultiplePoint[];
  currency: string;
  tolerancePct?: number;
};

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export function relativeGapPct(a: number, b: number): number {
  const denominator = Math.max(Math.abs(a), Math.abs(b));
  return denominator === 0 ? 0 : Math.abs(a - b) / denominator * 100;
}

function interpolate(points: MultiplePoint[], multiple: number): number | null {
  const sorted = points.filter((point) => finite(point.valuePerShare)).sort((a, b) => a.multiple - b.multiple);
  const exact = sorted.find((point) => point.multiple === multiple);
  if (exact) return exact.valuePerShare;
  const upperIndex = sorted.findIndex((point) => point.multiple > multiple);
  if (upperIndex <= 0) return null;
  const low = sorted[upperIndex - 1];
  const high = sorted[upperIndex];
  const weight = (multiple - low.multiple) / (high.multiple - low.multiple);
  return low.valuePerShare + (high.valuePerShare - low.valuePerShare) * weight;
}

function extrapolate(points: MultiplePoint[], multiple: number): number | null {
  const sorted = points.filter((point) => finite(point.valuePerShare)).sort((a, b) => a.multiple - b.multiple);
  if (sorted.length < 2) return null;
  if (multiple >= sorted[0].multiple && multiple <= sorted[sorted.length - 1].multiple) return interpolate(sorted, multiple);
  const pair = multiple < sorted[0].multiple ? sorted.slice(0, 2) : sorted.slice(-2);
  return pair[0].valuePerShare + (pair[1].valuePerShare - pair[0].valuePerShare) * (multiple - pair[0].multiple) / (pair[1].multiple - pair[0].multiple);
}

function unavailable(id: string, name: string, missingRelation: string): ConvergencePackage {
  return {
    id, name, status: "Ej beräkningsbart", changedAssumptions: [], requiredChange: "Ej beräkningsbart",
    effects: [], dcfBefore: null, dcfAfter: null, multipleBefore: null, multipleAfter: null,
    absoluteGap: null, relativeGapPct: null, additionalCapital: null, dilutionPct: null,
    missingRelation, conclusion: `Paketet beräknas inte eftersom ${missingRelation.toLocaleLowerCase("sv-SE")}`,
  };
}

/** Builds only packages whose causal rules are explicitly present in the supplied model output. */
export function buildConvergencePackages(input: ConvergenceInput): ConvergencePackage[] {
  const tolerance = input.tolerancePct ?? 2;
  const dcf = input.dcfPerShare;
  const referenceValue = interpolate(input.multiplePoints, input.referenceMultiple);
  const minMultiple = Math.min(...input.multiplePoints.map((point) => point.multiple));
  const maxMultiple = Math.max(...input.multiplePoints.map((point) => point.multiple));
  const lowValue = interpolate(input.multiplePoints, minMultiple);
  const highValue = interpolate(input.multiplePoints, maxMultiple);
  const packages: ConvergencePackage[] = [];

  if (finite(dcf) && finite(referenceValue) && finite(lowValue) && finite(highValue) && highValue !== lowValue) {
    // EV/equity value is evaluated from the model's own explicit multiple boundary points.
    const requiredMultiple = minMultiple + (dcf - lowValue) * (maxMultiple - minMultiple) / (highValue - lowValue);
    if (Number.isFinite(requiredMultiple) && requiredMultiple >= 0) {
      const within = requiredMultiple >= minMultiple && requiredMultiple <= maxMultiple;
      const convergedValue = extrapolate(input.multiplePoints, requiredMultiple) as number;
      const gap = Math.abs(dcf - convergedValue);
      const gapPct = relativeGapPct(dcf, convergedValue);
      packages.push({
        id: "ev-multiple", name: "Ändrad EV/EBITDA-multipel", status: within ? "Fullt beräkningsbart" : "Matematiskt lösbart – utanför modellintervall",
        changedAssumptions: [`Mittmultipel ${input.referenceMultiple.toFixed(1)}× → ${requiredMultiple.toFixed(2)}×`],
        requiredChange: `${requiredMultiple - input.referenceMultiple >= 0 ? "+" : ""}${(requiredMultiple - input.referenceMultiple).toFixed(2)}×`,
        effects: ["EBITDA: oförändrad", "DCF/NAV: oförändrat", `Modellintervall: ${minMultiple.toFixed(1)}–${maxMultiple.toFixed(1)}×`, `EV/EBITDA-värde/aktie: ${referenceValue.toFixed(2)} → ${convergedValue.toFixed(2)} ${input.currency}`],
        dcfBefore: dcf, dcfAfter: dcf, multipleBefore: referenceValue, multipleAfter: convergedValue,
        absoluteGap: gap, relativeGapPct: gapPct, additionalCapital: 0, dilutionPct: 0,
        conclusion: `En mittmultipel om ${requiredMultiple.toFixed(2)}× reducerar modellgapet från ${relativeGapPct(dcf, referenceValue).toFixed(1)} % till ${gapPct.toFixed(1)} % och ${gapPct <= tolerance ? "når" : "når inte"} toleransen ${tolerance.toFixed(1)} %.`,
      });
    }
  } else {
    packages.push(unavailable("ev-multiple", "Ändrad EV/EBITDA-multipel", "Corporate-serien saknar fullständiga DCF- och EV/EBITDA-värden."));
  }

  packages.push(
    { ...unavailable("throughput", "Throughput med expansionsrelationer", "Ange throughputökning, expansions-CAPEX och tidpunkt, sustaining-CAPEX-effekt, cost-scaling, byggtid, produktionsstörning och finansieringsbehov."), status: "Kräver användarindata" },
    unavailable("cost", "Kostnadspaket", "Modellutdata anger inte sökbara kostnadsgränser och kausala regler för samtliga skatte- och produktionsföljder."),
    unavailable("royalty", "Återköp av royalty", "Modellen saknar angiven återköpskostnad eller explicit sökintervall för återköpspriset samt en verifierbar periodiserad återköpsbetalning."),
  );

  const rank: Record<ConvergenceStatus, number> = { "Fullt beräkningsbart": 0, "Matematiskt lösbart – utanför modellintervall": 2, "Kräver användarindata": 3, "Ej beräkningsbart": 4 };
  return packages.sort((a, b) => rank[a.status] - rank[b.status]
    || Math.abs((a.multipleAfter ?? 0) - (a.multipleBefore ?? 0)) - Math.abs((b.multipleAfter ?? 0) - (b.multipleBefore ?? 0))
    || (a.additionalCapital ?? Infinity) - (b.additionalCapital ?? Infinity)
    || (a.relativeGapPct ?? Infinity) - (b.relativeGapPct ?? Infinity)
    || a.changedAssumptions.length - b.changedAssumptions.length);
}
