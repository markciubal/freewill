import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Button, Card, Empty, Field, Input, Notice, PageTitle, SectionTitle, Select, Textarea, fmtDate } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { InfoDot } from "@/components/info-dot";
import { requireUser } from "@/lib/auth";
import { DECISION_DAYS, DORMANT_DAYS, ENTRY_HINT, ENTRY_LABEL, STEWARD_SILENT_DAYS, commonsHealth, commonsUsers, daysSince, stewardLastActive, type Entry } from "@/lib/commons";
import { settleCommonsDecisions } from "@/lib/commons.data";
import { CATEGORY_LABEL } from "@/lib/covenant";
import { db } from "@/lib/db";
import { isObjectId } from "@/lib/form";
import { addNote, offerHandover, openSuccession, proposeRules, recordEntry, respondToHandover, toggleCommons } from "../actions";

// One shared thing: what it is, its rules, who tends it, and the record of
// its use. The record is the point. A shared thing is ruined when nobody can
// see it being used up; here anyone who uses it says so, in their own words,
// and everyone who shares it can read that.

export default async function CommonsDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  if (!isObjectId(id)) notFound();

  // Carry out anything its users decided since someone last looked.
  await settleCommonsDecisions(id);

  const commons = await db.commons.findUnique({
    where: { id },
    include: {
      steward: { select: { username: true } },
      entries: { orderBy: { createdAt: "desc" }, take: 200, include: { user: { select: { username: true } } } },
      decisions: { orderBy: { createdAt: "desc" }, take: 10, select: { id: true, title: true, closesAt: true, appliedAt: true, appliedNote: true } },
    },
  });
  if (!commons) notFound();
  const handoverTo = commons.handoverToId ? await db.user.findUnique({ where: { id: commons.handoverToId }, select: { username: true } }) : null;

  const entries = commons.entries as (typeof commons.entries)[number][];
  const health = commonsHealth(commons, entries as Entry[]);
  const users = commonsUsers(entries as Entry[], commons.stewardId);
  const amSteward = commons.stewardId === me.id;
  const amUser = users.has(me.id);
  const openDecision = commons.decisions.find((decision) => !decision.appliedAt);
  const stewardQuietDays = daysSince(stewardLastActive(entries as Entry[], commons.stewardId, commons.createdAt));

  // Notes hang under the entry they are about; everything else is the record.
  const notesByEntry = new Map<string, typeof entries>();
  for (const entry of entries) {
    if (entry.kind !== "NOTE" || !entry.aboutEntryId) continue;
    notesByEntry.set(entry.aboutEntryId, [...(notesByEntry.get(entry.aboutEntryId) ?? []), entry]);
  }
  const record = entries.filter((entry) => entry.kind !== "NOTE");
  const latestWord = record.find((entry) => entry.kind === "TENDED" && entry.note);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageTitle
        title={commons.name}
        subtitle={`${CATEGORY_LABEL[commons.category]}${commons.locality ? `, ${commons.locality}` : ""}. Tended by @${commons.steward.username}. ${users.size} ${users.size === 1 ? "person uses" : "people use"} it.`}
        action={<Link href="/commons" className="text-sm text-accent hover:underline">All shared things</Link>}
      />
      <Notice error={sp.error} ok={sp.ok} />

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={commons.available ? "accent" : "danger"}>{commons.available ? "available" : "unavailable"}</Badge>
          {health.stewardSilent && <Badge tone="danger">steward quiet {stewardQuietDays} days</Badge>}
          {health.dormant && <Badge tone="warn">no use recorded in {DORMANT_DAYS} days</Badge>}
          {health.concentrated && <Badge tone="warn">one person does most of the recorded taking</Badge>}
        </div>
        <p className="whitespace-pre-wrap text-sm">{commons.description}</p>
        <div className="rounded-md border border-border bg-background p-3 text-sm">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Rules</div>
          <p className="whitespace-pre-wrap text-muted">{commons.rules ?? "None written yet."}</p>
        </div>
        {latestWord && (
          <p className="text-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Latest word on its state</span>{" "}
            <span className="text-muted">
              {latestWord.note} (@{latestWord.user.username}, {fmtDate(latestWord.createdAt)})
            </span>
          </p>
        )}
      </Card>

      {handoverTo && (
        <Card className="space-y-2 border-warn/40">
          <p className="text-sm">
            @{commons.steward.username} has offered this to <span className="font-medium">@{handoverTo.username}</span>. Nothing changes unless they accept.
          </p>
          {commons.handoverToId === me.id && (
            <div className="flex flex-wrap gap-2">
              <form action={respondToHandover.bind(null, commons.id, true)}><Button type="submit">Accept: I will tend it</Button></form>
              <form action={respondToHandover.bind(null, commons.id, false)}><Button type="submit" variant="ghost">Decline</Button></form>
            </div>
          )}
          {amSteward && <form action={respondToHandover.bind(null, commons.id, false)}><Button type="submit" variant="ghost">Withdraw the offer</Button></form>}
        </Card>
      )}

      {openDecision && (
        <Card className="border-accent/40">
          <p className="text-sm">
            Its users are deciding: <Link href={`/assemblies/${openDecision.id}`} className="font-medium text-accent hover:underline">{openDecision.title}</Link>. Voting closes {fmtDate(openDecision.closesAt)}.
          </p>
        </Card>
      )}

      <Card>
        <SectionTitle>Write in the record</SectionTitle>
        <form action={recordEntry.bind(null, commons.id)} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
            <Field label="I">
              <Select name="kind" defaultValue="TOOK">
                {(Object.keys(ENTRY_HINT) as (keyof typeof ENTRY_HINT)[]).map((kind) => (
                  <option key={kind} value={kind} title={ENTRY_HINT[kind]}>{ENTRY_LABEL[kind]}</option>
                ))}
              </Select>
            </Field>
            <Field label="What, or how much (optional)"><Input name="quantity" maxLength={60} placeholder="20 L / the long saw / an afternoon" /></Field>
          </div>
          <Field label="Anything others should know (optional)" hint="The state you found it in or left it in. If you tended it, say how it is.">
            <Input name="note" maxLength={300} placeholder="Pump handle is loose. / Sharpened before returning." />
          </Field>
          <SubmitButton pendingText="Writing...">Write it down</SubmitButton>
          <p className="text-xs text-muted">
            Members can read this: that you used it, and on which day (not the time). Nobody approves it and nobody can remove it. That is what makes it worth reading.
          </p>
        </form>
      </Card>

      <section>
        <SectionTitle>The record <InfoDot term="commons" /></SectionTitle>
        {record.length === 0 ? (
          <Empty>Nothing written yet. If you use it, be the first to say so.</Empty>
        ) : (
          <ul className="space-y-2">
            {record.map((entry) => {
              const notes = (notesByEntry.get(entry.id) ?? []).slice().reverse();
              const iSaid = notes.some((note) => note.userId === me.id);
              const mayNote = !iSaid && (entry.userId !== me.id || notes.some((note) => note.userId !== me.id));
              return (
                <li key={entry.id}>
                  <Card className="space-y-2 py-3">
                    <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <Link href={`/people/${entry.user.username}`} className="font-medium hover:underline">@{entry.user.username}</Link>
                      <span>{ENTRY_LABEL[entry.kind]}</span>
                      {entry.quantity && <span className="font-medium">{entry.quantity}</span>}
                      <span className="ml-auto text-xs text-muted">{fmtDate(entry.createdAt)}</span>
                    </div>
                    {entry.note && <p className="text-sm text-muted">{entry.note}</p>}
                    {notes.length > 0 && (
                      <ul className="space-y-1 border-l-2 border-warn/50 pl-3">
                        {notes.map((note) => (
                          <li key={note.id} className="text-sm">
                            <span className="font-medium">@{note.user.username}</span> <span className="text-muted">{note.note}</span>{" "}
                            <span className="text-xs text-muted">{fmtDate(note.createdAt)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {mayNote && (
                      <details className="text-sm">
                        <summary className="cursor-pointer text-xs text-muted hover:text-foreground">{entry.userId === me.id ? "Reply" : "Say a word about this"}</summary>
                        <form action={addNote.bind(null, commons.id, entry.id)} className="mt-2 space-y-2">
                          <Input name="note" required minLength={3} maxLength={300} placeholder={entry.userId === me.id ? "Your side of it." : "What you saw, plainly. They will read it."} />
                          <div className="flex flex-wrap items-center gap-2">
                            <SubmitButton pendingText="Saying...">Say it</SubmitButton>
                            <span className="text-xs text-muted">Public, under your name, once. It changes nobody&apos;s standing. It is the step before a dispute, not instead of talking.</span>
                          </div>
                        </form>
                      </details>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Card className="space-y-4">
        <SectionTitle>Its rules and its steward <InfoDot term="steward" /></SectionTitle>
        <details>
          <summary className="cursor-pointer text-sm font-medium">Propose new rules</summary>
          {amUser ? (
            <form action={proposeRules.bind(null, commons.id)} className="mt-3 space-y-3">
              <Field label="The rules you propose" hint={users.size <= 1 && amSteward ? "You are its only user so far, so this takes effect at once." : `Its ${users.size} users decide by ranked choice over ${DECISION_DAYS} days. Whatever they decide is carried out when voting closes.`}>
                <Textarea name="rules" required rows={4} maxLength={2000} defaultValue={commons.rules ?? ""} />
              </Field>
              <Field label="Why (optional)"><Input name="why" maxLength={1000} /></Field>
              <SubmitButton pendingText="Putting it...">{users.size <= 1 && amSteward ? "Set the rules" : "Put it to its users"}</SubmitButton>
            </form>
          ) : (
            <p className="mt-2 text-sm text-muted">The people who use it decide its rules. Write your use in the record and you are one of them.</p>
          )}
        </details>

        {amSteward && (
          <div className="space-y-3 border-t border-border pt-3">
            <form action={toggleCommons.bind(null, commons.id)}>
              <Button variant="ghost" type="submit">{commons.available ? "Mark unavailable" : "Mark available"}</Button>
            </form>
            {!handoverTo && (
              <form action={offerHandover.bind(null, commons.id)} className="flex flex-wrap items-end gap-2">
                <div className="min-w-52 flex-1">
                  <Field label="Hand it over to" hint="They must be verified, and they must accept. If you cannot go on tending it, do this rather than going quiet.">
                    <Input name="username" required placeholder="@neighbor" />
                  </Field>
                </div>
                <SubmitButton pendingText="Offering...">Offer it</SubmitButton>
              </form>
            )}
          </div>
        )}

        {!amSteward && health.stewardSilent && !openDecision && (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-sm text-muted">
              @{commons.steward.username} has written nothing here for {stewardQuietDays} days. After {STEWARD_SILENT_DAYS}, the people who use it can decide who tends it now. Asking puts you forward; others can stand too.
            </p>
            {amUser ? (
              <form action={openSuccession.bind(null, commons.id)}><Button type="submit">Ask its users who tends it now</Button></form>
            ) : (
              <p className="text-sm text-muted">Write your use in the record first; then you can ask.</p>
            )}
          </div>
        )}
      </Card>

      {commons.decisions.some((decision) => decision.appliedAt) && (
        <section>
          <SectionTitle>What its users have decided</SectionTitle>
          <ul className="space-y-1 text-sm">
            {commons.decisions.filter((decision) => decision.appliedAt).map((decision) => (
              <li key={decision.id}>
                <Link href={`/assemblies/${decision.id}`} className="text-accent hover:underline">{decision.title}</Link>{" "}
                <span className="text-muted">{decision.appliedNote} ({fmtDate(decision.appliedAt!)})</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
