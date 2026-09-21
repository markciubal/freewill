import { db } from "./db";
import { latestRun } from "./demurrage";
import { explainZeroSum, zeroSumParts } from "./explain";
import { localityKey } from "./form";
import { ledgerRoot } from "./hashlog";
import { verifyMessage, vouchToken } from "./keys";
import { MANIFEST } from "./manifest";
import { critique } from "./sabul";
import { getStandingAll } from "./standing.all";

// Live figures an answer can quote, so a statement about the present is never
// a stale sentence. Each key is a small function over the same data the rest
// of the app uses; a question names the keys it wants and the page renders
// them beside the answer.
//
// Every value is an aggregate. Nothing here can name a person, and nothing
// about one member's balance, trades or disputes is exposed.

export type LiveValue = { label: string; value: string; note?: string };

type Loader = () => Promise<LiveValue>;

const percent = (fraction: number) => `${Math.round(fraction * 100)}%`;
const grace = (cents: number) => `${(cents / 100).toFixed(2)} GRC`;

export const LIVE_STATE: Record<string, Loader> = {
  members: async () => {
    const count = await db.user.count();
    return { label: "People here", value: String(count) };
  },

  localities: async () => {
    const rows = await db.user.findMany({ select: { locality: true } });
    const distinct = new Set(rows.map((row) => localityKey(row.locality)));
    return { label: "Localities", value: String(distinct.size) };
  },

  verifiedShare: async () => {
    const standings = await getStandingAll();
    const total = standings.size;
    const verified = [...standings.values()].filter((standing) => standing.verified).length;
    return {
      label: "Verified by their neighbors",
      value: total ? `${verified} of ${total} (${percent(verified / total)})` : "nobody yet",
      note: "Verification needs vouches from already-verified locals, so a new community starts at zero.",
    };
  },

  // The total promises outstanding: the sum of everyone below zero. That is
  // the money supply, and it is created by spending rather than by issuing.
  graceInCirculation: async () => {
    const holders = await db.user.findMany({ where: { graceBalance: { lt: 0 } }, select: { graceBalance: true } });
    const outstanding = holders.reduce((sum, holder) => sum + -holder.graceBalance, 0);
    return {
      label: "Grace in circulation",
      value: grace(outstanding),
      note: "The sum of every promise currently outstanding. Nobody issued it; it exists because people spent below zero.",
    };
  },

  booksBalance: async () => {
    const parts = await zeroSumParts();
    const checked = explainZeroSum(parts);
    return {
      label: "Do the books balance?",
      value: checked.balances ? "yes, to the cent" : "NO — investigate",
      note: "Every balance, plus what demurrage carried forward, plus what is held in unredeemed notes.",
    };
  },

  ledgerEntries: async () => {
    const { count, root } = await ledgerRoot();
    return {
      label: "Events in the hash chain",
      value: String(count),
      note: count ? `Current root begins ${root.slice(0, 12)}. Write it down and any later edit to history becomes visible.` : "Nothing recorded yet.",
    };
  },

  demurrageLastRun: async () => {
    const run = await latestRun();
    if (!run) return { label: "The last melt", value: "has not run yet" };
    return {
      label: "The last melt",
      value: run.days === 0 ? "baseline only, nothing melted" : `${grace(run.totalDecayed)} shared among ${run.members}`,
      note: `Ran ${run.ranAt.toISOString().slice(0, 10)} at ${Math.round(run.rateMonthly * 100)}% a month.`,
    };
  },

  signatureCoverage: async () => {
    const vouches = await db.vouch.findMany({ include: { from: { select: { publicKey: true } } } });
    const signed = vouches.filter(
      (vouch) => vouch.signature && vouch.from.publicKey && verifyMessage(vouchToken(vouch.fromId, vouch.toId), vouch.signature, vouch.from.publicKey),
    ).length;
    return {
      label: "Vouches signed with a member's own key",
      value: vouches.length ? `${signed} of ${vouches.length} (${percent(signed / vouches.length)})` : "no vouches yet",
      note: "An unsigned vouch rests on trusting this server; a signed one can be checked anywhere.",
    };
  },

  strainedFindings: async () => {
    const { findings } = await critique();
    const strained = findings.filter((finding) => finding.severity !== "ok");
    return {
      label: "Places the critic calls strained",
      value: `${strained.length} of ${findings.length}`,
      note: strained.length ? strained.map((finding) => finding.title).join("; ") : "Nothing is pooling that the critic can measure.",
    };
  },

  // Facts about the manifest itself, so "how was this built" can quote its
  // own scale rather than an adjective.
  capabilityCount: async () => {
    const live = MANIFEST.capabilities.filter((capability) => capability.status === "live").length;
    const limits = MANIFEST.capabilities.reduce((sum, capability) => sum + capability.doesNot.length, 0);
    return {
      label: "Capabilities declared",
      value: `${live} live, ${MANIFEST.capabilities.length} total`,
      note: `Each one states its limits: ${limits} stated altogether, because the schema will not accept a capability without them.`,
    };
  },

  checkCount: async () => {
    const checks = new Set<string>();
    for (const capability of MANIFEST.capabilities) for (const check of capability.verifiedBy) checks.add(`${check.kind}:${check.ref}`);
    for (const principle of MANIFEST.principles) for (const check of principle.enforcedBy) checks.add(`${check.kind}:${check.ref}`);
    const scripts = [...checks].filter((entry) => entry.startsWith("script:")).length;
    return {
      label: "Ways to check these claims",
      value: String(checks.size),
      note: `${scripts} of them are checks you can run yourself.`,
    };
  },
};

export function isLiveStateKey(key: string): boolean {
  return Object.hasOwn(LIVE_STATE, key);
}

// Load the named figures, skipping any that fail so one broken query cannot
// take down the page that explains what the software is.
export async function loadLiveState(keys: string[]): Promise<LiveValue[]> {
  const wanted = keys.filter(isLiveStateKey);
  const settled = await Promise.allSettled(wanted.map((key) => LIVE_STATE[key]()));
  return settled.flatMap((outcome) => (outcome.status === "fulfilled" ? [outcome.value] : []));
}
