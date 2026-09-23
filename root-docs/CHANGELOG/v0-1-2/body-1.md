>>>>> lang=en
## 0.1.2 — Bun FFI fixes + package-lock sync

Patch release on top of 0.1.1.

### Fixed

- `bun:ffi` out-parameter handling. The 0.1.1 implementation
  wrapped `Uint8Array` / `BigUint64Array` arguments in
  `ffi.ptr()`; that returns a plain number, which Bun's
  `FFIType.ptr` argument refuses to accept ("Unable to convert N
  to a pointer"). Pass `TypedArray` / `Buffer` instances
  **directly** — Bun auto-pins their backing buffer and forwards
  the address. Read out-pointers as `Number(BigUint64Array[0])`,
  unwrap data via `ffi.toArrayBuffer(ptr, 0, len)`.
- `package-lock.json` synced to the bumped subpackage versions —
  `npm ci` no longer fails with `EUSAGE` on fresh clones.

>>>>> lang=ru
## 0.1.2 — фиксы Bun FFI + sync package-lock

Patch-релиз поверх 0.1.1.

### Исправлено

- Обработка out-параметров `bun:ffi`. В 0.1.1 аргументы
  `Uint8Array` / `BigUint64Array` оборачивались в `ffi.ptr()`;
  тот возвращает `number`, а Bun'овский `FFIType.ptr` отказывается
  принимать сырое число ("Unable to convert N to a pointer").
  Теперь `TypedArray` / `Buffer` передаются **напрямую** — Bun
  автоматически пинит backing-buffer и передаёт адрес.
  Out-pointer'ы читаются как `Number(BigUint64Array[0])`,
  данные распаковываются через `ffi.toArrayBuffer(ptr, 0, len)`.
- `package-lock.json` синхронизирован с забампленными версиями
  subpackages — `npm ci` больше не падает с `EUSAGE` на свежих
  клонах.

>>>>> lang=zh
## 0.1.2 —— Bun FFI 修复 + package-lock 同步

0.1.1 的补丁版本。

### 修复

- `bun:ffi` 的 out 参数处理。0.1.1 把 `Uint8Array` /
  `BigUint64Array` 包在 `ffi.ptr()` 里；后者返回 `number`，
  而 Bun 的 `FFIType.ptr` 拒绝接受裸 number
  ("Unable to convert N to a pointer")。现在 `TypedArray` /
  `Buffer` 实例 **直接** 传入 —— Bun 自动 pin 其底层缓冲并转发
  地址。out-pointer 通过 `Number(BigUint64Array[0])` 读取，
  数据通过 `ffi.toArrayBuffer(ptr, 0, len)` 解包。
- `package-lock.json` 已与升版后的 subpackage 版本同步 ——
  `npm ci` 在新 clone 上不再因 `EUSAGE` 报错。

