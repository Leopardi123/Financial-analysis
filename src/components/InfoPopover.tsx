import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

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
  triggerContent?: ReactNode;
  triggerClassName?: string;
  triggerStyle?: CSSProperties;
};

export default function InfoPopover({ id, openId, onToggle, onClose, title, sections, content, triggerContent, triggerClassName, triggerStyle }: InfoPopoverProps) {
  const isOpen = openId === id;
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [panelStyle, setPanelStyle] = useState<{ top: number; left: number; width: number } | null>(null);

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
      const viewportPadding = 8;
      const panelWidth = Math.min(420, window.innerWidth - viewportPadding * 2);

      let left = rect.left + rect.width / 2 - panelWidth / 2;
      left = Math.max(viewportPadding, left);
      left = Math.min(left, window.innerWidth - panelWidth - viewportPadding);

      const preferredTop = rect.bottom + 8;
      const estimatedHeight = 240;
      let top = preferredTop;
      if (preferredTop + estimatedHeight > window.innerHeight - viewportPadding) {
        top = Math.max(viewportPadding, rect.top - estimatedHeight - 8);
      }

      setPanelStyle({ top, left, width: panelWidth });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!popoverRef.current) {
        return;
      }
      if (!popoverRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [isOpen, onClose]);

  return (
    <div className="info-popover" ref={popoverRef}>
      <button
        ref={triggerRef}
        type="button"
        className={["info-popover-trigger", triggerClassName].filter(Boolean).join(" ")}
        style={triggerStyle}
        onClick={() => onToggle(id)}
        aria-label={`More info: ${title}`}
      >
        {triggerContent ?? "(i)"}
      </button>
      {isOpen && (
        <div className="info-popover-panel" style={panelStyle ?? undefined}>
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
        </div>
      )}
    </div>
  );
}
