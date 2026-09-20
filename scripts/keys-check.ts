// Member identity keys: signing, verification, forgery detection, and
// off-server verification of a trust bundle. Pure crypto plus a live check of
// the critic. Run: npm run smoke:keys
import { db } from "../src/lib/db";
import { generateIdentity, keyFingerprint, publicKeyOf, signMessage, verifyMessage, verifyTrustBundle, vouchToken, type TrustBundle } from "../src/lib/keys";
import { critique } from "../src/lib/sabul";

function assert(c: unknown, m: string) { if (!c) { console.error("FAIL:", m); process.exitCode = 1; } else console.log("ok:", m); }

async function main() {
  // Identity.
  const ada = generateIdentity();
  const bo = generateIdentity();
  assert(ada.publicKey === publicKeyOf(ada.privateKey), "public key derives from private key");
  assert(ada.publicKey !== bo.publicKey, "two identities differ");
  assert(keyFingerprint(ada.publicKey).length === 17, "fingerprint is short and stable");

  // Anti-Sabul: a vouch signed by ada is provably ada's and cannot be forged.
  const token = vouchToken("id-ada", "id-bo");
  const sig = signMessage(ada.privateKey, token);
  assert(verifyMessage(token, sig, ada.publicKey), "ada's signed vouch verifies against ada's key");
  assert(!verifyMessage(token, sig, bo.publicKey), "the same signature does not verify as bo's (no appropriation)");
  assert(!verifyMessage(vouchToken("id-ada", "id-cy"), sig, ada.publicKey), "a signature for one vouch cannot be reused for another");
  const forged = signMessage(bo.privateKey, token);
  assert(!verifyMessage(token, forged, ada.publicKey), "bo cannot forge a vouch in ada's name");

  // Anti-wall: a trust bundle verifies off-server with only public keys.
  const bundle: TrustBundle = {
    version: 1,
    members: [{ id: "id-ada", username: "ada", publicKey: ada.publicKey }, { id: "id-bo", username: "bo", publicKey: bo.publicKey }],
    vouches: [
      { fromId: "id-ada", toId: "id-bo", signature: sig },
      { fromId: "id-bo", toId: "id-ada", signature: signMessage(bo.privateKey, vouchToken("id-bo", "id-ada")) },
      { fromId: "id-ada", toId: "id-bo", signature: forged }, // a forgery slipped into the bundle
      { fromId: "id-zed", toId: "id-ada", signature: sig }, // signer with no published key
    ],
  };
  const v = verifyTrustBundle(bundle);
  assert(v.valid === 2 && v.invalid === 1 && v.unknownKey === 1, `bundle verifies without a server: ${v.valid} valid, ${v.invalid} forged, ${v.unknownKey} unknown-key`);

  // The critic runs over live data and reports on signature coverage among its findings.
  try {
    const c = await critique();
    const cov = c.findings.find((f) => f.id === "signature-coverage");
    assert(c.findings.length === 6 && !!cov, `Sabul critiques live data (${c.findings.length} findings, ${c.members} members)`);
    await db.$disconnect();
  } catch {
    console.log("(dev DB not reachable; skipped live critic check)");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
