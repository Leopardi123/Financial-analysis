import { normalizeOverlayDate, type TimelineOverlay, type TimelineOverlayEvent } from "../data/macroTimelineOverlays";

type PlotBounds = { x: number; y: number; width: number; height: number };

function firstIndexOnOrAfter(dates: string[], target: string): number {
  const normalizedTarget = normalizeOverlayDate(target);
  const idx = dates.findIndex((date) => normalizeOverlayDate(date) >= normalizedTarget);
  return idx < 0 ? dates.length - 1 : idx;
}

export default function TimelineOverlayLayer({
  dates,
  overlays,
  activeOverlayIds,
  plot,
  onEventClick,
}: {
  dates: string[];
  overlays: TimelineOverlay[];
  activeOverlayIds: string[];
  plot: PlotBounds;
  onEventClick?: (payload: { overlay: TimelineOverlay; event: TimelineOverlayEvent }) => void;
}) {
  if (dates.length === 0 || activeOverlayIds.length === 0) return null;

  const xAtIndex = (index: number) => plot.x + (index / Math.max(1, dates.length - 1)) * plot.width;

  return (
    <>
      {overlays
        .filter((overlay) => activeOverlayIds.includes(overlay.id))
        .flatMap((overlay) => {
          return overlay.events.map((event, eventIndex) => {
            const startIndex = firstIndexOnOrAfter(dates, event.start);
            const endIndex = firstIndexOnOrAfter(dates, event.end ?? dates[dates.length - 1]);
            const x1 = xAtIndex(Math.max(0, Math.min(startIndex, dates.length - 1)));
            const x2 = xAtIndex(Math.max(0, Math.min(endIndex, dates.length - 1)));
            const minX = Math.min(x1, x2);
            const width = Math.max(2, Math.abs(x2 - x1));

            const commonProps = {
              key: `${overlay.id}-${event.label}-${eventIndex}`,
              onClick: () => onEventClick?.({ overlay, event }),
              style: { cursor: onEventClick ? "pointer" : "default" },
            };

            if (overlay.style === "marker") {
              const cx = x1;
              const cy = plot.y + plot.height - 6;
              return (
                <g {...commonProps}>
                  <line x1={cx} x2={cx} y1={plot.y + plot.height - 16} y2={plot.y + plot.height} stroke={overlay.color} strokeWidth={1.5} opacity={0.9} />
                  <circle cx={cx} cy={cy} r={4} fill={overlay.color} opacity={0.95} />
                  <title>{`${overlay.name}: ${event.label} (${event.start})`}</title>
                </g>
              );
            }

            if (overlay.style === "line") {
              const cx = x1;
              return (
                <g {...commonProps}>
                  <line x1={cx} x2={cx} y1={plot.y} y2={plot.y + plot.height} stroke={overlay.color} strokeWidth={2} opacity={0.5} />
                  <title>{`${overlay.name}: ${event.label} (${event.start}${event.end ? ` → ${event.end}` : ""})`}</title>
                </g>
              );
            }

            return (
              <g {...commonProps}>
                <rect x={minX} y={plot.y} width={width} height={plot.height} fill={overlay.color} fillOpacity={0.2} />
                <title>{`${overlay.name}: ${event.label} (${event.start}${event.end ? ` → ${event.end}` : " → present"})`}</title>
              </g>
            );
          });
        })}
    </>
  );
}
