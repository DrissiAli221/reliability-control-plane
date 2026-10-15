import type { ReactNode } from "react";

/**
 * Loading states for the console. Every skeleton reuses the real layout classes (touching modules, the same
 * headers, tiles and rows), with the real titles in place, so the page keeps its height when data arrives.
 * Blocks are neutral and carry one slow shimmer; they are hidden from assistive tech behind a single status note.
 */

type Size = number | string;

/** One neutral block. */
export function Sk({ w, h, className }: { w?: Size; h?: Size; className?: string }) {
  return <span className={className ? `sk ${className}` : "sk"} style={{ width: w, height: h }} aria-hidden="true" />;
}

/** A bar standing in for one line of text: the line box has the real height, the bar is thinner. */
export function SkLine({ w = "60%", line = 18, bar = 10 }: { w?: Size; line?: Size; bar?: Size }) {
  return <span className="sk-line" style={{ height: line }}><Sk w={w} h={bar} /></span>;
}

/** The single announcement for a loading page; the blocks themselves stay silent. */
export function LoadingNote({ label }: { label: string }) {
  return <span className="sr-only" role="status">Loading {label}…</span>;
}

/** Table-like rows: one grid per row, so columns line up with each other. */
export function SkRows({ count, height = 44, columns = "minmax(0, 1fr)", widths }: {
  count: number;
  height?: number;
  columns?: string;
  widths?: Size[];
}) {
  const cells = columns.split(/\s(?![^(]*\))/).length;
  return (
    <div className="sk-rows" aria-hidden="true">
      {Array.from({ length: count }, (_, row) => (
        <div className="sk-row" key={row} style={{ minHeight: height, gridTemplateColumns: columns }}>
          {Array.from({ length: cells }, (_, cell) => <SkLine key={cell} w={widths?.[cell] ?? (cell === 0 ? "55%" : "70%")} />)}
        </div>
      ))}
    </div>
  );
}

/** A panel with its real title and a skeleton body of the given height (or custom children). */
export function SkPanel({ title, sub, height = 120, tour, children }: {
  title: string;
  sub?: string;
  height?: number;
  tour?: string;
  children?: ReactNode;
}) {
  return (
    <section className="panel" aria-busy="true" data-tour={tour}>
      <header className="panel-header">
        <h2>{title}</h2>
        {sub && <span className="subtle">{sub}</span>}
      </header>
      {children ?? <div className="panel-body"><Sk h={height} className="fill" /></div>}
    </section>
  );
}

/** Metric tiles: a label line, the big number, and optionally the visual and hint rows. */
export function SkTiles({ count = 4, visual = false, className }: { count?: number; visual?: boolean; className?: string }) {
  return (
    <section className={`metric-grid${className ? ` ${className}` : ""}`} aria-busy="true">
      {Array.from({ length: count }, (_, index) => (
        <div className="metric" key={index}>
          <SkLine w={72} line={20} bar={9} />
          <SkLine w={92} line={30} bar={22} />
          {visual && <SkLine w="100%" line={22} bar={12} />}
          <SkLine w="70%" line={18} bar={9} />
        </div>
      ))}
    </section>
  );
}

function SkHero() {
  return (
    <section className="hero panel" aria-busy="true">
      <div className="hero-main">
        <div className="hero-readout">
          <SkLine w={150} line={17} bar={9} />
          <Sk w="min(320px, 70vw)" h="clamp(50px, 7.1vw, 80px)" />
          <SkLine w="min(420px, 80vw)" line={20} bar={9} />
        </div>
        <dl className="hero-stats" aria-hidden="true">
          {[0, 1, 2, 3].map((index) => (
            <div key={index}><dt><SkLine w={64} line={17} bar={9} /></dt><dd><SkLine w={44} line={24} bar={20} /></dd></div>
          ))}
        </dl>
      </div>
      <div className="pulse">
        <SkLine w={220} line={18} bar={9} />
        <Sk h={44} className="fill" />
        <SkLine w="100%" line={14} bar={8} />
      </div>
    </section>
  );
}

export function OverviewSkeleton() {
  return (
    <>
      <LoadingNote label="overview" />
      <SkHero />
      <div className="split wide-left">
        <SkPanel title="Incidents" sub="Last 7 days" height={96} />
        <SkPanel title="Regions"><SkRows count={2} height={96} widths={["40%"]} /></SkPanel>
      </div>
      <div className="split">
        <SkPanel title="Monitors"><SkRows count={4} height={44} columns="minmax(0, 1fr) 90px 64px" widths={["50%", "70%", "80%"]} /></SkPanel>
        <SkPanel title="Live events"><SkRows count={6} height={24} /></SkPanel>
      </div>
    </>
  );
}

export function PipelineSkeleton() {
  return (
    <>
      <LoadingNote label="pipeline" />
      <SkPanel title="Stages" sub="Throughput over the last 5 min" height={240} tour="stages" />
      <div className="split balanced">
        <SkPanel title="Time to decision"><SkRows count={5} height={36} columns="minmax(0, 1fr) 80px 64px" /></SkPanel>
        <SkPanel title="Live events"><SkRows count={6} height={24} /></SkPanel>
      </div>
    </>
  );
}

export function MonitorDetailSkeleton() {
  return (
    <>
      <LoadingNote label="monitor" />
      <header className="page-header detail-header" aria-hidden="true">
        <div>
          <div className="title-row"><Sk w={8} h={8} /><Sk w={220} h={24} /></div>
          <div className="meta-row"><SkLine w={260} line={20} bar={10} /></div>
        </div>
        <div className="page-actions"><Sk w={32} h={32} /><Sk w={92} h={32} /><Sk w={150} h={32} /></div>
      </header>
      <SkTiles visual />
      <SkPanel title="Availability" sub="Last 90 days · UTC">
        <div className="panel-body"><Sk h={32} className="fill" /><SkLine w="100%" line={20} bar={8} /></div>
      </SkPanel>
      <SkPanel title="Latency" height={260} />
      <SkPanel title="Decisions" height={160} />
      <div className="split">
        <SkPanel title="Regions"><SkRows count={2} height={43} columns="minmax(0, 1fr) 1.4fr 64px 64px" /></SkPanel>
        <SkPanel title="Evidence" height={80} />
      </div>
    </>
  );
}

/** Inside the trace drawer while a check's spans load. */
export function TraceSkeleton() {
  return (
    <div className="trace" aria-busy="true">
      <LoadingNote label="trace" />
      <div className="trace-head"><SkLine w={240} line={28} bar={14} /></div>
      <SkRows count={6} height={26} columns="132px minmax(0, 1fr)" widths={[84, "55%"]} />
    </div>
  );
}
