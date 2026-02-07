import { PropsWithChildren, useState } from "react";

type SectionProps = PropsWithChildren<{
  id: string;
  title: string;
  description: string;
  defaultOpen?: boolean;
  background: string;
}>;

export default function Section({
  id,
  title,
  description,
  defaultOpen = false,
  background,
  children,
}: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="section" style={{ background }}>
      <div className="section-inner">
        <div className="rub">{title}</div>
        <div className="bread">{description}</div>
        <div className="clasp">
          <button
            type="button"
            className="clasp-button"
            onClick={() => setOpen((value) => !value)}
            aria-controls={`launcher_${id}`}
            aria-expanded={open}
          >
            ----&lt;&gt;----
          </button>
        </div>
        <div
          id={`launcher_${id}`}
          className={open ? "visual" : "hidden"}
        >
          <div className="section-content">{children}</div>
        </div>
      </div>
    </section>
  );
}
