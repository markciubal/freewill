import Link from "next/link";
import { Badge, Card, PageTitle } from "@/components/ui";
import { TIERS } from "@/lib/covenant";
import { programsByTier } from "@/lib/covenant.programs";

export default function ProgramsPage() {
  return (
    <div className="space-y-10">
      <PageTitle
        title="Programs"
        subtitle="What a society without a state needs, in the order it needs it. Tier 0 keeps people alive and talking. Tier 1 lets them exchange and repair. Tier 2 makes it last."
      />
      {([0, 1, 2] as const).map((t) => (
        <section key={t}>
          <div className="mb-3">
            <h2 className="text-lg font-semibold">Tier {t}: {TIERS[t].name}</h2>
            <p className="text-sm text-muted">{TIERS[t].horizon}. {TIERS[t].goal}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {programsByTier(t).map((p) => (
              <Card key={p.key} className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{p.name}</span>
                  <Badge tone={p.status === "live" ? "accent" : "neutral"}>{p.status}</Badge>
                </div>
                <p className="text-sm">{p.summary}</p>
                <p className="text-sm text-muted">{p.why}</p>
                <ul className="flex flex-wrap gap-1">
                  {p.features.map((f) => <li key={f}><Badge>{f}</Badge></li>)}
                </ul>
                {p.route && p.status === "live" && (
                  <Link href={p.route} className="inline-block text-sm text-accent hover:underline">Open</Link>
                )}
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
