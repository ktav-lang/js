>>>>> lang=en
### Build & render — construct a document in code

```ts
const doc = {
  name:  "frontend",
  port:  8443,
  tls:   true,
  ratio: 0.95,
  upstreams: [
    { host: "a.example", port: 1080 },
    { host: "b.example", port: 1080 },
  ],
  notes: null,
};
const text = dumps(doc);
// name: frontend
// port: 8443
// tls: true
// ratio: 0.95
// upstreams: [
//     { host: a.example  port: 1080 }
//     { host: b.example  port: 1080 }
// ]
// notes: null
```

A complete runnable Node example lives in [`examples/node/index.mjs`](examples/node/index.mjs).

>>>>> lang=ru
### Сборка и рендер — строим документ в коде

```ts
const doc = {
  name:  "frontend",
  port:  8443,
  tls:   true,
  ratio: 0.95,
  upstreams: [
    { host: "a.example", port: 1080 },
    { host: "b.example", port: 1080 },
  ],
  notes: null,
};
const text = dumps(doc);
// name: frontend
// port: 8443
// tls: true
// ratio: 0.95
// upstreams: [
//     { host: a.example  port: 1080 }
//     { host: b.example  port: 1080 }
// ]
// notes: null
```

Полный запускаемый пример для Node — в [`examples/node/index.mjs`](../../examples/node/index.mjs).

>>>>> lang=zh
### 构建并渲染 —— 用代码搭建文档

```ts
const doc = {
  name:  "frontend",
  port:  8443,
  tls:   true,
  ratio: 0.95,
  upstreams: [
    { host: "a.example", port: 1080 },
    { host: "b.example", port: 1080 },
  ],
  notes: null,
};
const text = dumps(doc);
// name: frontend
// port: 8443
// tls: true
// ratio: 0.95
// upstreams: [
//     { host: a.example  port: 1080 }
//     { host: b.example  port: 1080 }
// ]
// notes: null
```

完整可运行的 Node 示例见 [`examples/node/index.mjs`](../../examples/node/index.mjs)。

