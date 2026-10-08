import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useNow } from "../useLiveData";
import { crumbs } from "../crumbs";
import { LiveLed } from "./StatusBadge";

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

  const trail = crumbs(pathname);
  const clock = new Date(now).toISOString().slice(11, 19);

  return (
    <div className={`topbar${scrolled ? " scrolled" : ""}`}>
      <nav className="topbar-path" aria-label="Location">
        {trail.map((crumb, index) => (
          <span key={index} className="topbar-crumb">
            {index > 0 && <span className="topbar-sep" aria-hidden="true">/</span>}
            {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : <span aria-current={index === trail.length - 1 ? "page" : undefined}>{crumb.label}</span>}
          </span>
        ))}
      </nav>
      <span className={`topbar-clock${stale ? " stale" : ""}`} role="timer" aria-label={stale ? "Data is stale" : "Live"}>
        <LiveLed updatedAt={stale ? null : updatedAt} tone={stale ? "warn" : "good"} />
        {stale ? "stale" : "live"} · <time dateTime={new Date(now).toISOString()}>{clock}</time> utc
      </span>
    </div>
  );
}
