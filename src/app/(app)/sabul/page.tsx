import { Badge, Card, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { critique } from "@/lib/sabul";

const TONE = { ok: "accent", watch: "warn", warn: "danger" } as const;
const LABEL = { ok: "sound", watch: "watch", warn: "strained" } as const;

export default async function SabulPage() {
  await requireUser();
  const { findings, members } = await critique();
  const strained = findings.filter((f) => f.severity !== "ok").length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageTitle
        title="The critic"
        subtitle="Sabul, from The Dispossessed, was the man who accreted power in a society that had abolished it — by controlling channels and taking credit for others' work. Here he is put to use: he reads the live data and asks where power could still creep in. Nothing here is a verdict; it is a mirror held up to the community's own ideals."
      />
      <p className="text-sm text-muted">
        {strained === 0 ? `Across ${members} members, Sabul finds nowhere to get a grip.` : `${strained} of ${findings.length} places are worth watching, across ${members} members.`}
      </p>

      <div className="space-y-3">
        {findings.map((f) => (
          <Card key={f.id} className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{f.title}</span>
              <Badge tone={TONE[f.severity]}>{LABEL[f.severity]}</Badge>
            </div>
            <p className="text-sm text-muted">{f.detail}</p>
            <p className="border-l-2 border-border pl-3 text-sm italic text-muted">&ldquo;{f.sabul}&rdquo;</p>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted">
        A society is stateless only as long as no one quietly becomes the state. This page exists so that creeping can be seen early — the standing that gates only credit, the demurrage that melts hoards, the lottery that spreads the seats, and the signatures that make trust unforgeable are the rails; this is the inspection light.
      </p>
    </div>
  );
}
