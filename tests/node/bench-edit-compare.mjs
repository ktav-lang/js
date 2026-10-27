import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { platform, arch, versions, hrtime, env } from "node:process";
import { cpus } from "node:os";

const [baseArg, candidateArg] = process.argv.slice(2);
if (!baseArg || !candidateArg) throw new Error("Usage: node tests/node/bench-edit-compare.mjs <base-pure.js> <candidate-pure.js>");
const paths = [baseArg, candidateArg].map((p) => resolve(p));
const [base, candidate] = await Promise.all(paths.map((p) => import(pathToFileURL(p).href)));
const textPath = (parts) => parts.map((part) => part.replace(/\\/g, "\\\\").replace(/\./g, "\\.")).join(".");
const wide = (n) => {
  const entries = Array.from({ length: n }, (_, i) => `k${i}: ${i}`);
  return { name: `wide-${n}`, source: `wide: {\n${entries.map((e) => `    ${e}`).join("\n")}\n}\n`, tree: { wide: Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, i])) }, target: ["wide", `k${Math.floor(n / 2)}`], insert: ["wide", "added", "yes"], rename: ["wide", `k${Math.floor(n / 2)}`, "middle"], exact: {
    insert: `wide: {\n${entries.map((e) => `    ${e}`).join("\n")}\n    added: yes\n}\n`,
    remove: `wide: {\n${entries.filter((_, i) => i !== Math.floor(n / 2)).map((e) => `    ${e}`).join("\n")}\n}\n`,
    rename: `wide: {\n${entries.map((e, i) => i === Math.floor(n / 2) ? `    middle: ${i}` : `    ${e}`).join("\n")}\n}\n`,
  } };
};
const fixtures = [
  { name: "small", source: "a: 1\nb: 2\n", tree: { a: 1, b: 2 }, target: ["a"], insert: ["c", 3], rename: ["a", "renamed"], exact: { insert: "a: 1\nb: 2\nc: 3\n", remove: "b: 2\n", rename: "renamed: 1\nb: 2\n" } },
  { name: "nested-array", source: "## nested\nitems: [{name: old, values: [1, 2]}, keep]\n", tree: { items: [{ name: "old", values: [1, 2] }, "keep"] }, target: ["items", "0", "name"], insert: ["items", "0", "extra", 3], rename: ["items", "0", "title"], exact: { insert: "## nested\nitems: [{name: old, values: [1, 2], extra: 3}, keep]\n", remove: "## nested\nitems: [{values: [1, 2]}, keep]\n", rename: "## nested\nitems: [{title: old, values: [1, 2]}, keep]\n" } },
  wide(32), wide(256),
  { name: "source-layout", source: "\uFEFF## café\r\nname: 雪\r\nlist: [one, two,]\r\n", tree: { name: "雪", list: ["one", "two"] }, target: ["name"], insert: ["extra", "é"], rename: ["name", "label"], exact: { insert: "\uFEFF## café\r\nname: 雪\r\nlist: [one, two,]\r\nextra: é\r\n", remove: "\uFEFF## café\r\nlist: [one, two,]\r\n", rename: "\uFEFF## café\r\nlabel: 雪\r\nlist: [one, two,]\r\n" } },
];
const operations = ["insert", "remove", "rename"], modes = ["textual", "segments"];
const api = { insert: "insertValue", remove: "removeValue", rename: "renameKey" };
function semantic(f, op) {
  const out = structuredClone(f.tree), path = op === "insert" ? f.insert.slice(0, -1) : f.target;
  let parent = out;
  for (const part of path.slice(0, -1)) parent = Array.isArray(parent) ? parent[Number(part)] : parent[part];
  const key = path.at(-1);
  if (op === "insert") parent[key] = f.insert.at(-1);
  else if (op === "remove") { if (Array.isArray(parent)) parent.splice(Number(key), 1); else delete parent[key]; }
  else { const value = parent[key]; delete parent[key]; parent[f.rename.at(-1)] = value; }
  return out;
}
function callFor(mod, f, op, mode) {
  const path = op === "insert" ? f.insert.slice(0, -1) : f.target;
  const fn = mod[api[op] + (mode === "segments" ? "Segments" : "")];
  assert.equal(typeof fn, "function", `missing ${api[op]} API`);
  const argumentPath = mode === "textual" ? textPath(path) : path;
  const args = op === "remove" ? [f.source, argumentPath] : [f.source, argumentPath, op === "insert" ? f.insert.at(-1) : f.rename.at(-1)];
  return () => fn(...args);
}
const cases = [];
for (const f of fixtures) for (const op of operations) for (const mode of modes) {
  const expected = f.exact[op], value = semantic(f, op);
  for (const [name, mod] of [["base", base], ["candidate", candidate]]) {
    const output = callFor(mod, f, op, mode)();
    assert.equal(output, expected, `${name} ${f.name}/${op}/${mode} exact oracle`);
    assert.deepStrictEqual(mod.loads(output), value, `${name} ${f.name}/${op}/${mode} semantic oracle`);
  }
  cases.push({ fixture: f, op, mode });
}
const rounds = 7, warmups = 15, iterations = 100;
const results = cases.map(({ fixture, op, mode }, index) => {
  const calls = { base: callFor(base, fixture, op, mode), candidate: callFor(candidate, fixture, op, mode) };
  const samples = { base: [], candidate: [] };
  for (let r = 0; r < rounds; r++) {
    for (const name of (r + index) % 2 ? ["candidate", "base"] : ["base", "candidate"]) {
      const fn = calls[name];
      for (let i = 0; i < warmups; i++) fn();
      const start = hrtime.bigint();
      for (let i = 0; i < iterations; i++) fn();
      samples[name].push(Number(hrtime.bigint() - start) / iterations);
    }
  }
  const median = (values) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; };
  return { case: `${fixture.name}/${op}/${mode}`, sourceBytes: Buffer.byteLength(fixture.source), rounds, warmups, iterations, medianNsPerOp: { base: median(samples.base), candidate: median(samples.candidate) }, rawNsPerOp: samples };
});
console.log(JSON.stringify({ benchmark: "edit-base-candidate", node: versions.node, v8: versions.v8, githubSha: env.GITHUB_SHA, runId: env.GITHUB_RUN_ID, platform: `${platform}-${arch}`, cpu: cpus()[0]?.model ?? "unknown", logicalCpus: cpus().length, paths: { base: paths[0], candidate: paths[1] }, rounds, warmups, iterations, results }, null, 2));
