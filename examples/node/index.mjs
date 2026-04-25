// End-to-end demo: parse a Ktav document, pull out typed fields, walk
// the dynamic shape, then build a fresh document in JS and render it
// back to Ktav text.
//
// Run: node examples/node/index.mjs

import { loads, dumps } from "../../dist/ts/node.js";

const src = `
service: web
port:i 8080
ratio:f 0.75
tls: true
tags: [
    prod
    eu-west-1
]
db.host: primary.internal
db.timeout:i 30
`;

const cfg = loads(src);

// ── 1. Read typed fields straight off the object. ────────────────────
const service = cfg.service;          // string
const port    = cfg.port;             // number (integer)
const ratio   = cfg.ratio;            // number (float)
const tls     = cfg.tls;              // boolean
const tags    = cfg.tags;             // string[]
const dbHost    = cfg.db.host;        // string
const dbTimeout = cfg.db.timeout;     // number

console.log(`service=${service} port=${port} tls=${tls} ratio=${ratio.toFixed(2)}`);
console.log(`tags=[${tags.join(", ")}]`);
console.log(`db: ${dbHost} (timeout=${dbTimeout}s)\n`);

// ── 2. Walk the document, dispatching on the runtime type. ───────────
console.log("shape:");
for (const [k, v] of Object.entries(cfg)) {
  console.log(`  ${k.padEnd(12)} -> ${describe(v)}`);
}

// ── 3. Build a config in code, render it as Ktav text. ───────────────
const doc = {
  name: "frontend",
  port: 8443,
  tls: true,
  ratio: 0.95,
  upstreams: [
    upstream("a.example", 1080),
    upstream("b.example", 1080),
    upstream("c.example", 1080),
  ],
  notes: null,
};

const rendered = dumps(doc);
console.log("\n--- rendered ---");
process.stdout.write(rendered);

function describe(v) {
  if (v === null) return "null";
  if (typeof v === "boolean") return `bool=${v}`;
  if (typeof v === "bigint")  return `bigint=${v}`;
  if (typeof v === "number") {
    return Number.isInteger(v) ? `int=${v}` : `float=${v}`;
  }
  if (typeof v === "string")  return `str=${JSON.stringify(v)}`;
  if (Array.isArray(v))       return `array(${v.length})`;
  if (typeof v === "object")  return `object(${Object.keys(v).length})`;
  return typeof v;
}

function upstream(host, port) {
  return { host, port };
}
