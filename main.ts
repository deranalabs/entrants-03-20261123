// SPDX-License-Identifier: MIT
// Hands in the owner's make.fun bounties: checks BOUNTY.json, then copies it to the output folder.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const MAX_FILE_BYTES = 16384;
const MAX_ITEMS = 100;
const MAX_ITEM_CHARS = 2048;
const SLUG = /^[a-z0-9-]+$/;
const ADDRESS = /^https:\/\/make\.fun\/(bounty|c)\/([a-z0-9-]+)$/;

function fail(message: string): never {
  console.error(`BOUNTY.json rejected: ${message}`);
  process.exit(1);
}

function keyOf(item: string): string {
  const match = ADDRESS.exec(item);
  if (match) return match[2];
  if (SLUG.test(item)) return item;
  fail(`"${item}" is not a make.fun bounty address, slug or id`);
}

function check(raw: Buffer): void {
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
}

const botDir = process.env.MAKEFUN_BOT_DIR || "/bot";
const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
const raw = readFileSync(join(botDir, "BOUNTY.json"));
check(raw);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "BOUNTY.json"), raw);
console.log(`BOUNTY.json copied to ${outDir}`);
