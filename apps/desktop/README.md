# Desktop（Tauri 2 占位）

Windows 桌面端排在 WebUI 之后，Linux 再往后。本目录还不是 Tauri 工程：没有 `Cargo.toml`，也不打包。

计划中的形态：

- Tauri 2 壳加载 `apps/web` 的构建产物（Tauri 为 MIT / Apache-2.0）。
- 应用启动时拉起 `engine` 里的 Python sidecar，退出时关掉。
- Rust 只负责窗口、sidecar 生命周期和本地文件对话框。图编辑仍在 React 里。

完整的 Rust / `src-tauri` 工程留到桌面阶段再加。不要在这个 beta 里引入 GPL 依赖。

## English

Tauri 2 stub only. No Rust crate and no installer. The later Windows shell will host the web build and spawn the FastAPI sidecar. Linux comes after Windows. Packaging is out of scope for v1.0.0-beta.1.
