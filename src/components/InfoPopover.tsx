import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type InfoSection = {
  heading: string;
  lines: string[];
};

type InfoPopoverProps = {
  id: string;
  openId: string | null;
  onToggle: (id: string) => void;
  onClose: () => void;
  title: string;
  sections?: InfoSection[];
  content?: string[];
};

export default function InfoPopover({ id, openId, onToggle, onClose, title, sections, content }: InfoPopoverProps) {
  const isOpen = openId === id;
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelStyle, setPanelStyle] = useState<{ top: number; left: number; width: number } | null>(null);

  const DEBUG = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debugCharts") === "1";

  const normalizedSections: InfoSection[] = sections && sections.length
    ? sections
    : (content ?? []).length
      ? [{ heading: "Info", lines: content ?? [] }]
      : [];

  useEffect(() => {
    if (!isOpen || !triggerRef.current) {
      return;
    }

    const updatePosition = () => {
      if (!triggerRef.current) {
        return;
      }
      const rect = triggerRef.current.getBoundingClientRect();
      const viewportPadding = 10;
      const panelWidth = Math.min(420, window.innerWidth - viewportPadding * 2);

      let left = rect.left + rect.width / 2 - panelWidth / 2;
      left = Math.max(viewportPadding, left);
      left = Math.min(left, window.innerWidth - panelWidth - viewportPadding);

      const preferredTop = rect.bottom + 8;
      const measuredHeight = panelRef.current?.getBoundingClientRect().height ?? 240;
      let top = preferredTop;
      if (preferredTop + measuredHeight > window.innerHeight - viewportPadding) {
        top = Math.max(viewportPadding, rect.top - measuredHeight - 8);
      }

      if (DEBUG) {
        console.log(`[InfoPopover] id=${id} trigger=${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)}x${Math.round(rect.height)} panel=${Math.round(left)},${Math.round(top)},${Math.round(panelWidth)}x${Math.round(measuredHeight)}`);
      }
      setPanelStyle({ top, left, width: panelWidth });
    };

    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [DEBUG, id, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!panelRef.current && !triggerRef.current) {
        return;
      }
      const target = event.target as Node;
      const clickedTrigger = Boolean(triggerRef.current?.contains(target));
      const clickedPanel = Boolean(panelRef.current?.contains(target));
      if (!clickedTrigger && !clickedPanel) {
        onClose();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  const panel = isOpen ? createPortal(
    <div className="info-popover-panel" ref={panelRef} style={panelStyle ? { ...panelStyle, right: "auto" } : undefined}>
      <h4>{title}</h4>
      {normalizedSections.map((section) => (
        <div key={`${section.heading}-${section.lines.join("|")}`} className="info-popover-section">
          <p className="info-popover-heading">{section.heading}</p>
          <ul>
            {section.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>,
    document.body,
  ) : null;

  return (
    <div className="info-popover" ref={popoverRef}>
      <button
        ref={triggerRef}
        type="button"
        className="info-popover-trigger"
        onClick={() => onToggle(id)}
        aria-label={`More info: ${title}`}
      >
        (i)
      </button>
      {panel}
    </div>
  );
}
