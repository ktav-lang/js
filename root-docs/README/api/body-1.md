>>>>> lang=en
## Public API

```ts
function loads<T = KtavValue>(s: string): T;
function loadsStrict<T = KtavValue>(s: string): T;
function dumps<T extends KtavInput = KtavInput>(obj: T): string;
function stringifyForceStrings<T extends KtavInput = KtavInput>(obj: T): string;
function format(s: string): string;
function canonicalFromSource(s: string): string;
function emitCanonical<T extends KtavInput = KtavInput>(obj: T): string;

// web / Deno / browser only; Node + Bun ignore it
function ready(input?: URL | Response | ArrayBuffer): Promise<void>;
```

>>>>> lang=ru
## Публичный API

```ts
function loads<T = KtavValue>(s: string): T;
function loadsStrict<T = KtavValue>(s: string): T;
function dumps<T extends KtavInput = KtavInput>(obj: T): string;
function stringifyForceStrings<T extends KtavInput = KtavInput>(obj: T): string;
function format(s: string): string;
function canonicalFromSource(s: string): string;
function emitCanonical<T extends KtavInput = KtavInput>(obj: T): string;

// web / Deno / browser only; Node + Bun ignore it
function ready(input?: URL | Response | ArrayBuffer): Promise<void>;
```

>>>>> lang=zh
## 公开 API

```ts
function loads<T = KtavValue>(s: string): T;
function loadsStrict<T = KtavValue>(s: string): T;
function dumps<T extends KtavInput = KtavInput>(obj: T): string;
function stringifyForceStrings<T extends KtavInput = KtavInput>(obj: T): string;
function format(s: string): string;
function canonicalFromSource(s: string): string;
function emitCanonical<T extends KtavInput = KtavInput>(obj: T): string;

// web / Deno / browser only; Node + Bun ignore it
function ready(input?: URL | Response | ArrayBuffer): Promise<void>;
```

