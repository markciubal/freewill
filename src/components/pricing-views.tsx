import { CATEGORY_LABEL, SURVIVAL } from "@/lib/covenant";
import { HIGH_ASK_FACTOR, PULSE_MINIMUM_ANSWERS, fmtTimes, type AskSignal, type CategoryPulse } from "@/lib/pricing";
import type { Category } from "@prisma/client";
import { Grace } from "./ui";

// The two places the community's own numbers are shown back to it. Both take
// plain data, so they can be rendered and checked without a database.

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

// The public note on a survival offer asking well above the usual. It states
// the fact, offers the innocent explanations first, and says that nobody set
// the price it is being compared to. A signal for a conversation, never a block.
export function HighAskNote({ signal, category }: { signal: AskSignal; category: Category }) {
  return (
    <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm">
      This asks about {fmtTimes(signal.timesUsual)} times what {CATEGORY_LABEL[category].toLowerCase()} has recently settled for near you (<Grace n={signal.usual} />, the middle of{" "}
      {signal.exchanges} exchanges). There can be good reasons: it may be harder to get now, or a better kind. Ask before you decide. Nobody sets prices here; this note appears on any
      survival offer more than {HIGH_ASK_FACTOR} times the usual.
    </p>
  );
}

// How much better off people said each kind of exchange left them, beside
// what that kind usually settles for. Read together, the two columns are the
// water-diamond paradox in the community's own numbers.
export function PulseByCategory({ rows }: { rows: CategoryPulse[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-4">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Where trade helps most</div>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="p-2 font-medium">Kind of exchange</th>
              <th className="p-2 font-medium">How much better off people said they were</th>
              <th className="p-2 text-right font-medium">Usually settles for</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.category} className="border-t border-border">
                <td className="p-2">
                  {CATEGORY_LABEL[row.category]}
                  {SURVIVAL.includes(row.category) && <span className="ml-1 text-xs text-danger">survival</span>}
                </td>
                <td className="p-2">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-28 overflow-hidden rounded-full bg-border/60" aria-hidden="true">
                      <div className={`h-full ${row.average >= 0 ? "bg-accent" : "bg-danger"}`} style={{ width: `${Math.round((Math.abs(row.average) / 2) * 100)}%` }} />
                    </div>
                    <span className="tabular-nums">{signed(Number(row.average.toFixed(1)))}</span>
                    <span className="text-xs text-muted">from {row.answers}</span>
                  </div>
                </td>
                <td className="p-2 text-right tabular-nums">
                  {row.usualGrace ? <Grace n={row.usualGrace.median} /> : <span className="text-xs text-muted">gift, Hours or barter</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        The scale runs from -2 (much worse off) to +2 (much better off). Price and help are different things: what costs the least is often what people say helped the most. A kind
        of exchange appears here only once {PULSE_MINIMUM_ANSWERS} people have answered, so nobody&apos;s own answer can be read from it.
      </p>
    </div>
  );
}
