import { BotProtectionHint } from "./BotProtectionHint";
import { formatStatusCodes } from "../statusCodes";
import { ArrowRight } from "lucide-react";
import { BlockMeter } from "./BlockMeter";
import { milliseconds, outcomeLabel, outcomeTone, relativeTime, type Tone } from "../format";
import type { RecentCheck, Verdict } from "../types";

/** Where the demo's probe regions are; other region names show their code only. */
const PLACES: Record<string, string> = { "eu-west-1": "Ireland", "us-east-1": "N. Virginia" };

const NODE_HEIGHT = 56;
const NODE_GAP = -1; // region nodes share one hairline
const LINK_WIDTH = 56;
const METER_CELLS = 10;

const VERDICT_TONE: Record<Verdict, Tone> = { UP: "good", DOWN: "fault", DISAGREEMENT: "warn", NO_DATA: "muted" };
const VERDICT_WORD: Record<Verdict, string> = { UP: "UP", DOWN: "DOWN", DISAGREEMENT: "DISAGREED", NO_DATA: "NO DATA" };

/**
 * Explains a verdict the backend already reached; it never re-derives one. A verdict of UP or DOWN means every
 * region agreed by definition, so the sentence only has to say how many regions that was.
 */
function verdictSentence(verdict: Verdict, regions: number): string {
  const all = regions === 2 ? "Both regions" : `All ${regions} regions`;
  switch (verdict) {
    case "UP": return `${all} agreed it was up.`;
    case "DOWN": return `${all} agreed it was down.`;
    case "DISAGREEMENT": return "The regions disagreed, so it counts as neither up nor down.";
    case "NO_DATA": return "Not every region answered in time, so it proves nothing.";
  }
}

/**
 * One check fanned out the way the system runs it: the control plane sends a job to every region, each region
 * reports what it saw, and the verdict needs them to agree. The connectors redraw whenever a new check arrives.
 */
export function CheckFanout({ check, timeoutMs, intervalLabel, now, onTrace }: {
  check: RecentCheck;
  timeoutMs: number;
  intervalLabel: string;
  now: number;
  onTrace: () => void;
}) {
  const results = check.results;
  const n = Math.max(results.length, 1);
  const height = n * NODE_HEIGHT + (n - 1) * NODE_GAP;
  const mid = height / 2;
  const center = (i: number) => i * (NODE_HEIGHT + NODE_GAP) + NODE_HEIGHT / 2;
  const tone = VERDICT_TONE[check.verdict];
  const scheduledClock = `${new Date(check.scheduledAt).toISOString().slice(11, 19)} UTC`;
  const timeoutLabel = timeoutMs % 1000 === 0 ? `${timeoutMs / 1000} s` : milliseconds(timeoutMs);
  const curve = (from: number, to: number) => `M0 ${from} C ${LINK_WIDTH / 2} ${from}, ${LINK_WIDTH / 2} ${to}, ${LINK_WIDTH} ${to}`;

  return (
    <section className="panel fanout-panel" aria-labelledby="fanout-title">
      <header className="panel-header">
        <h2 id="fanout-title">Latest check</h2>
        <span className="subtle">
          {relativeTime(check.scheduledAt, now)}
          <button type="button" className="text-button" onClick={onTrace}>Trace <ArrowRight size={14} aria-hidden="true" /></button>
        </span>
      </header>
      <div className="fanout" style={{ ["--fanout-height" as string]: `${height}px` }}>
        <div className="fanout-node fanout-source">
          <span className="fanout-label">Control plane</span>
          <strong className="fanout-time mono">{scheduledClock}</strong>
          <span className="fanout-meta mono">{check.executionId.slice(0, 8)} · every {intervalLabel}</span>
        </div>

        <svg key={`in-${check.executionId}`} className="fanout-links" width={LINK_WIDTH} height={height} aria-hidden="true">
          {results.map((result, i) => (
            <path key={result.region} d={curve(mid, center(i))} pathLength={1} className="fanout-link" />
          ))}
        </svg>

        <ol className="fanout-regions" aria-label="What each region saw">
          {results.map((result) => {
            const resultTone = outcomeTone(result.outcome, result.httpStatus, check.acceptedHttpStatuses);
            const share = Math.min(1, result.latencyMs / Math.max(timeoutMs, 1));
            const meterTone = resultTone === "fault" ? "fault" : resultTone === "muted" ? "muted" : share > 0.5 ? "warn" : "good";
            return (
              <li key={result.region} className={`fanout-node fanout-region ${resultTone}`}>
                <div className="fanout-region-top">
                  <span className="fanout-region-name">
                    <span className="mono">{result.region}</span>
                    {PLACES[result.region] && <span className="subtle">{PLACES[result.region]}</span>}
                  </span>
                  <span className={`fanout-status mono ${resultTone}`}>
                    {result.outcome === "HTTP_RESPONSE" ? `HTTP ${outcomeLabel(result.outcome, result.httpStatus)}` : outcomeLabel(result.outcome, result.httpStatus)}
                  </span>
                </div>
                <div className="fanout-region-bottom">
                  <span className="fanout-latency"><b>{Math.round(result.latencyMs)}</b><span className="mono"> ms</span></span>
                  <BlockMeter
                    key={check.executionId}
                    className="fanout-bar"
                    blocks={METER_CELLS}
                    value={share}
                    tone={meterTone}
                    label={`${milliseconds(result.latencyMs)} of the ${milliseconds(timeoutMs)} timeout`}
                  />
                  <span className="fanout-of mono">of {timeoutLabel}</span>
                </div>
              </li>
            );
          })}
        </ol>

        <svg key={`out-${check.executionId}`} className="fanout-links out" width={LINK_WIDTH} height={height} aria-hidden="true">
          {results.map((result, i) => (
            <path key={result.region} d={curve(center(i), mid)} pathLength={1} className={`fanout-link ${outcomeTone(result.outcome, result.httpStatus, check.acceptedHttpStatuses)}`} />
          ))}
        </svg>

        <div className={`fanout-node fanout-verdict lit ${tone}`}>
          <span className="fanout-label">Verdict</span>
          <strong className="fanout-verdict-word">{VERDICT_WORD[check.verdict]}</strong>
          <span className="fanout-sentence">{verdictSentence(check.verdict, results.length)}</span>
        </div>
      </div>
      {check.acceptedHttpStatuses && <p className="trace-note">Accepted statuses for this check: {formatStatusCodes(check.acceptedHttpStatuses)}.</p>}
      <BotProtectionHint results={results} />
    </section>
  );
}
