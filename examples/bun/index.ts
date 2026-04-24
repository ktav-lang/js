// Bun example — resolves to the N-API binary through the same
// `exports` map as Node. Run: bun examples/bun/index.ts
import { loads, dumps } from "../../dist/ts/node.js";

interface Config {
    service: string;
    port: number;
    tls: boolean;
    tags: string[];
    db: { host: string; timeout: number };
}

const src = `
service: ktav-gateway
port:i 8080
tls: true
tags: [
    production
    eu-west-1
]
db.host: primary.internal
db.timeout:i 30
`;

const cfg = loads<Config>(src);
console.log(`[bun] service=${cfg.service} port=${cfg.port} tls=${cfg.tls}`);
console.log(`[bun] rendered:\n${dumps(cfg)}`);
