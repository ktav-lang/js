# Security Policy

**Languages:** **English** · [Русский](SECURITY.ru.md) · [简体中文](SECURITY.zh.md)

## Supported versions

While this package is pre-1.0 only the **latest published minor** is
maintained. Security fixes land on `main` and ship in a PATCH
release within a few days.

| Version | Supported          |
|---------|--------------------|
| 0.1.x   | ✅                 |
| older   | ❌ — upgrade first |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Email **phpcraftdream@gmail.com** with:

- A short description of the vulnerability.
- Steps or a snippet to reproduce it (Ktav input that triggers the
  behaviour, the affected API, expected vs actual).
- The ktav version you observed it on (`npm ls ktav` output is
  usually enough).
- Your disclosure timeline preference, if you have one.

You should get an acknowledgement within **72 hours**. A published
fix typically follows within **a week** for high-impact issues, longer
if the fix needs to coordinate with the Rust crate or the format spec.

## Scope

Issues that count as security problems for this package:

- Out-of-bounds reads / writes or panics in the native `.node` binary
  that crash or hang Node / Bun.
- Runaway memory or CPU when parsing crafted input (both backends).
- Any behaviour that allows crafted Ktav input to escape the expected
  value-domain (arbitrary code execution, prototype pollution on the
  JS side, etc.).

Issues that are **not** security problems here — please use regular
issues for these:

- Performance regressions without crash / hang characteristics.
- Behavioural mismatches between the backends that aren't exploitable.
- Problems in the Ktav format itself — those belong in
  [`ktav-lang/spec`](https://github.com/ktav-lang/spec).
