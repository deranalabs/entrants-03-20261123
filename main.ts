// SPDX-License-Identifier: MIT
// Hands in the owner's make.fun bounties: checks BOUNTY.json, then copies it to the output folder.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const MAX_FILE_BYTES = 16384;
const MAX_ITEMS = 100;
const MAX_ITEM_CHARS = 2048;
// A slug is lower case letters, digits and hyphens; a lowercase uuid fits the same shape.
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PATH = /^\/(bounty|c)\/([^/]+)\/?$/;

class Rejected extends Error {}

function fail(message: string): never {
  throw new Rejected(message);
}

// Reads one item as the slug it names, the way the gate does.
function keyOf(item: string): string {
  if (SLUG.test(item)) return item;
  let url: URL;
  try {
    url = new URL(item);
  } catch {
    fail(`"${item}" is not a make.fun bounty address, slug or id`);
  }
  const host = url.hostname;
  const onSite = host === "make.fun" || host.endsWith(".make.fun");
  if (!onSite || (url.protocol !== "https:" && url.protocol !== "http:")) {
    fail(`"${item}" is not an address on make.fun`);
  }
  const match = PATH.exec(url.pathname);
  if (!match || !SLUG.test(match[2])) fail(`"${item}" is not /bounty/<slug> or /c/<slug>`);
  return match[2];
}

// Returns the slugs the file names, in order, or throws Rejected.
function check(raw: Buffer): string[] {
  if (raw.length > MAX_FILE_BYTES) fail(`file is ${raw.length} bytes, limit ${MAX_FILE_BYTES}`);
  let data: unknown;
  try {
    data = JSON.parse(raw.toString("utf8"));
  } catch {
    fail("file is not valid JSON");
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) fail("top level must be a JSON object");
  const record = data as Record<string, unknown>;
  const hasList = "bounties" in record;
  const hasUrl = "url" in record;
  if (hasList && hasUrl) fail('name either "bounties" or "url", not both');
  if (!hasList && !hasUrl) fail('missing "bounties" or "url"');
  const items = hasList ? record.bounties : [record.url];
  if (!Array.isArray(items)) fail('"bounties" must be a list');
  if (items.length < 1 || items.length > MAX_ITEMS) fail(`list holds ${items.length} items, allowed 1 to ${MAX_ITEMS}`);
  const seen = new Set<string>();
  for (const item of items) {
    if (typeof item !== "string") fail("every item must be a string");
    if (item.length > MAX_ITEM_CHARS) fail(`an item is ${item.length} characters, limit ${MAX_ITEM_CHARS}`);
    const key = keyOf(item);
    if (seen.has(key)) fail(`"${key}" is named twice`);
    seen.add(key);
  }
  return [...seen];
}

function selftest(): void {
  const ok = (text: string) => check(Buffer.from(text));
  const bad = (text: string) => assert.throws(() => ok(text), Rejected, text);
  const love = "u-deranalabs-make-the-judge-fall-in-love-in-one-line-8e712c13";
  assert.deepEqual(ok(`{"bounties": ["https://make.fun/bounty/${love}"]}`), [love]);
  assert.deepEqual(ok(`{"url": "http://www.make.fun/c/${love}/?ref=x#top"}`), [love]);
  assert.deepEqual(ok('{"bounties": ["0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b"]}'), ["0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b"]);
  bad("not json");
  bad('["a"]');
  bad('{"bounties": [], "url": "a"}');
  bad("{}");
  bad('{"bounties": []}');
  bad(`{"bounties": ${JSON.stringify(Array.from({ length: 101 }, (_, i) => `b${i}`))}}`);
  bad(`{"bounties": ["${"a".repeat(2049)}"]}`);
  bad('{"bounties": ["https://make.fun/bounty/a", "a"]}');
  bad('{"bounties": ["https://evil.example/bounty/a"]}');
  bad('{"bounties": ["https://make.fun/bounty/Upper"]}');
  bad('{"bounties": [7]}');
  bad(`{"bounties": ["a"], "pad": "${"x".repeat(MAX_FILE_BYTES)}"}`);
  // The real file must pass, and every bounty it lists must be a distinct one.
  const real = readFileSync(new URL("./BOUNTY.json", import.meta.url));
  const listed = JSON.parse(real.toString("utf8")).bounties;
  assert.ok(Array.isArray(listed) && listed.length > 0, "the real file names a bounties list");
  assert.equal(check(real).length, listed.length);
  console.log("selftest passed");
}

function run(): void {
  const botDir = process.env.MAKEFUN_BOT_DIR || "/bot";
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  const source = join(botDir, "BOUNTY.json");
  let raw: Buffer;
  try {
    raw = readFileSync(source);
  } catch {
    fail(`cannot read ${source}`);
  }
  const slugs = check(raw);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "BOUNTY.json"), raw);
  console.log(`BOUNTY.json (${slugs.length} bounties) copied to ${outDir}`);
}

try {
  if (process.argv.includes("--selftest")) selftest();
  else run();
} catch (error) {
  if (!(error instanceof Rejected)) throw error;
  console.error(`BOUNTY.json rejected: ${error.message}`);
  process.exit(1);
}
