"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fail, firstIssue, isObjectId, ok, str } from "@/lib/form";
import { getStanding } from "@/lib/standing.all";

const proposalSchema = z.object({
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(10).max(5000),
  options: z.array(z.string().trim().min(1).max(80)).min(2, "Give at least two options").max(10, "At most ten options"),
  closesInDays: z.coerce.number().int().min(1).max(30),
});

export async function createProposal(formData: FormData) {
  const me = await requireUser();
  const standing = await getStanding(me.id);
  if (!standing.verified) fail("/assemblies", `Only verified people can put a question to the assembly. You need ${standing.requiredVouches} vouch${standing.requiredVouches === 1 ? "" : "es"} from people in ${me.locality}.`);
  const parsed = proposalSchema.safeParse({
    title: str(formData, "title"),
    body: str(formData, "body"),
    options: Array.from(new Set((str(formData, "options") ?? "").split("\n").map((s) => s.trim()).filter(Boolean))),
    closesInDays: str(formData, "closesInDays") ?? "7",
  });
  if (!parsed.success) fail("/assemblies", firstIssue(parsed.error));
  const d = parsed.data;
  const p = await db.proposal.create({
    data: { title: d.title, body: d.body, options: d.options, locality: me.locality, authorId: me.id, closesAt: new Date(Date.now() + d.closesInDays * 86_400_000) },
    select: { id: true },
  });
  redirect(`/assemblies/${p.id}`);
}

// A ballot ranks options: rank_<i> = 1..n, blank to leave an option unranked.
export async function castBallot(proposalId: string, formData: FormData) {
  const me = await requireUser();
  if (!isObjectId(proposalId)) redirect("/assemblies");
  const path = `/assemblies/${proposalId}`;
  const p = await db.proposal.findUnique({ where: { id: proposalId } });
  if (!p) redirect("/assemblies");
  if (p.closesAt <= new Date()) fail(path, "Voting has closed.");
  if (p.locality !== me.locality) fail(path, `Only people in ${p.locality} vote on this.`);
  const standing = await getStanding(me.id);
  if (!standing.verified) fail(path, `Only verified people vote. You need ${standing.requiredVouches} vouch${standing.requiredVouches === 1 ? "" : "es"} from people in ${me.locality}.`);

  const ranked: { i: number; rank: number }[] = [];
  for (let i = 0; i < p.options.length; i++) {
    const v = str(formData, `rank_${i}`);
    if (!v) continue;
    const rank = Number(v);
    if (!Number.isInteger(rank) || rank < 1 || rank > p.options.length) fail(path, "Ranks must be whole numbers.");
    ranked.push({ i, rank });
  }
  if (ranked.length === 0) fail(path, "Rank at least one option.");
  if (new Set(ranked.map((r) => r.rank)).size !== ranked.length) fail(path, "Each rank can be used once.");
  const ranking = ranked.sort((a, b) => a.rank - b.rank).map((r) => r.i);

  await db.ballot.upsert({
    where: { proposalId_userId: { proposalId, userId: me.id } },
    create: { proposalId, userId: me.id, ranking },
    update: { ranking },
  });
  revalidatePath(path);
  ok(path, "Your ballot is recorded. You can change it until voting closes.");
}
