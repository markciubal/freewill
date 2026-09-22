"use server";

import type { Category } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import {
  ADOPT_RULES,
  DECISION_DAYS,
  KEEP_RULES,
  LEAVE_AS_IS,
  NOMINATION_DAYS,
  NOTES_PER_DAY,
  STEWARD_SILENT_DAYS,
  commonsUsers,
  nominationsAreOpen,
  stewardIsSilent,
  type Entry,
} from "@/lib/commons";
import { NOT_YET_APPLIED, eligibleVoterIds } from "@/lib/commons.data";
import { CATEGORIES } from "@/lib/covenant";
import { db } from "@/lib/db";
import { fail, failIssue, isObjectId, ok, str } from "@/lib/form";
import { getStanding } from "@/lib/standing.all";

const DAY = 86_400_000;

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().min(3).max(2000),
  category: z.enum(CATEGORIES as [Category, ...Category[]]),
  rules: z.string().trim().max(2000).optional(),
});

export async function createCommons(formData: FormData) {
  const me = await requireUser();
  const parsed = schema.safeParse({
    name: str(formData, "name"),
    description: str(formData, "description"),
    category: str(formData, "category"),
    rules: str(formData, "rules"),
  });
  if (!parsed.success) failIssue("/commons", parsed.error);
  await db.commons.create({ data: { ...parsed.data, stewardId: me.id, locality: me.locality, lat: me.lat, lng: me.lng } });
  revalidatePath("/commons");
  ok("/commons", `${parsed.data.name} added, with you as steward.`);
}

export async function toggleCommons(id: string) {
  const me = await requireUser();
  if (!isObjectId(id)) fail("/commons", "Not found.");
  const c = await db.commons.findUnique({ where: { id }, select: { stewardId: true, available: true } });
  if (!c || c.stewardId !== me.id) fail("/commons", "Only the steward can do that.");
  await db.commons.update({ where: { id }, data: { available: !c.available } });
  revalidatePath("/commons");
  revalidatePath(`/commons/${id}`);
  ok(`/commons/${id}`, "Updated.");
}

// ---------------------------------------------------------------------------
// The record. Anyone may write in it, in their own words, with no approval.
// ---------------------------------------------------------------------------

const entrySchema = z.object({
  kind: z.enum(["TOOK", "RETURNED", "USED", "TENDED"]),
  quantity: z.string().trim().max(60).optional(),
  note: z.string().trim().max(300).optional(),
});

export async function recordEntry(commonsId: string, formData: FormData) {
  const me = await requireUser();
  if (!isObjectId(commonsId)) redirect("/commons");
  const path = `/commons/${commonsId}`;
  const parsed = entrySchema.safeParse({ kind: str(formData, "kind"), quantity: str(formData, "quantity"), note: str(formData, "note") });
  if (!parsed.success) failIssue(path, parsed.error);
  const commons = await db.commons.findUnique({ where: { id: commonsId }, select: { id: true } });
  if (!commons) redirect("/commons");
  await db.commonsEntry.create({ data: { commonsId, userId: me.id, kind: parsed.data.kind, quantity: parsed.data.quantity ?? null, note: parsed.data.note ?? null } });
  revalidatePath(path);
  ok(path, "Written in the record.");
}

// A word before a dispute: a public, signed note about one entry, or a reply
// to such a note. It changes nobody's standing. One note per person per entry,
// and a daily limit, because there is no moderator to tidy up after a quarrel.
export async function addNote(commonsId: string, aboutEntryId: string, formData: FormData) {
  const me = await requireUser();
  if (!isObjectId(commonsId) || !isObjectId(aboutEntryId)) redirect("/commons");
  const path = `/commons/${commonsId}`;
  const note = z.string().trim().min(3, "Say what you saw, in a sentence.").max(300).safeParse(str(formData, "note"));
  if (!note.success) failIssue(path, note.error);

  const about = await db.commonsEntry.findUnique({ where: { id: aboutEntryId }, select: { commonsId: true, userId: true } });
  if (!about || about.commonsId !== commonsId) fail(path, "That entry is not in this record.");
  if (about.userId === me.id && !(await db.commonsEntry.findFirst({ where: { aboutEntryId, kind: "NOTE", userId: { not: me.id } } }))) {
    fail(path, "That is your own entry. If you want to add to it, write a new one.");
  }
  const already = await db.commonsEntry.findFirst({ where: { commonsId, aboutEntryId, userId: me.id, kind: "NOTE" } });
  if (already) fail(path, "You have already said something about that entry. If it is not settled, talk to them, or open a dispute.");
  const today = await db.commonsEntry.count({ where: { commonsId, userId: me.id, kind: "NOTE", createdAt: { gte: new Date(Date.now() - DAY) } } });
  if (today >= NOTES_PER_DAY) fail(path, `You have left ${NOTES_PER_DAY} notes here today. Leave it until tomorrow, or talk in person.`);

  await db.commonsEntry.create({ data: { commonsId, userId: me.id, kind: "NOTE", note: note.data, aboutEntryId } });
  revalidatePath(path);
  ok(path, "Said, in public, under your name. It affects nobody's standing.");
}

// ---------------------------------------------------------------------------
// Handing over. The steward offers; the other person must accept.
// ---------------------------------------------------------------------------

export async function offerHandover(commonsId: string, formData: FormData) {
  const me = await requireUser();
  if (!isObjectId(commonsId)) redirect("/commons");
  const path = `/commons/${commonsId}`;
  const commons = await db.commons.findUnique({ where: { id: commonsId }, select: { stewardId: true } });
  if (!commons || commons.stewardId !== me.id) fail(path, "Only the steward can hand it over.");
  const username = (str(formData, "username") ?? "").replace(/^@/, "").toLowerCase();
  const to = await db.user.findUnique({ where: { username }, select: { id: true } });
  if (!to) fail(path, "Nobody here has that username.");
  if (to.id === me.id) fail(path, "You are already the steward.");
  const standing = await getStanding(to.id);
  if (!standing.verified) fail(path, `@${username} is not verified yet, so they cannot be a steward.`);
  await db.commons.update({ where: { id: commonsId }, data: { handoverToId: to.id, handoverOfferedAt: new Date() } });
  revalidatePath(path);
  ok(path, `Offered to @${username}. Nothing changes until they accept.`);
}

export async function respondToHandover(commonsId: string, accept: boolean) {
  const me = await requireUser();
  if (!isObjectId(commonsId)) redirect("/commons");
  const path = `/commons/${commonsId}`;
  const commons = await db.commons.findUnique({ where: { id: commonsId }, select: { stewardId: true, handoverToId: true } });
  if (!commons) redirect("/commons");
  // The steward may withdraw the offer; the person it was made to may accept or decline.
  if (!accept && commons.stewardId === me.id) {
    await db.commons.update({ where: { id: commonsId }, data: { handoverToId: null, handoverOfferedAt: null } });
    revalidatePath(path);
    ok(path, "Offer withdrawn.");
  }
  if (commons.handoverToId !== me.id) fail(path, "This was not offered to you.");
  if (!accept) {
    await db.commons.update({ where: { id: commonsId }, data: { handoverToId: null, handoverOfferedAt: null } });
    revalidatePath(path);
    ok(path, "Declined. Nothing changed.");
  }
  const standing = await getStanding(me.id);
  if (!standing.verified) fail(path, "You need to be verified to be a steward.");
  await db.$transaction([
    db.commons.update({ where: { id: commonsId }, data: { stewardId: me.id, handoverToId: null, handoverOfferedAt: null } }),
    db.commonsEntry.create({ data: { commonsId, userId: me.id, kind: "TENDED", note: "Took over as steward." } }),
  ]);
  revalidatePath(path);
  revalidatePath("/commons");
  ok(path, "You are the steward now.");
}

// ---------------------------------------------------------------------------
// Questions for its users: the rules, and who tends it when a steward is gone.
// ---------------------------------------------------------------------------

async function loadForQuestion(commonsId: string, meId: string) {
  const commons = await db.commons.findUnique({ where: { id: commonsId }, select: { id: true, name: true, stewardId: true, locality: true, createdAt: true, rules: true } });
  if (!commons) redirect("/commons");
  const entries = (await db.commonsEntry.findMany({ where: { commonsId }, select: { id: true, userId: true, kind: true, createdAt: true } })) as Entry[];
  const open = await db.proposal.findFirst({ where: { commonsId, ...NOT_YET_APPLIED }, select: { id: true } });
  const isUser = commonsUsers(entries, commons.stewardId).has(meId);
  return { commons, entries, open, isUser };
}

export async function proposeRules(commonsId: string, formData: FormData) {
  const me = await requireUser();
  if (!isObjectId(commonsId)) redirect("/commons");
  const path = `/commons/${commonsId}`;
  const rules = z.string().trim().min(3, "Write the rules you are proposing.").max(2000).safeParse(str(formData, "rules"));
  if (!rules.success) failIssue(path, rules.error);
  const why = z.string().trim().max(1000).optional().safeParse(str(formData, "why"));
  const { commons, entries, open, isUser } = await loadForQuestion(commonsId, me.id);
  if (!isUser) fail(path, "Only people who use it can propose its rules. Write your use in the record first.");
  const standing = await getStanding(me.id);
  if (!standing.verified) fail(path, "Only verified people can put a question.");

  // While the steward is the only user, nobody else is affected yet, so the
  // steward may simply set the rules. Once anyone else uses it, its users decide.
  const others = [...commonsUsers(entries, commons.stewardId)].filter((userId) => userId !== commons.stewardId);
  if (others.length === 0 && commons.stewardId === me.id) {
    await db.commons.update({ where: { id: commonsId }, data: { rules: rules.data } });
    revalidatePath(path);
    ok(path, "Rules set. Once other people use it, changing them will be their decision too.");
  }
  if (open) fail(path, "Its users are already deciding something. One question at a time.");

  const question = await db.proposal.create({
    data: {
      title: `New rules for ${commons.name}`,
      body: `${why.success && why.data ? `${why.data}\n\n` : ""}Proposed rules:\n${rules.data}\n\nCurrent rules:\n${commons.rules ?? "(none)"}`,
      options: [KEEP_RULES, ADOPT_RULES],
      locality: commons.locality ?? me.locality,
      authorId: me.id,
      closesAt: new Date(Date.now() + DECISION_DAYS * DAY),
      commonsId,
      commonsAction: "RULES",
      proposedRules: rules.data,
    },
    select: { id: true },
  });
  redirect(`/assemblies/${question.id}`);
}

export async function openSuccession(commonsId: string) {
  const me = await requireUser();
  if (!isObjectId(commonsId)) redirect("/commons");
  const path = `/commons/${commonsId}`;
  const { commons, entries, open, isUser } = await loadForQuestion(commonsId, me.id);
  if (!stewardIsSilent(entries, commons.stewardId, commons.createdAt)) {
    fail(path, `The steward has been active in the last ${STEWARD_SILENT_DAYS} days. If there is a problem with how it is tended, talk to them, or open a dispute.`);
  }
  if (!isUser) fail(path, "Only people who use it can ask this. Write your use in the record first.");
  const standing = await getStanding(me.id);
  if (!standing.verified) fail(path, "Only verified people can put a question, or be a steward.");
  if (open) fail(path, "Its users are already deciding something. One question at a time.");

  const question = await db.proposal.create({
    data: {
      title: `Who tends ${commons.name} now?`,
      body: `Its steward has written nothing in its record for over ${STEWARD_SILENT_DAYS} days. @${me.username} has offered to tend it. For the first ${NOMINATION_DAYS} days, anyone else who uses it and is verified may put themselves forward too. Its users decide; the result is carried out when voting closes.`,
      options: [LEAVE_AS_IS, `@${me.username}`],
      candidateIds: ["", me.id],
      locality: commons.locality ?? me.locality,
      authorId: me.id,
      closesAt: new Date(Date.now() + DECISION_DAYS * DAY),
      commonsId,
      commonsAction: "STEWARD",
    },
    select: { id: true },
  });
  redirect(`/assemblies/${question.id}`);
}

// Put yourself forward during the first days of a question about who tends
// it. Options are only ever added at the end, so ballots already cast stay
// valid; people can change theirs until voting closes.
export async function standAsSteward(proposalId: string) {
  const me = await requireUser();
  if (!isObjectId(proposalId)) redirect("/assemblies");
  const path = `/assemblies/${proposalId}`;
  const question = await db.proposal.findUnique({ where: { id: proposalId }, include: { commons: { select: { id: true, stewardId: true } } } });
  if (!question || !question.commons || question.commonsAction !== "STEWARD") fail(path, "This is not a question about a steward.");
  if (question.closesAt <= new Date()) fail(path, "Voting has closed.");
  if (!nominationsAreOpen(question.createdAt)) fail(path, `People could put themselves forward for the first ${NOMINATION_DAYS} days. That has passed.`);
  if (question.candidateIds.includes(me.id)) fail(path, "You are already on the list.");
  const eligible = await eligibleVoterIds(question.commons, question.createdAt);
  if (!eligible.has(me.id)) fail(path, "Only verified people who were already using it can put themselves forward.");
  await db.proposal.update({ where: { id: proposalId }, data: { options: { push: `@${me.username}` }, candidateIds: { push: me.id } } });
  revalidatePath(path);
  ok(path, "You are on the list.");
}
