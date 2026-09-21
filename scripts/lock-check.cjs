#!/usr/bin/env node
// Is package-lock.json complete? Every dependency edge of every entry must
// resolve, the way Node resolves modules (walk up node_modules directories),
// to an entry whose version satisfies the range. This is the check npm ci
// performs on Linux. npm on Windows skips entries that only platform-specific
// optional packages need (the wasm32-wasi builds of tailwind, sharp and the
// eslint resolver), so a lockfile that installs fine here can still fail on
// Heroku with "npm lockfile is not in sync". Run: npm run lock:check
// Fix: npm run lock:fix
const fs = require("fs");
const path = require("path");
const semver = require("semver");

const root = path.resolve(__dirname, "..");
const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const entries = lock.packages;

// Find the entry that `from` would get for `name`: nearest node_modules up the path.
function resolveFrom(from, name) {
  let dir = from;
  for (;;) {
    const candidate = (dir ? dir + "/" : "") + "node_modules/" + name;
    if (entries[candidate]) return { key: candidate, entry: entries[candidate] };
    if (!dir) return null;
    const cut = dir.lastIndexOf("/node_modules/");
    dir = cut === -1 ? "" : dir.slice(0, cut);
  }
}

const problems = [];

// 1. package.json and the lock's root entry must agree.
for (const section of ["dependencies", "devDependencies", "optionalDependencies"]) {
  const declared = pkg[section] || {};
  const locked = entries[""][section] || {};
  for (const name of new Set([...Object.keys(declared), ...Object.keys(locked)])) {
    if (declared[name] !== locked[name]) problems.push(`root ${section}: ${name} is "${declared[name]}" in package.json but "${locked[name]}" in the lock`);
  }
}

// 2. Every edge from every entry resolves to a satisfying version.
let edges = 0;
for (const [key, entry] of Object.entries(entries)) {
  const from = key === "" ? "" : key;
  const wants = { ...(entry.dependencies || {}), ...(entry.optionalDependencies || {}), ...(key === "" ? entry.devDependencies || {} : {}) };
  for (const [name, range] of Object.entries(wants)) {
    edges++;
    const found = resolveFrom(from, name);
    if (!found) {
      problems.push(`${key || "(root)"} needs ${name}@${range} but no entry resolves`);
      continue;
    }
    const isRange = semver.validRange(range);
    if (isRange && found.entry.version && !semver.satisfies(found.entry.version, range, { includePrerelease: true })) {
      problems.push(`${key || "(root)"} needs ${name}@${range} but ${found.key} is ${found.entry.version}`);
    }
  }
}

if (problems.length) {
  console.error(`package-lock.json is NOT complete (${problems.length} problem${problems.length === 1 ? "" : "s"}, ${edges} edges checked):`);
  for (const p of problems) console.error("  - " + p);
  console.error("\nRun: npm run lock:fix");
  process.exit(1);
}
console.log(`package-lock.json is complete: ${Object.keys(entries).length} entries, ${edges} dependency edges all resolve.`);
