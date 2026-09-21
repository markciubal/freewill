#!/usr/bin/env node
// Repairs package-lock.json after npm on Windows has dropped entries that only
// platform-specific optional packages need (see lock-check.cjs). It asks npm
// for a from-scratch resolution in a temporary directory, then copies into
// the real lockfile only the entries required to satisfy edges that do not
// resolve. Nothing already in the lockfile changes version. Run: npm run lock:fix
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");
const semver = require("semver");

const root = path.resolve(__dirname, "..");
const lockPath = path.join(root, "package-lock.json");
const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));

function resolveFrom(entries, from, name) {
  let dir = from;
  for (;;) {
    const candidate = (dir ? dir + "/" : "") + "node_modules/" + name;
    if (entries[candidate]) return candidate;
    if (!dir) return null;
    const cut = dir.lastIndexOf("/node_modules/");
    dir = cut === -1 ? "" : dir.slice(0, cut);
  }
}

function missingEdges(entries) {
  const missing = [];
  for (const [key, entry] of Object.entries(entries)) {
    const wants = { ...(entry.dependencies || {}), ...(entry.optionalDependencies || {}), ...(key === "" ? entry.devDependencies || {} : {}) };
    for (const [name, range] of Object.entries(wants)) {
      const found = resolveFrom(entries, key, name);
      const ok = found && (!semver.validRange(range) || semver.satisfies(entries[found].version, range, { includePrerelease: true }));
      if (!ok) missing.push({ from: key, name, range });
    }
  }
  return missing;
}

const before = missingEdges(lock.packages);
if (before.length === 0) {
  console.log("package-lock.json is already complete; nothing to do.");
  process.exit(0);
}
console.log(`${before.length} dependency edge${before.length === 1 ? "" : "s"} do not resolve; asking npm for a fresh resolution...`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "freewill-lock-"));
fs.copyFileSync(path.join(root, "package.json"), path.join(tmp, "package.json"));
execSync("npm install --package-lock-only --ignore-scripts --no-audit --no-fund", { cwd: tmp, stdio: "inherit" });
const fresh = JSON.parse(fs.readFileSync(path.join(tmp, "package-lock.json"), "utf8")).packages;

// Copy an entry from the fresh lock, and whatever its own edges need, until
// everything resolves. Existing entries are never replaced.
let copied = 0;
function adopt(key) {
  if (lock.packages[key] || !fresh[key]) return;
  lock.packages[key] = fresh[key];
  copied++;
  const wants = { ...(fresh[key].dependencies || {}), ...(fresh[key].optionalDependencies || {}) };
  for (const name of Object.keys(wants)) {
    const target = resolveFrom(fresh, key, name);
    if (target && !lock.packages[target]) adopt(target);
  }
}
for (const edge of before) {
  const target = resolveFrom(fresh, edge.from, edge.name);
  if (target) adopt(target);
  else console.warn(`  could not find ${edge.name}@${edge.range} for ${edge.from || "(root)"} even in a fresh resolution`);
}

// Keep npm's key order: entries sorted by path, root first.
const sorted = Object.fromEntries(Object.entries(lock.packages).sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b))));
lock.packages = sorted;
fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");

const after = missingEdges(lock.packages);
console.log(`copied ${copied} entr${copied === 1 ? "y" : "ies"}; ${after.length} edge${after.length === 1 ? "" : "s"} still unresolved.`);
if (after.length) {
  for (const e of after) console.log(`  - ${e.from || "(root)"} needs ${e.name}@${e.range}`);
  process.exit(1);
}
console.log("package-lock.json repaired. Commit it.");
