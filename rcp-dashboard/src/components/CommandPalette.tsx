import { ArrowUpRight, Bell, Command, CornerDownLeft, Gauge, Keyboard, LayoutList, Play, Plus, Search, SunMoon, Workflow } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { listMonitors } from "../api";
import { compactUrl, monitorState } from "../format";
import { fuzzyScore, SHORTCUTS } from "../commands";
import { useReadOnly } from "../session";
import { toggleTheme } from "../theme";
import { tour } from "../tour";
import type { MonitorOverview } from "../types";
import { StatusDot } from "./StatusBadge";

type Item = {
  id: string;
  group: "Go to" | "Monitors" | "Actions";
  label: string;
  hint?: string;
  keys?: string[];
  icon: ReactNode;
  run: () => void;
};

function typing(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return !!element && (element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName));
}

export function Keys({ keys }: { keys: string[] }) {
  return <span className="keys">{keys.map((key) => <kbd key={key}>{key}</kbd>)}</span>;
}

/**
 * Keyboard-first navigation for the console: ⌘K (or Ctrl+K) opens a palette over every page and monitor,
 * "g" then a letter jumps between pages, and "?" lists the shortcuts. Shortcuts stay quiet while typing in a field.
 */
export function CommandPalette() {
  const navigate = useNavigate();
  const readOnly = useReadOnly();
  const [mode, setMode] = useState<"closed" | "palette" | "help">("closed");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [monitors, setMonitors] = useState<MonitorOverview[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    let leader = 0;
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setMode((current) => (current === "palette" ? "closed" : "palette"));
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return;
      if (document.querySelector(".dialog-backdrop")) return;
      const key = event.key.toLowerCase();
      if (leader && Date.now() - leader < 1200) {
        leader = 0;
        const to = ({ o: "/", m: "/monitors", p: "/pipeline" } as Record<string, string>)[key];
        if (to) {
          event.preventDefault();
          navigate(to);
        }
        return;
      }
      if (key === "g") leader = Date.now();
      else if (event.key === "?" || (event.shiftKey && event.code === "Slash")) setMode("help");
      else if (key === "c" && !readOnly) navigate("/monitors?create=1");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, readOnly]);

  useEffect(() => {
    if (mode !== "palette") return;
    setQuery("");
    setSelected(0);
    input.current?.focus();
    listMonitors().then(setMonitors).catch(() => setMonitors([]));
  }, [mode]);

  const items = useMemo(() => {
    const close = (action: () => void) => () => {
      setMode("closed");
      action();
    };
    const all: Item[] = [
      { id: "go-overview", group: "Go to", label: "Overview", keys: ["G", "O"], icon: <Gauge size={16} />, run: close(() => navigate("/")) },
      { id: "go-monitors", group: "Go to", label: "Monitors", keys: ["G", "M"], icon: <LayoutList size={16} />, run: close(() => navigate("/monitors")) },
      { id: "go-pipeline", group: "Go to", label: "Pipeline", keys: ["G", "P"], icon: <Workflow size={16} />, run: close(() => navigate("/pipeline")) },
      ...monitors.map((monitor): Item => {
        const state = monitorState(monitor);
        return {
          id: `monitor-${monitor.id}`,
          group: "Monitors",
          label: monitor.name,
          hint: `${compactUrl(monitor.targetUrl)} · ${state.label}`,
          icon: <StatusDot tone={state.tone} />,
          run: close(() => navigate(`/monitors/${monitor.id}`)),
        };
      }),
      { id: "tour", group: "Actions", label: "Take the tour", hint: "a two-minute walk through the system", icon: <Play size={16} />, run: close(tour.start) },
      { id: "theme", group: "Actions", label: "Toggle light / dark theme", icon: <SunMoon size={16} />, run: close(toggleTheme) },
      ...(readOnly ? [] : [{ id: "create", group: "Actions" as const, label: "Create monitor", keys: ["C"], icon: <Plus size={16} />, run: close(() => navigate("/monitors?create=1")) }]),
      // Asked only when the operator chooses it, never on page load.
      ...(typeof Notification !== "undefined" && Notification.permission === "default" ? [{
        id: "alerts", group: "Actions" as const, label: "Enable desktop alerts", hint: "notify when an incident opens in a background tab",
        icon: <Bell size={16} />, run: close(() => void Notification.requestPermission()),
      }] : []),
      { id: "shortcuts", group: "Actions", label: "Keyboard shortcuts", keys: ["?"], icon: <Keyboard size={16} />, run: () => setMode("help") },
    ];
    return all
      .map((item) => ({ item, score: fuzzyScore(query, `${item.label} ${item.hint ?? ""}`) }))
      .filter((entry): entry is { item: Item; score: number } => entry.score != null)
      .sort((a, b) => (query ? a.score - b.score : 0))
      .map((entry) => entry.item);
  }, [monitors, query, navigate, readOnly]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  if (mode === "closed") return null;

  const close = () => setMode("closed");

  if (mode === "help") {
    return createPortal(
      <div className="dialog-backdrop palette-backdrop" onMouseDown={close} onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
        <section className="palette help" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onMouseDown={(event) => event.stopPropagation()}>
          <header className="palette-head"><Keyboard size={16} aria-hidden="true" /><strong>Keyboard shortcuts</strong></header>
          <dl className="shortcut-list">
            {SHORTCUTS.map((shortcut) => (
              <div key={shortcut.label}><dt>{shortcut.label}</dt><dd><Keys keys={shortcut.keys} /></dd></div>
            ))}
          </dl>
          <footer className="palette-foot"><span><kbd>esc</kbd> close</span></footer>
          <button type="button" className="sr-only" autoFocus onClick={close}>Close</button>
        </section>
      </div>,
      document.body,
    );
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") close();
    else if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelected((index) => Math.min(items.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      items[selected]?.run();
    }
  }

  let lastGroup = "";
  return createPortal(
    <div className="dialog-backdrop palette-backdrop" onMouseDown={close}>
      <section className="palette" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(event) => event.stopPropagation()}>
        <label className="palette-search">
          <Search size={16} aria-hidden="true" />
          <input
            ref={input}
            value={query}
            onChange={(event) => { setQuery(event.target.value); setSelected(0); }}
            onKeyDown={onKeyDown}
            placeholder="Jump to a page or monitor…"
            aria-label="Search commands"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items[selected] ? `palette-${items[selected].id}` : undefined}
          />
          <kbd>esc</kbd>
        </label>
        <ul className="palette-list" id="palette-list" role="listbox" ref={list}>
          {items.length === 0 && <li className="palette-empty">Nothing matches “{query}”.</li>}
          {items.map((item, index) => {
            const heading = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <li key={item.id} role="presentation">
                {heading && <p className="palette-group" role="presentation">{heading}</p>}
                <div
                  id={`palette-${item.id}`}
                  role="option"
                  aria-selected={index === selected}
                  data-index={index}
                  className="palette-item"
                  onMouseMove={() => setSelected(index)}
                  onClick={item.run}
                >
                  <span className="palette-icon" aria-hidden="true">{item.icon}</span>
                  <span className="palette-label">{item.label}{item.hint && <small>{item.hint}</small>}</span>
                  {item.keys ? <Keys keys={item.keys} /> : <ArrowUpRight size={14} className="palette-go" aria-hidden="true" />}
                </div>
              </li>
            );
          })}
        </ul>
        <footer className="palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
          <span><kbd><CornerDownLeft size={10} /></kbd> open</span>
          <span className="palette-brand"><Command size={11} aria-hidden="true" /> RCP</span>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

/** The sidebar entry point, so the palette is discoverable without knowing the shortcut. */
export function PaletteButton() {
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <button
      type="button"
      className="palette-trigger"
      data-tour="palette"
      onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: !mac }))}
    >
      <Search size={14} aria-hidden="true" />
      <span>Search</span>
      <Keys keys={[mac ? "⌘" : "Ctrl", "K"]} />
    </button>
  );
}
