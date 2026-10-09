import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { downloadReport, downloadReportCsv, downloadReportJson, printReport } from "../reportDownload";

type Format = {
  label: string;
  hint: string;
  run: (monitorId: string, monitorName: string) => Promise<void>;
};

const POPUP_BLOCKED = "Pop-ups are blocked, so the HTML report was downloaded. Open it and print to save as PDF.";

const FORMATS: Format[] = [
  { label: "Report (HTML)", hint: "Styled report, works offline", run: downloadReport },
  {
    label: "PDF",
    hint: "Opens the report to save as PDF",
    run: async (id, name) => {
      if ((await printReport(id, name)) === "blocked") throw new Error(POPUP_BLOCKED);
    },
  },
  { label: "JSON", hint: "Raw numbers for scripts", run: downloadReportJson },
  { label: "CSV", hint: "Incident list for spreadsheets", run: downloadReportCsv },
];

/** Export is a split button: the main half downloads the HTML report, the chevron lists the other formats. */
export function ExportReportButton({ monitorId, monitorName }: { monitorId: string; monitorName: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  function openMenu(index = 0) {
    setOpen(true);
    // The items mount on the next render.
    window.requestAnimationFrame(() => items.current[index]?.focus());
  }

  async function run(format: Format) {
    setOpen(false);
    setBusy(true);
    setError(null);
    try {
      await format.run(monitorId, monitorName);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The report could not be exported");
    } finally {
      setBusy(false);
      // A disabled button drops focus; give it back to the half the keyboard user was on.
      window.requestAnimationFrame(() => {
        if (!document.activeElement || document.activeElement === document.body) toggle.current?.focus();
      });
    }
  }

  function onToggleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openMenu(event.key === "ArrowUp" ? FORMATS.length - 1 : 0);
    }
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = items.current.findIndex((item) => item === document.activeElement);
    const move = (index: number) => {
      event.preventDefault();
      items.current[(index + FORMATS.length) % FORMATS.length]?.focus();
    };
    if (event.key === "ArrowDown") move(current + 1);
    else if (event.key === "ArrowUp") move(current - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(FORMATS.length - 1);
    else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      toggle.current?.focus();
    } else if (event.key === "Tab") {
      // Focus the chevron first so Tab continues from it rather than from the item that is about to unmount.
      toggle.current?.focus();
      setOpen(false);
    }
  }

  return (
    <div className="inline-action" ref={root}>
      <div className="split-button">
        <button
          type="button"
          className="button secondary split-main"
          title="Download the 7-day report as HTML"
          onClick={() => void run(FORMATS[0])}
          disabled={busy}
        >
          {busy ? "Exporting…" : "Export"}
        </button>
        <button
          ref={toggle}
          type="button"
          className="button secondary split-toggle"
          aria-label="Choose export format"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={() => (open ? setOpen(false) : openMenu())}
          onKeyDown={onToggleKeyDown}
          disabled={busy}
        >
          <ChevronDown size={14} aria-hidden="true" />
        </button>
        {open && (
          <div className="split-menu" role="menu" id={menuId} aria-label="Export format" onKeyDown={onMenuKeyDown}>
            {FORMATS.map((format, index) => (
              <button
                key={format.label}
                ref={(node) => {
                  items.current[index] = node;
                }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => void run(format)}
              >
                <span className="split-label">{format.label}</span>
                <span className="split-hint">{format.hint}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <span className="inline-error" role="alert">{error}</span>}
    </div>
  );
}
