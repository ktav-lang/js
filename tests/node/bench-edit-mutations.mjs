import assert from "node:assert/strict";
import { platform, arch, versions } from "node:process";
import { cpus } from "node:os";
import * as native from "../../dist/ts/node.js";
import * as pure from "../../dist/ts/pure.js";

const textPath = (parts) => parts.map((part) => part.replace(/\\/g, "\\\\").replace(/\./g, "\\.")).join(".");
const makeWide = (size) => {
  const entries = Array.from({ length: size }, (_, i) => `k${i}: ${i}`);
  const source = `wide: {\n${entries.map((entry) => `    ${entry}`).join("\n")}\n}\n`;
  const tree = { wide: Object.fromEntries(Array.from({ length: size }, (_, i) => [`k${i}`, i])) };
  return {
    name: `wide-${size}`, source, tree,
    target: ["wide", `k${Math.floor(size / 2)}`],
    insert: ["wide", "added", "yes"],
    rename: ["wide", `k${Math.floor(size / 2)}`, "middle"],
    exact: {
      insert: `wide: {\n${entries.map((entry) => `    ${entry}`).join("\n")}\n    added: yes\n}\n`,
      remove: `${entries.filter((_, i) => i !== Math.floor(size / 2)).length ? `wide: {\n${entries.filter((_, i) => i !== Math.floor(size / 2)).map((entry) => `    ${entry}`).join("\n")}\n}\n` : "wide: {}\n"}`,
      rename: `wide: {\n${entries.map((entry, i) => `    ${i === Math.floor(size / 2) ? `middle: ${i}` : entry}`).join("\n")}\n}\n`,
    },
  };
};
const fixtures = [
  { name: "small", source: "a: 1\nb: 2\n", tree: { a: 1, b: 2 }, target: ["a"], insert: ["c", 3], rename: ["a", "renamed"] },
  { name: "nested-array", source: "## nested\nitems: [{name: old, values: [1, 2]}, keep]\n", tree: { items: [{ name: "old", values: [1, 2] }, "keep"] }, target: ["items", "0", "name"], insert: ["items", "0", "extra", 3], rename: ["items", "0", "title"] },
  makeWide(32), makeWide(256),
  { name: "source-layout", source: "\uFEFF## café\r\nname: 雪\r\nlist: [one, two,]\r\n", tree: { name: "雪", list: ["one", "two"] }, target: ["name"], insert: ["extra", "é"], rename: ["name", "label"] },
];
const modes = ["textual", "segments"];
const operations = ["insert", "remove", "rename"];
const apiName = { insert: "insertValue", remove: "removeValue", rename: "renameKey" };
const suffix = { textual: "", segments: "Segments" };
const prepare = (api, fixture, operation, mode) => {
  const fn = api[apiName[operation] + suffix[mode]];
  const segments = operation === "insert" ? fixture.insert.slice(0, -1) : fixture.target;
  const path = mode === "textual" ? textPath(segments) : segments;
  const args = operation === "remove" ? [fixture.source, path] : [fixture.source, path, operation === "insert" ? fixture.insert.at(-1) : fixture.rename.at(-1)];
  return () => fn(...args);
};
const removeAt = (root, path) => {
  let parent = root;
  for (const part of path.slice(0, -1)) parent = Array.isArray(parent) ? parent[Number(part)] : parent[part];
  if (Array.isArray(parent)) parent.splice(Number(path.at(-1)), 1);
  else delete parent[path.at(-1)];
};
const rounds = 5;
const warmups = 10;
const iterations = 100;
const results = [];
for (const fixture of fixtures) for (const operation of operations) for (const mode of modes) {
  const key = `${fixture.name}/${operation}`;
  const expected = fixture.exact?.[operation] ?? ({
    "small/insert": "a: 1\nb: 2\nc: 3\n", "small/remove": "b: 2\n", "small/rename": "renamed: 1\nb: 2\n",
    "nested-array/insert": "## nested\nitems: [{name: old, values: [1, 2], extra: 3}, keep]\n",
    "nested-array/remove": "## nested\nitems: [{values: [1, 2]}, keep]\n",
    "nested-array/rename": "## nested\nitems: [{title: old, values: [1, 2]}, keep]\n",
    "source-layout/insert": "\uFEFF## café\r\nname: 雪\r\nlist: [one, two,]\r\nextra: é\r\n",
    "source-layout/remove": "\uFEFF## café\r\nlist: [one, two,]\r\n",
    "source-layout/rename": "\uFEFF## café\r\nlabel: 雪\r\nlist: [one, two,]\r\n",
  })[key];
  const semantic = structuredClone(fixture.tree);
  if (operation === "insert") { let parent = semantic; const path = fixture.insert.slice(0, -1); for (const part of path.slice(0, -1)) parent = Array.isArray(parent) ? parent[Number(part)] : parent[part]; parent[path.at(-1)] = fixture.insert.at(-1); }
  else if (operation === "remove") removeAt(semantic, fixture.target);
  else { let parent = semantic; for (const part of fixture.target.slice(0, -1)) parent = Array.isArray(parent) ? parent[Number(part)] : parent[part]; const value = parent[fixture.target.at(-1)]; delete parent[fixture.target.at(-1)]; parent[fixture.rename.at(-1)] = value; }
  for (const [backendName, api] of [["native", native], ["pure", pure]]) {
    const output = prepare(api, fixture, operation, mode)();
    assert.equal(output, expected, `${backendName} ${key} ${mode} exact output`);
    assert.deepStrictEqual(api.loads(output), semantic, `${backendName} ${key} ${mode} semantic oracle`);
  }
  const samples = { native: [], pure: [] };
  const calls = { native: prepare(native, fixture, operation, mode), pure: prepare(pure, fixture, operation, mode) };
  for (let round = 0; round < rounds; round++) {
    const order = (round + fixtures.indexOf(fixture) + operations.indexOf(operation) + modes.indexOf(mode)) % 2 ? ["pure", "native"] : ["native", "pure"];
    for (const name of order) {
      const fn = calls[name];
      for (let i = 0; i < warmups; i++) fn();
      const start = process.hrtime.bigint();
      for (let i = 0; i < iterations; i++) fn();
      samples[name].push(Number(process.hrtime.bigint() - start) / iterations);
    }
  }
  const median = (xs) => { const sorted = [...xs].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; };
  results.push({ case: key, mode, sourceBytes: Buffer.byteLength(fixture.source), iterations, warmups, medianNs: { native: median(samples.native), pure: median(samples.pure) }, rawNsPerOp: samples });
}
console.log(JSON.stringify({ benchmark: "edit-mutations", node: versions.node, platform: `${platform}-${arch}`, cpu: cpus()[0]?.model ?? "unknown", logicalCpus: cpus().length, rounds, results }, null, 2));
