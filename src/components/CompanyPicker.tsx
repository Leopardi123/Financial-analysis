import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

export type CompanyOption = {
  symbol: string;
  name: string;
  exchange: string | null;
  type: string | null;
};

type CompanyPickerProps = {
  onSelect: (company: CompanyOption) => void;
  placeholder?: string;
  label?: string;
};

export default function CompanyPicker({
  onSelect,
  placeholder = "Search company name",
  label = "Company",
}: CompanyPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CompanyOption[]>([]);
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      const text = query.trim();
      if (text.length < 2) {
        setResults([]);
        setOpen(false);
        return;
      }
      setLoading(true);
      try {
        const response = await fetch(`/api/companies?q=${encodeURIComponent(text)}`);
        const payload = await response.json();
        const next = Array.isArray(payload.results) ? payload.results : [];
        setResults(next);
        setOpen(true);
        setHighlightedIndex(0);
      } catch {
        setResults([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [query]);

  const topMatch = useMemo(() => results[0] ?? null, [results]);

  function choose(item: CompanyOption) {
    onSelect(item);
    setQuery(`${item.name} (${item.symbol})`);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) {
      if (event.key === "Enter" && topMatch) {
        event.preventDefault();
        choose(topMatch);
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((prev) => Math.min(prev + 1, results.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const choice = results[highlightedIndex] ?? topMatch;
      if (choice) choose(choice);
      return;
    }
    if (event.key === "Escape") setOpen(false);
  }

  return (
    <div className="company-picker" ref={wrapperRef}>
      <label>{label}</label>
      <input
        value={query}
        placeholder={placeholder}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setOpen(results.length > 0)}
        onKeyDown={onKeyDown}
      />
      {loading && <div className="company-picker-loading">Searching…</div>}
      {open && results.length > 0 && (
        <ul className="company-picker-results">
          {results.map((item, index) => (
            <li
              key={`${item.symbol}-${item.name}`}
              className={index === highlightedIndex ? "active" : ""}
              onMouseEnter={() => setHighlightedIndex(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(item);
              }}
            >
              {item.name} ({item.symbol}){item.exchange ? ` – ${item.exchange}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
