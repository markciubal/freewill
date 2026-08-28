// Initiate a single-node replica set on the MongoDB behind DATABASE_URL.
// Needed once for a fresh `mongod --replSet rs0` (docker compose does this via its healthcheck).
import { PrismaClient } from "@prisma/client";

const raw = process.env.DATABASE_URL;
if (!raw) throw new Error("DATABASE_URL is not set");
const u = new URL(raw);
u.searchParams.delete("replicaSet"); // cannot use replicaSet discovery before the set exists
u.searchParams.set("directConnection", "true");
u.pathname = "/admin"; // replSetInitiate may only be run against the admin database
const host = u.host;
const db = new PrismaClient({ datasources: { db: { url: u.toString() } } });
try {
  const hello = await db.$runCommandRaw({ hello: 1 });
  if (hello.setName) {
    console.log(`Replica set "${hello.setName}" already initiated on ${host}.`);
  } else {
    const r = await db.$runCommandRaw({ replSetInitiate: { _id: "rs0", members: [{ _id: 0, host }] } });
    console.log(r.ok === 1 ? `Replica set rs0 initiated on ${host}.` : r);
  }
} catch (e) {
  const msg = String(e.message ?? e);
  if (msg.includes("already initialized")) console.log("Replica set already initialized.");
  else if (msg.includes("replSetInitiate") || msg.includes("not running with --replSet")) {
    console.error("mongod is not running with --replSet. Start it with `npm run db:local` or use docker compose.");
    process.exit(1);
  } else throw e;
} finally {
  await db.$disconnect();
}
