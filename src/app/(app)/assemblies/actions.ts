"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { readRanking } from "@/lib/ballot-seal";
import { castSealedBallot, changeSealedBallot, type BallotOutcome } from "@/lib/ballots";
import { db } from "@/lib/db";
import { fail, failIssue, isObjectId, str } from "@/lib/form";
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
  if (!parsed.success) failIssue("/assemblies", parsed.error);
  const d = parsed.data;
  const p = await db.proposal.create({
    data: { title: d.title, body: d.body, options: d.options, locality: me.locality, authorId: me.id, closesAt: new Date(Date.now() + d.closesInDays * 86_400_000) },
    select: { id: true },
  });
  redirect(`/assemblies/${p.id}`);
}

// A secret ballot (src/lib/ballot-seal.ts). The ballot form runs in the
// browser: it ranks options as rank_<i> = 1..n (blank leaves one unranked),
// and sends either `fingerprint` (a first ballot, sealed with a key the
// browser just made) or `ballotKey` (changing a ballot it sealed before).
// Returns what happened instead of redirecting, so the browser can keep or
// forget the key accordingly.
export async function castBallot(proposalId: string, formData: FormData): Promise<BallotOutcome> {
  const me = await requireUser();
  if (!isObjectId(proposalId)) return { error: "That question no longer exists." };
  const question = await db.proposal.findUnique({ where: { id: proposalId }, select: { options: true } });
  if (!question) return { error: "That question no longer exists." };
  const read = readRanking(question.options.length, (option) => str(formData, `rank_${option}`));
  if ("error" in read) return { error: read.error };

  const ballotKey = str(formData, "ballotKey");
  const outcome = ballotKey
    ? await changeSealedBallot(proposalId, me, read.ranking, ballotKey)
    : await castSealedBallot(proposalId, me, read.ranking, str(formData, "fingerprint") ?? "");
  revalidatePath(`/assemblies/${proposalId}`);
  return outcome;
}
