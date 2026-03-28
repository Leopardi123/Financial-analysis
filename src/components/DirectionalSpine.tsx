import { useMemo } from "react";

type DemandState = "contraction" | "neutral" | "expansion";
type DivergenceType = "none" | "confirming" | "diverging" | "bullish_divergence" | "bearish_divergence";

type DriverBar = {
  id: "price_momentum" | "demand" | "supply";
  label: string;
  value: number | null;
  missing?: boolean;
  missingLabel?: string;
};

export type DirectionalSpineProps = {
  price_percentile: number | null;
  momentum_12m: number | null;
  china_cli: number | null;
  demand_state: DemandState;
  divergenceType: DivergenceType;
  confidence: number;
  supplySignal?: number | null;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const toPercent = (value: number) => `${(clamp01(value) * 100).toFixed(1)}%`;

function confidenceColor(confidence: number): string {
  const c = clamp01(confidence);
  const hue = 8 + (c * 122);
  return `hsl(${hue} 72% 43%)`;
}

function demandStateToBias(state: DemandState): number {
  if (state === "expansion") return 0.18;
  if (state === "contraction") return -0.18;
  return 0;
}

function normalizeMomentum(momentum: number | null): number {
  if (momentum === null || !Number.isFinite(momentum)) return 0;
  return Math.max(-1, Math.min(1, momentum));
}

function normalizeChinaCli(cli: number | null): number {
  if (cli === null || !Number.isFinite(cli)) return 0;
  if (Math.abs(cli) <= 1) return Math.max(-1, Math.min(1, cli));
  return Math.max(-1, Math.min(1, (cli - 100) / 10));
}

function driverToBarWidth(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "0%";
  const scaled = clamp01((value + 1) / 2);
  return `${(scaled * 100).toFixed(1)}%`;
}

export default function DirectionalSpine(props: DirectionalSpineProps) {
  const {
    price_percentile,
    momentum_12m,
    china_cli,
    demand_state,
    divergenceType,
    confidence,
    supplySignal = null,
  } = props;

  const longTermPosition = clamp01(price_percentile ?? 0.5);
  const momentumNorm = normalizeMomentum(momentum_12m);
  const demandBias = demandStateToBias(demand_state);
  const shortTermPosition = clamp01(longTermPosition + (momentumNorm * 0.22) + demandBias);
  const accelerationDelta = shortTermPosition - longTermPosition;

  const divergenceActive = divergenceType !== "none" && divergenceType !== "confirming";
  const spineColor = confidenceColor(confidence);

  const driverBars: DriverBar[] = useMemo(() => {
    return [
      {
        id: "price_momentum",
        label: "Price momentum",
        value: momentumNorm,
      },
      {
        id: "demand",
        label: "Demand (China CLI)",
        value: normalizeChinaCli(china_cli),
      },
      {
        id: "supply",
        label: "Supply",
        value: supplySignal,
        missing: supplySignal === null,
        missingLabel: "Missing state",
      },
    ];
  }, [momentumNorm, china_cli, supplySignal]);

  return (
    <div className="directional-spine" aria-label="Directional Spine">
      <div className="directional-spine-axis-head">
        <span>Contraction</span>
        <span>Expansion</span>
      </div>

      <div className="directional-spine-axis-wrap">
        <div
          className="directional-spine-axis"
          style={{
            background: `linear-gradient(90deg, color-mix(in srgb, ${spineColor} 32%, #7f1d1d) 0%, color-mix(in srgb, ${spineColor} 40%, #334155) 50%, color-mix(in srgb, ${spineColor} 40%, #14532d) 100%)`,
          }}
        />

        <div
          className={`directional-spine-marker long-term ${divergenceActive ? "is-divergent" : ""}`}
          style={{ left: toPercent(longTermPosition), borderColor: spineColor }}
          title="Long term (5y)"
          aria-label="Long term (5y)"
        >
          <span>5Y</span>
        </div>

        <div
          className={`directional-spine-marker short-term ${divergenceActive ? "is-divergent" : ""} ${accelerationDelta >= 0 ? "accelerating" : "decelerating"}`}
          style={{
            left: toPercent(shortTermPosition),
            borderColor: spineColor,
            transform: `translate(-50%, ${accelerationDelta >= 0 ? "-12px" : "12px"})`,
          }}
          title="Short term (1y)"
          aria-label="Short term (1y)"
        >
          <span>1Y</span>
        </div>
      </div>

      <div className="directional-spine-driver-bars" aria-label="Drivers">
        {driverBars.map((bar) => (
          <div key={bar.id} className="directional-driver-row">
            <div className="directional-driver-meta">
              <span>{bar.label}</span>
              {bar.missing ? <em>{bar.missingLabel}</em> : null}
            </div>
            <div className={`directional-driver-track ${bar.missing ? "is-missing" : ""}`}>
              <div
                className="directional-driver-fill"
                style={{
                  width: driverToBarWidth(bar.value),
                  background: spineColor,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
