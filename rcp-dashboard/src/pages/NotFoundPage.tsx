import { ArrowLeft, Search } from "lucide-react";
import { Link } from "react-router-dom";

/** Unknown console routes land here instead of silently bouncing home, so a stale link is visibly stale. */
export function NotFoundPage() {
  return (
    <section className="lost" aria-labelledby="lost-title">
      <p className="dot-glyph" aria-hidden="true">404</p>
      <h1 id="lost-title">No signal at this address</h1>
      <p>The page may have moved, or the monitor it pointed to was removed.</p>
      <div className="lost-actions">
        <Link className="button secondary" to="/"><ArrowLeft size={14} aria-hidden="true" /> Back to Overview</Link>
        <span className="subtle">or press <kbd>⌘</kbd><kbd>K</kbd> to search <Search size={14} aria-hidden="true" /></span>
      </div>
    </section>
  );
}
