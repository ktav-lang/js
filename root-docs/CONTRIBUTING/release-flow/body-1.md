>>>>> lang=en
## Release flow

Tagged `v*` pushes on `main` kick off `.github/workflows/release.yml`:

1. Builds `.node` binaries for 8 platforms.
2. Builds the two wasm targets.
3. Assembles the `npm/<triple>/` platform subpackages.
4. Publishes each subpackage + the main `ktav` package via npm OIDC
   (no API tokens stored in the repo — the `npm` GitHub environment
   is trusted).

For local dry-runs, `npm pack --dry-run` shows the main tarball;
`npx napi create-npm-dirs --npm-dir npm --dry-run` shows the platform
trees.

>>>>> lang=ru
## Релизный процесс

Теговые пуши `v*` в `main` запускают `.github/workflows/release.yml`:

1. Собирают `.node`-бинарники под 8 платформ.
2. Собирают две wasm-цели.
3. Формируют платформенные подпакеты `npm/<triple>/`.
4. Публикуют каждый подпакет и основной пакет `ktav` через npm OIDC
   (никаких API-токенов в репо — доверенный GitHub-environment `npm`).

Для локальных dry-run-ов: `npm pack --dry-run` показывает основной
тарболл; `npx napi create-npm-dirs --npm-dir npm --dry-run` —
платформенные деревья.

>>>>> lang=zh
## 发布流程

对 `main` 的 `v*` 标签推送会触发 `.github/workflows/release.yml`:

1. 为 8 个平台构建 `.node` 二进制。
2. 构建两个 wasm 目标。
3. 组装 `npm/<triple>/` 平台子包。
4. 通过 npm OIDC 发布各子包与主包 `ktav` (仓库中不存任何 API
   token —— 受信任的 `npm` GitHub environment 代为处理)。

本地 dry-run:`npm pack --dry-run` 展示主 tarball;
`npx napi create-npm-dirs --npm-dir npm --dry-run` 展示平台目录树。

