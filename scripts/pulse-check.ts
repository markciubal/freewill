// Checks for the trade pulse: eligibility logic (pure), then a read-only
// aggregate query if the dev DB is reachable. Run: npm run smoke:pulse
import { canReflect, DELTAS, DELTA_LABEL } from "../src/lib/pulse";

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else console.log("ok:", msg);
}

async function main() {
  const listing = (status: string, pledges: { userId: string; status: string }[]) => ({ status, ownerId: "owner", pledges });

  assert(canReflect(listing("FULFILLED", [{ userId: "helper", status: "COMPLETED" }]), "owner"), "owner of a settled exchange may answer");
  assert(canReflect(listing("FULFILLED", [{ userId: "helper", status: "COMPLETED" }]), "helper"), "completed pledger may answer");
  assert(!canReflect(listing("FULFILLED", [{ userId: "helper", status: "COMPLETED" }, { userId: "declined", status: "DECLINED" }]), "declined"), "declined pledger may not");
  assert(!canReflect(listing("FULFILLED", [{ userId: "helper", status: "COMPLETED" }]), "stranger"), "bystander may not");
  assert(!canReflect(listing("OPEN", [{ userId: "helper", status: "ACCEPTED" }]), "owner"), "open listing: nobody answers yet");
  assert(!canReflect(listing("WITHDRAWN", []), "owner"), "withdrawn listing: no question");
  assert(DELTAS.every((d) => DELTA_LABEL[d] !== undefined) && DELTAS.length === 5, "every delta has a label");

  try {
    const { getPulse } = await import("../src/lib/pulse");
    const { db } = await import("../src/lib/db");
    const p = await getPulse();
    assert(Number.isInteger(p.allTime.sum) && p.allTime.answers >= 0, `dev DB aggregate reads (all time ${p.allTime.sum} across ${p.allTime.answers})`);
    await db.$disconnect();
  } catch {
    console.log("(dev DB not reachable; pure-logic checks only)");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
