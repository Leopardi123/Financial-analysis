export type ConvergenceStatus = "Fullt beräkningsbart" | "Ej beräkningsbart";

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
    if (requiredMultiple >= minMultiple && requiredMultiple <= maxMultiple) {
      const convergedValue = interpolate(input.multiplePoints, requiredMultiple) as number;
      const gap = Math.abs(dcf - convergedValue);
      const gapPct = relativeGapPct(dcf, convergedValue);
      packages.push({
        id: "ev-multiple", name: "Ändrad EV/EBITDA-multipel", status: "Fullt beräkningsbart",
        changedAssumptions: [`Mittmultipel ${input.referenceMultiple.toFixed(1)}× → ${requiredMultiple.toFixed(2)}×`],
        requiredChange: `${requiredMultiple - input.referenceMultiple >= 0 ? "+" : ""}${(requiredMultiple - input.referenceMultiple).toFixed(2)}×`,
        effects: ["EBITDA: oförändrad", "DCF/NAV: oförändrat", `EV/EBITDA-värde/aktie: ${referenceValue.toFixed(2)} → ${convergedValue.toFixed(2)} ${input.currency}`],
        dcfBefore: dcf, dcfAfter: dcf, multipleBefore: referenceValue, multipleAfter: convergedValue,
        absoluteGap: gap, relativeGapPct: gapPct, additionalCapital: 0, dilutionPct: 0,
        conclusion: `En mittmultipel om ${requiredMultiple.toFixed(2)}× reducerar modellgapet från ${relativeGapPct(dcf, referenceValue).toFixed(1)} % till ${gapPct.toFixed(1)} % och ${gapPct <= tolerance ? "når" : "når inte"} toleransen ${tolerance.toFixed(1)} %.`,
      });
    } else {
      packages.push(unavailable("ev-multiple", "Ändrad EV/EBITDA-multipel", `Krävd multipel ${requiredMultiple.toFixed(2)}× ligger utanför modellens explicita intervall ${minMultiple.toFixed(1)}–${maxMultiple.toFixed(1)}×.`));
    }
  } else {
    packages.push(unavailable("ev-multiple", "Ändrad EV/EBITDA-multipel", "Corporate-serien saknar fullständiga DCF- och EV/EBITDA-värden."));
  }

  packages.push(
    unavailable("throughput", "Ökad throughput", "Modellen saknar en definierad, gemensam relation mellan throughput, expansions-CAPEX, sustaining CAPEX, LOM och finansiering."),
    unavailable("cost", "Kostnadspaket", "Modellutdata anger inte sökbara kostnadsgränser och kausala regler för samtliga skatte- och produktionsföljder."),
    unavailable("royalty", "Återköp av royalty", "Modellen saknar angiven återköpskostnad eller explicit sökintervall för återköpspriset samt en verifierbar periodiserad återköpsbetalning."),
  );

  return packages.sort((a, b) => Number(b.status === "Fullt beräkningsbart") - Number(a.status === "Fullt beräkningsbart")
    || Math.abs((a.multipleAfter ?? 0) - (a.multipleBefore ?? 0)) - Math.abs((b.multipleAfter ?? 0) - (b.multipleBefore ?? 0))
    || (a.additionalCapital ?? Infinity) - (b.additionalCapital ?? Infinity)
    || (a.relativeGapPct ?? Infinity) - (b.relativeGapPct ?? Infinity)
    || a.changedAssumptions.length - b.changedAssumptions.length);
}
