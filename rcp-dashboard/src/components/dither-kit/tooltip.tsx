"use client"

import { AnimatePresence, motion } from "motion/react"
import { type ReactNode, useState } from "react"
import { useCommonChart } from "./common-context"
import { cn } from "./lib"
import { rgb } from "./palette"

export type TooltipVariant = "default" | "frosted-glass"

const VARIANT: Record<TooltipVariant, string> = {
  default: "bg-popover",
  "frosted-glass": "bg-popover/70 backdrop-blur-sm",
}

/**
 * Floating hover tooltip. Reads the shared common context so it works in every
 * chart family. It glides between points and fades in/out (instead of snapping),
 * and dims unselected series/slices.
 */
export function Tooltip({
  labelKey,
  valueFormatter,
  variant = "default",
  footer,
}: {
  labelKey?: string
  valueFormatter?: (value: number, name: string) => string
  variant?: TooltipVariant
  /** RCP change: extra content under the series rows for the hovered index (null for none). */
  footer?: (index: number) => ReactNode
}) {
  const chart = useCommonChart()
  const show = chart.ready && chart.hoverIndex != null

  // Retain the last hovered index so the card keeps its content while fading
  // out — adjust-state-during-render (no refs in render).
  const [lastIndex, setLastIndex] = useState(0)
  if (chart.hoverIndex != null && chart.hoverIndex !== lastIndex) {
    setLastIndex(chart.hoverIndex)
  }
  const index = chart.hoverIndex ?? lastIndex

  const heading = chart.heading(index, labelKey)
  const items = chart.itemsAt(index)

  return (
    <AnimatePresence>
      {show && items.length > 0 && (
        <motion.div
          key="dither-tooltip"
          initial={{
            opacity: 0,
            x: "-50%",
            y: "-115%",
            top: chart.tooltipTop,
            left: chart.tooltipLeft,
          }}
          animate={{
            opacity: 1,
            x: "-50%",
            y: "-115%",
            top: chart.tooltipTop,
            left: chart.tooltipLeft,
          }}
          exit={{ opacity: 0 }}
          transition={{
            type: "spring",
            stiffness: 520,
            damping: 38,
            mass: 0.6,
          }}
          className={cn(
            // RCP change: w-max + nowrap. An absolutely placed card shrinks to the space right of its `left`, which
            // wrapped values such as "p95 3.90 s" onto two lines near the right edge of the plot.
            "pointer-events-none absolute z-10 w-max rounded-md border px-2 py-1 shadow-sm whitespace-nowrap",
            VARIANT[variant]
          )}
        >
          {heading && (
            <div className="mb-0.5 font-mono text-[10px] text-muted-foreground">
              {heading}
            </div>
          )}
          {/* RCP change: one grid so every row shares the swatch, label and value columns, and nothing wraps. */}
          <div className="grid grid-cols-[auto_auto_1fr] items-center gap-x-1.5 gap-y-0.5 font-mono text-[11px] text-popover-foreground tabular-nums whitespace-nowrap">
            {items.map((item) => {
              const opacity = item.dimmed ? 0.4 : 1
              return (
                <div key={item.name} className="contents">
                  <span
                    className="size-2 rounded-[1px]"
                    style={{ backgroundColor: rgb(item.seed.fill), opacity }}
                  />
                  <span className="text-muted-foreground" style={{ opacity }}>
                    {item.label}
                  </span>
                  <span
                    className="justify-self-end pl-2 text-right text-foreground"
                    style={{ opacity }}
                  >
                    {valueFormatter
                      ? valueFormatter(item.value, item.name)
                      : item.value.toLocaleString()}
                  </span>
                </div>
              )
            })}
            {footer?.(index)}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

Tooltip.chartLayer = "dom" as const
