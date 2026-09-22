"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { addressProblem, fetchFromPeer, isNodeKey, nodePublicKey, normalizePeerUrl, readCapped, sendToPeer } from "@/lib/federation";
import { fail, failIssue, isObjectId, ok, str } from "@/lib/form";
import { keyFingerprint } from "@/lib/keys";
import { getStanding } from "@/lib/standing.all";

const peerSchema = z.object({
  name: z.string().trim().min(2).max(60),
  // Keys are often read aloud in groups, so spaces between groups are fine.
  publicKey: z
    .string()
    .transform((s) => s.replace(/\s+/g, "").toLowerCase())
    .refine(isNodeKey, "Node key: give the whole key, all 64 letters and digits"),
  url: z.string().trim().max(300).optional(),
});

// When an address is given, ask it which key it answers with. A different key
// means the address is not the node people there described, and the member
// is told before anything is added. An address that cannot be reached is not
// a reason to refuse: a node may be offline, and a file can carry its bundle.
async function keyAtAddress(url: string): Promise<string | null> {
  try {
    const response = await fetch(`${url}/api/federation/node`, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;
    const text = await readCapped(response.body, 64 * 1024);
    const body = text ? (JSON.parse(text) as { publicKey?: unknown }) : null;
    return typeof body?.publicKey === "string" && isNodeKey(body.publicKey) ? body.publicKey.toLowerCase() : null;
  } catch {
    return null;
  }
}

async function checkedAddress(raw: string | undefined, key: string, back: string): Promise<{ url: string | null; note: string }> {
  if (!raw) return { url: null, note: "" };
  const problem = await addressProblem(raw);
  if (problem) fail(back, problem, "url");
  const url = normalizePeerUrl(raw);
  const answered = await keyAtAddress(url);
  if (answered && answered !== key) {
    fail(back, `The node at that address has a different key (${keyFingerprint(answered)}). Check the key and the address with someone who lives there.`, "url");
  }
  return { url, note: answered ? " Its address answered with the same key." : " Its address could not be reached to check the key, so check it again when it is up." };
}

// Add another node, with the adder's own trust. Only verified members may,
// because adding a node is trusting it.
export async function addPeer(formData: FormData) {
  const me = await requireUser();
  const standing = await getStanding(me.id);
  if (!standing.verified) fail("/nodes", "Only verified members can add another node, as only they can vouch.");
  const parsed = peerSchema.safeParse({ name: str(formData, "name"), publicKey: str(formData, "publicKey"), url: str(formData, "url") });
  if (!parsed.success) failIssue("/nodes", parsed.error);
  const d = parsed.data;
  if (d.publicKey === nodePublicKey()) fail("/nodes", "That is this node's own key.", "publicKey");
  const existing = await db.peer.findUnique({ where: { publicKey: d.publicKey }, select: { name: true } });
  if (existing) fail("/nodes", `Members here already added that node, as ${existing.name}. Trust it from its page.`);
  const { url, note } = await checkedAddress(d.url, d.publicKey, "/nodes");

  const peer = await db.peer.create({
    data: { name: d.name, publicKey: d.publicKey, url, addedById: me.id, trust: { create: { userId: me.id } } },
    select: { id: true },
  });
  revalidatePath("/nodes");
  ok(`/nodes/${peer.id}`, `Added ${d.name}, with your trust.${note}`);
}

export async function trustPeer(peerId: string) {
  const me = await requireUser();
  if (!isObjectId(peerId)) redirect("/nodes");
  const path = `/nodes/${peerId}`;
  const standing = await getStanding(me.id);
  if (!standing.verified) fail(path, "Only verified members can trust another node, as only they can vouch.");
  const peer = await db.peer.findUnique({ where: { id: peerId }, select: { id: true } });
  if (!peer) redirect("/nodes");
  await db.peerTrust.upsert({
    where: { peerId_userId: { peerId, userId: me.id } },
    create: { peerId, userId: me.id },
    update: {},
  });
  revalidatePath(path);
  revalidatePath("/nodes");
  ok(path, "You trust this node.");
}

export async function untrustPeer(peerId: string) {
  const me = await requireUser();
  if (!isObjectId(peerId)) redirect("/nodes");
  const path = `/nodes/${peerId}`;
  await db.peerTrust.deleteMany({ where: { peerId, userId: me.id } });
  revalidatePath(path);
  revalidatePath("/nodes");
  ok(path, "Your trust is withdrawn. What was already taken in stays on record.");
}

// Fetch its bundle now. Anyone signed in may press it: the fetch goes only to
// a node members here trust, and what comes back is checked by its signature.
export async function fetchPeerNow(peerId: string) {
  const me = await requireUser();
  if (!isObjectId(peerId)) redirect("/nodes");
  const path = `/nodes/${peerId}`;
  const result = await fetchFromPeer(peerId, me.id);
  revalidatePath(path);
  revalidatePath("/nodes");
  if (result.outcome === "refused") fail(path, result.message);
  ok(path, result.message);
}

export async function sendToPeerNow(peerId: string) {
  await requireUser();
  if (!isObjectId(peerId)) redirect("/nodes");
  const path = `/nodes/${peerId}`;
  const result = await sendToPeer(peerId);
  if (!result.ok) fail(path, result.message);
  ok(path, result.message);
}

// Change or clear where a node is fetched from. Servers move; the key is what
// stays. Only a verified member who trusts it may change it.
export async function setPeerAddress(peerId: string, formData: FormData) {
  const me = await requireUser();
  if (!isObjectId(peerId)) redirect("/nodes");
  const path = `/nodes/${peerId}`;
  const [peer, standing, trusts] = await Promise.all([
    db.peer.findUnique({ where: { id: peerId }, select: { publicKey: true } }),
    getStanding(me.id),
    db.peerTrust.count({ where: { peerId, userId: me.id } }),
  ]);
  if (!peer) redirect("/nodes");
  if (!standing.verified || trusts === 0) fail(path, "Only a verified member who trusts this node can change its address.");
  const { url, note } = await checkedAddress(str(formData, "url"), peer.publicKey, path);
  await db.peer.update({ where: { id: peerId }, data: { url } });
  revalidatePath(path);
  ok(path, url ? `Address saved.${note}` : "Address cleared. Bring its bundle by file.");
}
