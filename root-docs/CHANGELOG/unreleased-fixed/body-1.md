>>>>> lang=en
### Fixed

- N-API: object keys containing U+0000 — legal in spec 0.7 via the new `\uXXXX` escapes — no longer fail with `nul byte found in provided data`; key set/get now goes through the JsString-based property APIs instead of the CString-backed named-property calls.

>>>>> lang=ru
### Исправлено

- N-API: ключи объектов, содержащие U+0000 — допустимые в spec 0.7
  благодаря новым escape-последовательностям `\uXXXX` — больше не
  завершаются ошибкой `nul byte found in provided data`; установка и
  чтение ключей теперь идут через property-API на основе JsString
  вместо вызовов именованных свойств через CString.

>>>>> lang=zh
### 修复

- N-API：包含 U+0000 的对象键 —— 在 spec 0.7 中通过新增的 `\uXXXX`
  转义合法 —— 不再因 `nul byte found in provided data` 失败；键的
  设置/读取现在走基于 JsString 的 property API，而不是基于 CString
  的命名属性调用。

