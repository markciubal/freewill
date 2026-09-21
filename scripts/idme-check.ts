// Pure checks for ID.me affiliation extraction and policy config. No network.
// Run: npm run smoke:idme
import "./not-production";
import { IDME_ALL_POLICIES, extractAffiliations, idmePolicies, knownAffiliations, policyLabel } from "../src/lib/idme.shared";

function assert(c: unknown, m: string) { if (!c) { console.error("FAIL:", m); process.exitCode = 1; } else console.log("ok:", m); }

// idmePolicies honors IDME_POLICIES subset.
process.env.IDME_POLICIES = "nurse,teacher";
assert(idmePolicies().map((p) => p.handle).join(",") === "nurse,teacher", "IDME_POLICIES selects the enabled subset");
delete process.env.IDME_POLICIES;
assert(idmePolicies().length === IDME_ALL_POLICIES.length, `no IDME_POLICIES: all ${IDME_ALL_POLICIES.length} offered`);
assert(policyLabel("responder") === "First responder" && policyLabel("weird") === "weird", "policyLabel maps known, passes through unknown");

// Military is never offered, stored, searched or shown: a list of soldiers and
// veterans is a target list if the database is seized.
assert(!IDME_ALL_POLICIES.some((p) => p.handle === "military"), "military is not an affiliation this app offers");
process.env.IDME_POLICIES = "nurse,military";
assert(idmePolicies().map((p) => p.handle).join(",") === "nurse", "IDME_POLICIES cannot turn military back on");
delete process.env.IDME_POLICIES;
assert(extractAffiliations({ groups: ["military", "nurse"] }, [{ group: "military", verified: true }]).join() === "nurse", "a military group reported by ID.me is never stored");
assert(knownAffiliations(["military", "nurse", "government"]).join(",") === "nurse,government", "a military badge stored before it was dropped is not shown, and the rest keep their order");

// OIDC id_token shapes.
assert(extractAffiliations({ group: "nurse" }, null).join() === "nurse", "id_token string group");
assert(extractAffiliations({ groups: ["responder", "teacher", "bogus"] }, null).sort().join() === "responder,teacher", "id_token array groups, unknown dropped");
// Legacy attributes shapes.
assert(extractAffiliations(null, [{ handle: "group", value: "responder" }]).join() === "responder", "attributes handle/value");
assert(extractAffiliations(null, [{ group: "government", verified: true }, { group: "nurse", verified: false }]).join() === "government", "attributes group/verified, unverified dropped");
assert(extractAffiliations(null, { status: [{ group: "teacher" }] }).join() === "teacher", "attributes object status array");
assert(extractAffiliations(null, null).length === 0, "nothing in, nothing out");
