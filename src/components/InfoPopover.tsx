import { useEffect, useRef } from "react";

type InfoPopoverProps = {
  id: string;
  openId: string | null;
  onToggle: (id: string) => void;
  onClose: () => void;
  title: string;
  content: string[];
};

export default function InfoPopover({ id, openId, onToggle, onClose, title, content }: InfoPopoverProps) {
  const isOpen = openId === id;
  const popoverRef = useRef<HTMLDivElement | null>(null);

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
      <button type="button" className="info-popover-trigger" onClick={() => onToggle(id)} aria-label={`More info: ${title}`}>
        (i)
      </button>
      {isOpen && (
        <div className="info-popover-panel">
          <h4>{title}</h4>
          <ul>
            {content.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
