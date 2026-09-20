import { Badge, Card, SectionTitle } from "./ui";
import type { Worked, WorkedValue } from "@/lib/worked";

// Renders a worked explanation: each step as a row with what went in, the
// rule with the real numbers in it, and what came out. Plain enough to redo
// by hand, which is the point.

function show(value: WorkedValue): string {
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}

export function WorkedSteps({ worked, tone = "neutral" }: { worked: Worked; tone?: "neutral" | "accent" | "danger" }) {
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SectionTitle>{worked.title}</SectionTitle>
        <Badge tone={tone}>{show(worked.result)}</Badge>
        <span className="ml-auto font-mono text-xs text-muted">{worked.source}</span>
      </div>
      <ol className="space-y-2">
        {worked.steps.map((step, index) => (
          <li key={index} className="rounded-md border border-border bg-background p-3 text-sm">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-medium">
                {index + 1}. {step.label}
              </span>
              <span className="ml-auto font-mono text-sm">= {show(step.result)}</span>
            </div>
            <div className="mt-1 font-mono text-xs text-muted">{step.rule}</div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
              {Object.entries(step.inputs).map(([name, value]) => (
                <span key={name}>
                  {name}: <span className="font-mono text-foreground">{show(value)}</span>
                </span>
              ))}
            </div>
            {step.why && <p className="mt-1 text-xs text-muted">{step.why}</p>}
          </li>
        ))}
      </ol>
    </Card>
  );
}
