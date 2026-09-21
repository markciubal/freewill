import Link from "next/link";
import { Badge, Card, PageTitle, SectionTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { MANIFEST } from "@/lib/manifest";
import { loadLiveState, type LiveValue } from "@/lib/manifest.live";
import type { Check, Source } from "@/lib/manifest.schema";

// What this is, what it refuses to be, what it cannot do, who wrote it, and
// where every idea came from. The shape is enforced by manifest.schema.ts:
// nothing on this page can claim a capability without stating a limit, and
// no answer can be given without saying where it stops being true.

export const metadata = { title: "About Freewill" };

const STATUS_TONE = { live: "accent", partial: "warn", planned: "neutral" } as const;

function CheckLink({ check }: { check: Check }) {
  const label = check.kind === "script" ? `npm run ${check.ref}` : check.ref;
  const body = (
    <>
      <span className="font-mono text-xs">{label}</span> <span className="text-muted">{check.what}</span>
    </>
  );
  if (check.kind === "page") {
    return (
      <li>
        <Link href={check.ref} className="font-mono text-xs text-accent hover:underline">
          {check.ref}
        </Link>{" "}
        <span className="text-muted">{check.what}</span>
      </li>
    );
  }
  return <li>{body}</li>;
}

function SourceLine({ source }: { source: Source }) {
  const title = source.url ? (
    <a href={source.url} className="text-accent hover:underline" rel="noreferrer noopener" target="_blank">
      {source.title}
    </a>
  ) : (
    <span className="font-medium">{source.title}</span>
  );
  return (
    <li className="text-sm">
      {title}
      {source.author && <span className="text-muted"> — {source.author}</span>}
      {source.year && <span className="text-muted"> ({source.year})</span>}
      <div className="text-xs text-muted">{source.informs}</div>
    </li>
  );
}

function LiveFigures({ values }: { values: LiveValue[] }) {
  if (!values.length) return null;
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {values.map((figure) => (
        <div key={figure.label} className="rounded-md border border-border bg-background px-3 py-2">
          <div className="text-xs uppercase tracking-wider text-muted">{figure.label}</div>
          <div className="font-medium tabular-nums">{figure.value}</div>
          {figure.note && <div className="mt-0.5 text-xs text-muted">{figure.note}</div>}
        </div>
      ))}
    </div>
  );
}

export default async function AboutPage() {
  await requireUser();
  const manifest = MANIFEST;
  const questionFigures = await Promise.all(manifest.questions.map((question) => loadLiveState(question.liveState)));

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageTitle title={`About ${manifest.name}`} subtitle={manifest.tagline} />

      <Card className="space-y-3">
        <SectionTitle>Why this exists</SectionTitle>
        <p className="text-sm leading-relaxed">{manifest.mission}</p>
        <div className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-warn">What this is not</div>
          <p className="mt-1 text-sm">{manifest.notThis}</p>
        </div>
      </Card>

      <section>
        <SectionTitle>What we hold ourselves to</SectionTitle>
        <p className="mb-3 text-sm text-muted">
          Each principle says what would show it had been abandoned, so it can be held against us rather than admired.
        </p>
        <div className="space-y-3">
          {manifest.principles.map((principle) => (
            <Card key={principle.key} className="space-y-2">
              <div className="font-medium">{principle.statement}</div>
              <p className="text-sm text-muted">{principle.because}</p>
              <p className="text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-danger">Broken if</span>{" "}
                <span className="text-muted">{principle.brokenIf}</span>
              </p>
              <ul className="space-y-0.5 text-xs">{principle.enforcedBy.map((check) => <CheckLink key={check.ref} check={check} />)}</ul>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>What it does, and what it does not</SectionTitle>
        <p className="mb-3 text-sm text-muted">
          The limits are part of the claim. Nothing can be listed here without them.
        </p>
        <div className="space-y-3">
          {manifest.capabilities.map((capability) => (
            <Card key={capability.key} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {capability.route ? (
                  <Link href={capability.route} className="font-medium text-accent hover:underline">
                    {capability.name}
                  </Link>
                ) : (
                  <span className="font-medium">{capability.name}</span>
                )}
                <Badge tone={STATUS_TONE[capability.status]}>{capability.status}</Badge>
              </div>
              <p className="text-sm text-muted">{capability.does}</p>
              <div className="rounded-md border border-border bg-background px-3 py-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted">What it does not do</div>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">
                  {capability.doesNot.map((limit) => (
                    <li key={limit}>{limit}</li>
                  ))}
                </ul>
              </div>
              <ul className="space-y-0.5 text-xs">{capability.verifiedBy.map((check) => <CheckLink key={check.ref} check={check} />)}</ul>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>Questions</SectionTitle>
        <div className="space-y-3">
          {manifest.questions.map((question, index) => (
            <Card key={question.key} className="space-y-2">
              <div className="font-medium">{question.question}</div>
              <p className="text-sm text-muted">{question.answer}</p>
              <LiveFigures values={questionFigures[index]} />
              <div className="rounded-md border border-border bg-background px-3 py-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted">Where this answer stops</div>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">
                  {question.limits.map((limit) => (
                    <li key={limit}>{limit}</li>
                  ))}
                </ul>
              </div>
              {question.seeAlso.length > 0 && <ul className="space-y-0.5 text-xs">{question.seeAlso.map((check) => <CheckLink key={check.ref} check={check} />)}</ul>}
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>How this was built</SectionTitle>
        <Card className="space-y-3 text-sm">
          <p className="text-muted">{manifest.provenance.summary}</p>
          <div className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-accent">Who wrote the code</div>
            <p className="mt-1">{manifest.provenance.authorship}</p>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted">What has been reviewed</div>
            <p className="mt-1 text-muted">{manifest.provenance.reviewed}</p>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted">What is tested</div>
            <p className="mt-1 text-muted">{manifest.provenance.testing}</p>
          </div>
          <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-danger">Before you rely on this</div>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {manifest.provenance.cautions.map((caution) => (
                <li key={caution}>{caution}</li>
              ))}
            </ul>
          </div>
        </Card>
      </section>

      <section>
        <SectionTitle>Where the ideas came from</SectionTitle>
        <Card>
          <ul className="space-y-3">
            {manifest.sources.map((source) => (
              <SourceLine key={source.title} source={source} />
            ))}
          </ul>
        </Card>
      </section>

      <p className="text-xs text-muted">
        This page is generated from a single typed description of the software (<span className="font-mono">src/lib/manifest.ts</span>), whose schema refuses any
        capability without a stated limitation and any answer without its limits. The same description is served as JSON at{" "}
        <Link href="/api/about" className="text-accent hover:underline">
          /api/about
        </Link>{" "}
        so another community, a researcher, or a machine can read these claims and go check them.
      </p>
    </div>
  );
}
