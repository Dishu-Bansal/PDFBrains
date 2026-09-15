/**
 * Analytics guard: keeps every trackEvent call site honest.
 *
 * Checks (all failures exit non-zero, so this can run in CI):
 *   1. every `trackEvent("name", ...)` in src/ refers to an event declared in
 *      AnalyticsEventMap (src/lib/analytics.ts) - typos cannot ship;
 *   2. no call site passes a privacy-risky parameter key (file names, user
 *      text, prompts, passwords) - analytics must never carry user data;
 *   3. reports events that are declared but never used (informational).
 *
 * Run with `npm run test:analytics`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const analyticsPath = join(root, "src", "lib", "analytics.ts");

/** Parameter keys that would mean user data is being reported. */
const FORBIDDEN_KEYS = [
  "file_name",
  "file_names",
  "filename",
  "name",
  "text",
  "content",
  "query",
  "term",
  "prompt",
  "message",
  "password",
  "email",
  "url",
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const absolute = join(dir, entry);
    if (statSync(absolute).isDirectory()) out.push(...walk(absolute));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(absolute);
  }
  return out;
}

const analyticsSource = readFileSync(analyticsPath, "utf8");
const mapBlock = analyticsSource.match(
  /export interface AnalyticsEventMap \{([\s\S]*?)\n\}/
)?.[1];

if (!mapBlock) {
  console.error("test-analytics: could not find AnalyticsEventMap in src/lib/analytics.ts");
  process.exit(1);
}

const declared = new Set(
  [...mapBlock.matchAll(/^\s{2}([a-z][a-z0-9_]*):/gm)].map((match) => match[1])
);

if (declared.size === 0) {
  console.error("test-analytics: AnalyticsEventMap declared no events");
  process.exit(1);
}

const used = new Map();
const problems = [];
let callSites = 0;

for (const file of walk(join(root, "src"))) {
  const source = readFileSync(file, "utf8");
  const relativePath = relative(root, file).replace(/\\/g, "/");
  const lines = source.split("\n");

  lines.forEach((line, index) => {
    const match = line.match(/trackEvent\(\s*["']([A-Za-z0-9_]+)["']/);
    if (!match) return;
    callSites += 1;
    const name = match[1];
    if (!declared.has(name)) {
      problems.push(
        `${relativePath}:${index + 1} reports unknown event "${name}" (declare it in AnalyticsEventMap)`
      );
    }
    used.set(name, (used.get(name) ?? 0) + 1);

    // Inspect the whole call expression (it may span several lines) for
    // parameter keys that would mean user data is being reported.
    let expression = "";
    for (let cursor = index; cursor < lines.length && cursor < index + 12; cursor += 1) {
      expression += lines[cursor];
      if (/\)\s*;?\s*$/.test(lines[cursor])) break;
    }
    for (const key of FORBIDDEN_KEYS) {
      const pattern = new RegExp(`(^|[{,\\s])${key}\\s*:`);
      if (pattern.test(expression)) {
        problems.push(
          `${relativePath}:${index + 1} "${name}" passes a "${key}" parameter - analytics must not carry user data`
        );
      }
    }
  });
}

const unused = [...declared].filter((name) => !used.has(name)).sort();

for (const problem of problems) console.error(`test-analytics: ${problem}`);

console.log(
  `test-analytics: ${declared.size} declared events, ${callSites} call sites, ` +
    `${problems.length} problem${problems.length === 1 ? "" : "s"}`
);
if (unused.length > 0) {
  console.log(`test-analytics: declared but never used: ${unused.join(", ")}`);
}

process.exit(problems.length === 0 ? 0 : 1);
