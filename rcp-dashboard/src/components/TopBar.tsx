import { useEffect, useState } from "react";
import { Gauge, LayoutList, Workflow, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { useNow } from "../useLiveData";
import { crumbs } from "../crumbs";
import { LiveLed } from "./StatusBadge";

/** The same icons as the nav items, so the current crumb reads as "you are here". */
const PAGE_ICONS: Record<string, LucideIcon> = { "": Gauge, monitors: LayoutList, pipeline: Workflow };

/**
 * A slim translucent bar over the scrolling page: the path on the left, and a clock that says the console is
 * live on the right. The edge under it fades in only once content has scrolled beneath.
 */
export function TopBar({ pathname, updatedAt, stale }: { pathname: string; updatedAt: number | null; stale: boolean }) {
  const now = useNow();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const trail = crumbs(pathname).slice(1); // the title only: the app name is already in the sidebar
  const PageIcon = PAGE_ICONS[pathname.split("/").filter(Boolean)[0] ?? ""];
  const clock = new Date(now).toISOString().slice(11, 19);

  return (
    <div className={`topbar${scrolled ? " scrolled" : ""}`}>
      <nav className="topbar-path" aria-label="Location">
        {trail.map((crumb, index) => (
          <span key={index} className="topbar-crumb">
            {index > 0 && <span className="topbar-sep" aria-hidden="true">/</span>}
            {index === 0 && PageIcon && <PageIcon size={14} aria-hidden="true" />}
            {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : <span aria-current={index === trail.length - 1 ? "page" : undefined}>{crumb.label}</span>}
          </span>
        ))}
      </nav>
      <span className={`topbar-clock${stale ? " stale" : ""}`} role="timer" aria-label={stale ? "Data is stale" : "Live"}>
        <LiveLed updatedAt={stale ? null : updatedAt} tone={stale ? "warn" : "good"} />
        {stale ? "Stale" : "Live"} · <time dateTime={new Date(now).toISOString()}>{clock}</time> UTC
      </span>
    </div>
  );
}
