import Link from "next/link";
import { Badge, Button, Card, Empty, Field, Input, Notice, PageTitle, SectionTitle, fmtDateTime } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { nodePublicKey, peerRecordCounts, peerTrustAll, trustSentence } from "@/lib/federation";
import { keyFingerprint } from "@/lib/keys";
import { getStanding } from "@/lib/standing.all";
import { addPeer } from "./actions";

function count(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export default async function NodesPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const [peers, trust, records, standing] = await Promise.all([
    db.peer.findMany({ orderBy: { createdAt: "asc" } }),
    peerTrustAll(),
    peerRecordCounts(),
    getStanding(me.id),
  ]);
  const key = nodePublicKey();

  return (
    <div className="space-y-8">
      <PageTitle
        title="Other nodes"
        info="node"
        subtitle="Other communities run their own copy of this app. When enough verified members here trust one, its needs, offers, notices, shared things and seeds show here, marked with its name. Until then nothing it sends is kept, and nothing of ours goes to it."
      />
      <Notice error={sp.error} ok={sp.ok} />
      <div className="grid gap-8 md:grid-cols-[1fr_340px]">
        <section className="space-y-3">
          {peers.length === 0 ? (
            <Empty>No other nodes yet. To connect with one, trade keys with someone who lives there: read them this node&apos;s key, and add theirs here.</Empty>
          ) : (
            <ul className="space-y-2">
              {peers.map((peer) => {
                const t = trust.get(peer.id);
                const c = records.get(peer.id);
                return (
                  <li key={peer.id}>
                    <Card className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/nodes/${peer.id}`} className="font-medium hover:underline">{peer.name}</Link>
                        {t?.trusted ? <Badge tone="accent">trusted</Badge> : <Badge>not trusted yet</Badge>}
                        {peer.historyChangedAt && <Badge tone="warn">ledger history changed</Badge>}
                      </div>
                      <div className="text-xs text-muted">
                        Key <span className="font-mono">{keyFingerprint(peer.publicKey)}</span>
                        {" / "}
                        {peer.url ?? "met by file"}
                      </div>
                      {t && <div className="text-sm">{trustSentence(t.verifiedTrusterIds.length, t.required)}</div>}
                      <div className="text-sm text-muted">
                        {peer.lastIngestAt
                          ? `Last bundle taken in ${fmtDateTime(peer.lastIngestAt)}: ${count(c?.LISTING ?? 0, "need or offer", "needs and offers")}, ${count(c?.BULLETIN ?? 0, "notice", "notices")}, ${count(c?.COMMONS ?? 0, "shared thing", "shared things")}, ${count(c?.SEED ?? 0, "seed variety", "seed varieties")}.`
                          : "Nothing taken in yet."}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="space-y-4">
          <Card className="space-y-2">
            <SectionTitle>This node&apos;s key</SectionTitle>
            <p className="font-mono text-lg">{keyFingerprint(key)}</p>
            <p className="break-all font-mono text-xs text-muted">{key}</p>
            <p className="text-sm text-muted">Read the whole key to someone on the other node, or give it to them on paper. They add it on their own Other nodes page. It is the same key that signs this node&apos;s ledger.</p>
            <a href="/api/federation/bundle" className="inline-block text-sm text-accent hover:underline">Download this node&apos;s bundle</a>
          </Card>

          <Card>
            <SectionTitle>Add a node</SectionTitle>
            {standing.verified ? (
              <form action={addPeer} className="space-y-3">
                <Field label="Name" hint="What people here call it."><Input name="name" required minLength={2} maxLength={60} /></Field>
                <Field label="Node key" hint="All 64 letters and digits, read out or written down by someone who lives there. A key sent in a message you cannot check could be anyone's.">
                  <Input name="publicKey" required minLength={64} className="font-mono text-xs" autoComplete="off" spellCheck={false} />
                </Field>
                <Field label="Address (optional)" hint="Where its server answers, like https://their-node.example. Leave it empty if bundles will only travel by hand.">
                  <Input name="url" type="url" maxLength={300} placeholder="https://" />
                </Field>
                <SubmitButton pendingText="Adding...">Add and trust it</SubmitButton>
              </form>
            ) : (
              <p className="text-sm text-muted">Only verified members can add or trust another node, as only they can vouch.</p>
            )}
          </Card>

          <Card>
            <SectionTitle>Bring a bundle by file</SectionTitle>
            <form action="/api/federation/ingest" method="post" encType="multipart/form-data" className="space-y-3">
              <Field label="Bundle file" hint="A file someone downloaded from a node members here trust. Its signature decides whether it is taken in, not who brings it.">
                <Input name="bundle" type="file" accept="application/json,.json" required />
              </Field>
              <Button type="submit">Take it in</Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
