// Pure checks for the seed-bank seasonal helpers. Run: npm run smoke:seeds
import { formatSowMonths, parseSowMonths, sowableIn } from "../src/lib/seeds";

function assert(c: unknown, m: string) { if (!c) { console.error("FAIL:", m); process.exitCode = 1; } else console.log("ok:", m); }

assert(parseSowMonths("3,4,5").join() === "3,4,5", "comma numbers");
assert(parseSowMonths("Mar, Apr, May").join() === "3,4,5", "month names");
assert(parseSowMonths("3-6").join() === "3,4,5,6", "range");
assert(parseSowMonths("nov-feb").join() === "1,2,11,12", "wrap-around range Nov-Feb");
assert(parseSowMonths("4,4,apr").join() === "4", "dedupes across forms");
assert(parseSowMonths("13, 0, foo, ").join() === "", "invalid tokens dropped");
assert(parseSowMonths("").length === 0 && parseSowMonths(null).length === 0, "empty input");
assert(sowableIn([3, 4, 5], 4) && !sowableIn([3, 4, 5], 7), "sowableIn respects the window");
assert(sowableIn([], 8), "empty window = any month");
assert(formatSowMonths([5, 3, 4]) === "Mar, Apr, May", "formats sorted month names");
assert(formatSowMonths([]) === "any time", "empty formats as any time");
