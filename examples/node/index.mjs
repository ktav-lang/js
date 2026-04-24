// Node example — uses the N-API native binary directly.
// Run: node examples/node/index.mjs
import { loads, dumps } from "../../dist/ts/node.js";

const src = `
service: ktav-gateway
port:i 8080
ratio:f 0.75
tls: true
tags: [
    production
    eu-west-1
]
db.host: primary.internal
db.timeout:i 30
`;

const cfg = loads(src);
console.log("parsed:", cfg);
console.log("rendered back:\n" + dumps(cfg));
