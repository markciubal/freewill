import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Button, Card, Notice, PageTitle, SectionTitle, Select, fmtDateTime } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isObjectId } from "@/lib/form";
import { nominationsAreOpen, quorumFor } from "@/lib/commons";
import { eligibleVoterIds, settleCommonsDecisions } from "@/lib/commons.data";
import { tallyIRV } from "@/lib/rcv";
import { getStanding } from "@/lib/standing.all";
import { standAsSteward } from "../../commons/actions";
import { castBallot } from "../actions";

export default async function ProposalPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  if (!isObjectId(id)) notFound();
  // A question about a shared thing is carried out by the software when voting
  // closes, the first time anyone looks. There is nobody else to do it.
  await settleCommonsDecisions();
  const p = await db.proposal.findUnique({ where: { id }, include: { author: { select: { username: true } }, ballots: true, commons: { select: { id: true, name: true, stewardId: true } } } });
  if (!p) notFound();
  const standing = await getStanding(me.id);
  const open = p.closesAt > new Date();
  const mine = p.ballots.find((b) => b.userId === me.id);
  const commonsVoters = p.commons ? await eligibleVoterIds(p.commons, p.createdAt) : null;
  const canVote = open && (commonsVoters ? commonsVoters.has(me.id) : p.locality === me.locality && standing.verified);
  const nominationsOpen = open && p.commonsAction === "STEWARD" && nominationsAreOpen(p.createdAt);
  const canStand = nominationsOpen && !!commonsVoters?.has(me.id) && !p.candidateIds.includes(me.id);
  const tally = open ? null : tallyIRV(p.options.length, p.ballots.map((b) => b.ranking));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageTitle
        title={p.title}
        subtitle={`Put by @${p.author.username} to ${p.locality}. ${open ? "Closes" : "Closed"} ${fmtDateTime(p.closesAt)}. ${p.ballots.length} ballot${p.ballots.length === 1 ? "" : "s"}.`}
        action={<Link href="/assemblies" className="text-sm text-accent hover:underline">All questions</Link>}
      />
      <Notice error={sp.error} ok={sp.ok} />
      {p.commons && commonsVoters && (
        <Card className="space-y-2 border-accent/40">
          <p className="text-sm">
            This is about <Link href={`/commons/${p.commons.id}`} className="font-medium text-accent hover:underline">{p.commons.name}</Link>, so the people who use it decide:{" "}
            {commonsVoters.size} verified {commonsVoters.size === 1 ? "person who was" : "people who were"} using it when this was asked. It needs {quorumFor(commonsVoters.size)} ballot{quorumFor(commonsVoters.size) === 1 ? "" : "s"}. Whatever they
            decide is carried out when voting closes; nobody has to approve it.
          </p>
          {p.appliedAt && <p className="text-sm font-medium">{p.appliedNote}</p>}
          {canStand && (
            <form action={standAsSteward.bind(null, p.id)}>
              <Button type="submit" variant="ghost">Put myself forward to tend it</Button>
            </form>
          )}
          {nominationsOpen && !canStand && p.candidateIds.includes(me.id) && <p className="text-xs text-muted">You are on the list.</p>}
        </Card>
      )}
      <Card>
        <Badge tone={open ? "accent" : "neutral"}>{open ? "open" : "closed"}</Badge>
        <p className="mt-3 whitespace-pre-wrap text-sm">{p.body}</p>
      </Card>

      {open && (
        <Card>
          <SectionTitle>{mine ? "Your ballot (you can change it)" : "Your ballot"}</SectionTitle>
          {!canVote ? (
            <p className="text-sm text-muted">
              {p.commons
                ? "Only verified people who were already using it when this was asked vote on it. That keeps anyone from joining the record just to swing the result."
                : p.locality !== me.locality ? `Only people in ${p.locality} vote on this.` : `Only verified people vote. You need ${standing.requiredVouches} vouch${standing.requiredVouches === 1 ? "" : "es"} from people in ${me.locality}.`}
            </p>
          ) : (
            <form action={castBallot.bind(null, p.id)} className="space-y-3">
              <p className="text-sm text-muted">Give your first choice rank 1, your second rank 2, and so on. Leave an option blank if you could not accept it at all.</p>
              {p.options.map((opt, i) => {
                const current = mine ? mine.ranking.indexOf(i) : -1;
                return (
                  <label key={i} className="flex items-center gap-3 text-sm">
                    <span className="w-16 shrink-0">
                      <Select name={`rank_${i}`} defaultValue={current >= 0 ? String(current + 1) : ""}>
                        <option value="">-</option>
                        {p.options.map((_, r) => <option key={r} value={r + 1}>{r + 1}</option>)}
                      </Select>
                    </span>
                    <span>{opt}</span>
                  </label>
                );
              })}
              <SubmitButton pendingText="Recording...">{mine ? "Update ballot" : "Cast ballot"}</SubmitButton>
            </form>
          )}
        </Card>
      )}

      {!open && tally && (
        <Card className="space-y-3">
          <SectionTitle>Result</SectionTitle>
          {tally.winner === null ? (
            <p className="text-sm">No option reached a majority.</p>
          ) : (
            <p className="text-sm"><span className="font-medium">{p.options[tally.winner]}</span> won after {tally.rounds.length} round{tally.rounds.length === 1 ? "" : "s"}. {tally.exhausted > 0 && `${tally.exhausted} ballot${tally.exhausted === 1 ? "" : "s"} ran out of ranked options.`}</p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted">
                <tr><th className="p-2">Option</th>{tally.rounds.map((_, r) => <th key={r} className="p-2 text-right">Round {r + 1}</th>)}</tr>
              </thead>
              <tbody>
                {p.options.map((opt, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="p-2">{opt}</td>
                    {tally.rounds.map((round, r) => (
                      <td key={r} className={`p-2 text-right tabular-nums ${round.active.includes(i) ? "" : "text-muted"}`}>
                        {round.active.includes(i) ? round.counts[i] : "-"}{round.eliminated === i ? " out" : ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {open && <p className="text-xs text-muted">Results are shown when voting closes, so early ballots do not steer later ones.</p>}
    </div>
  );
}
