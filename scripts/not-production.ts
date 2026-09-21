// Import this FIRST in any script that makes demo or test data:
//
//   import "./not-production";
//
// The seed's neighbours and the tests' records, on the live server, would show
// people activity that never happened. This stops the script before it opens a
// database connection. There is no flag to get past it, on purpose: data for
// trying things out belongs in the development database.
// smoke:prod fails if the seed or a smoke script does not import it first.
import path from "node:path";
import { productionReason } from "../src/lib/database-target";

const reason = productionReason(process.env);
if (reason) {
  const script = path.basename(process.argv[1] ?? "this script");
  console.error(`Refusing to run ${script}: ${reason}.`);
  console.error("Demo and test data never go into production. Point DATABASE_URL_DEV at a development database and run it there.");
  process.exit(1);
}
