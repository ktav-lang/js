>>>>> lang=en
Trade-off: ~3–5× faster than WASM on parse / dump of large
documents; requires a permission grant on Deno; loses Deno's
"works in any sandbox" property. Stick with the default import
unless you've measured a need.

Runnable examples: [`examples/deno/ffi.ts`](examples/deno/ffi.ts),
[`examples/bun/ffi.ts`](examples/bun/ffi.ts).

>>>>> lang=ru
Трейд-офф: ~3–5× быстрее WASM на parse / dump больших документов;
на Deno требует выдачи разрешения; теряет свойство Deno «работает
в любой песочнице». Оставайтесь на импорте по умолчанию, пока не
измерили реальную потребность.

Запускаемые примеры: [`examples/deno/ffi.ts`](../../examples/deno/ffi.ts),
[`examples/bun/ffi.ts`](../../examples/bun/ffi.ts).

>>>>> lang=zh
权衡：在大文档 parse / dump 上比 WASM 快约 3–5 倍；在 Deno 上需要
授权；失去了 Deno“任意沙箱皆可运行”的特性。除非测出真实需求，
否则请保持默认导入。

可运行示例：[`examples/deno/ffi.ts`](../../examples/deno/ffi.ts)、
[`examples/bun/ffi.ts`](../../examples/bun/ffi.ts)。

