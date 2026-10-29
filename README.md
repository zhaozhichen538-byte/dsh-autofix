# dsh-autofix

DeepSeek Harness（DSH）桌面版 profile 的**宿主包 shim 生成器 + 自动修复启动器**。

解决的问题：profile 里的外部插件（onebot、dsh-ops、dsh-remembers 等）直接 `import '@deepseek-ai/dsh-tools'`、`dsh-agent`、`dsh-llm` 时，Node 从 profile 里找不到 `app.asar` 内的宿主包；而把宿主包**实体复制**进 profile 又会产生第二份有状态模块实例，导致：

- 所有工具报 `Cannot read properties of undefined (reading 'prepare')`
- 所有预设报 `prompt section ... already registered`（加载失败）

这个仓库用 **re-export shim** 解决：profile 里的每个宿主包只做转发，指向 `app.asar` 里的同一份实现，宿主和插件共享同一个模块实例。

> 这是本地兼容层，不是 DSH 官方修复。适用于 Windows + DSH `0.2.1-rc.2` 附近版本。详细原理见 [docs/root-cause.md](docs/root-cause.md)。

## 文件

| 文件 | 作用 |
|---|---|
| `dsh-host-shims.js` | 生成 35 个 `@deepseek-ai/*` re-export shim，写入 profile 的 `node_modules` |
| `start-dsh.cmd` | 启动器：DSH 未运行则先生成 shim，再启动；已运行则只唤起 |
| `install-shortcut.ps1` | 创建/更新桌面快捷方式（可选开始菜单） |
| `uninstall-shortcut.ps1` | 删除快捷方式 |
| `config.example.cmd` | 本地配置模板（DSH 路径、ASAR/Profile 路径覆盖） |
| `docs/root-cause.md` | 根因与设计说明 |

## 环境要求

- Windows 10/11
- DSH 已安装，默认路径：`D:\deepseek\DeepSeek Harness.exe`
- 无需单独安装 Node：脚本通过 `ELECTRON_RUN_AS_NODE=1` 复用 DSH 自带的 Electron/Node
- PowerShell 5.1+（安装快捷方式用）

## 快速开始

1. 把本仓库放到一个固定位置，例如：

   ```text
   D:\deepseek\dsh-autofix
   ```

2. 如果 DSH 不在默认路径，复制配置模板并修改：

   ```cmd
   copy config.example.cmd config.cmd
   notepad config.cmd
   ```

3. 安装桌面快捷方式：

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\install-shortcut.ps1
   ```

   默认名称：`DeepSeek Harness (AutoFix)`。  
   原来的 `DeepSeek Harness.lnk` 不会被覆盖。

   也可以创建到开始菜单：

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\install-shortcut.ps1 -StartMenu
   ```

4. 以后用桌面上的 **DeepSeek Harness (AutoFix)** 启动 DSH。

## 启动器行为

- **DSH 没在运行**：先生成/修复宿主包 shim，然后启动 DSH。
- **DSH 已在运行**：只唤起现有进程，不改 `node_modules`。
- **shim 生成失败**：窗口停住并显示错误，不会继续启动。
- 生成过程通常不到一秒，控制台会闪一下。

## 手动运行

不通过启动器时，可以先完全退出 DSH，再执行：

```bash
ELECTRON_RUN_AS_NODE=1 "D:\deepseek\DeepSeek Harness.exe" "D:\deepseek\dsh-autofix\dsh-host-shims.js" --apply
```

不加 `--apply` 是 dry-run，只打印将要生成哪些 shim。

可用环境变量覆盖路径：

```bash
set DSH_ASAR=D:\deepseek\resources\app.asar\dsh\node_modules
set DSH_PROFILE=%USERPROFILE%\.dsh\profiles\desktop\node_modules
```

## 什么时候需要重新生成

**只在插件依赖发生变化后**需要，例如：

- 在 DSH 里安装、更新、卸载插件
- 插件管理器执行了 `pnpm install` / `pnpm update`
- `node_modules` 被重建

正常启动 DSH、聊天、使用工具都不需要手动跑。

原因是 shim 不在 `package.json` / `pnpm-lock.yaml` 里，pnpm 会把它们当“多余包”清掉。用 `start-dsh.cmd` 启动可以自动补回来。

## 故障排查

| 现象 | 处理 |
|---|---|
| 所有工具报 `reading 'prepare'` | 检查 profile 的 `@deepseek-ai/cordis`、`dsh-tools` 是否被换成了实体副本；重新跑 `dsh-host-shims.js --apply`，然后重启 DSH |
| 所有预设“加载失败”，报 `prompt section ... already registered` | 同上：确保是 shim 而不是复制包；重启 DSH。若仍报，检查 `agent-preset-registry` 的 `selectedDefault` 与自定义 QQ preset 是否冲突 |
| `cannot resolve profile bundle "某插件"` | 这是 bundle 本身缺失，不是宿主包问题。用 DSH 插件设置修复/重装该插件；`link:` 依赖还需要重建链接 |
| `dsh-bili-scroll: no loader entry matched` | 插件管理器开关的已知边界情况。先别点这个开关；保持关闭即可 |
| DSH 启动不了 | 先看启动器窗口的错误；再检查 `%USERPROFILE%\.dsh\profiles\desktop\node_modules\@deepseek-ai` 是否可读。必要时用备份目录回滚（见下） |

## 回滚与备份

手动修复时曾在 profile 里留下实体副本备份（如果存在）：

```text
%USERPROFILE%\.dsh\profiles\desktop\node_modules\@deepseek-ai.copies-backup-*
```

**不建议回滚到实体副本**，因为那会重新引入双实例问题。备份仅用于检查/应急。正确状态是：`@deepseek-ai/*` 全部为几行的 re-export shim。

## 设计说明

- shim 只转发，不复制实现；ESM 包用 `export * from 'file:///...app.asar/...'`，CJS 包用 `module.exports = require('...')`。
- 每个包只生成根入口 `index.js`。当前插件只 import 包根；如果未来插件 import 子路径，需要为对应子路径补 shim。
- `seeds` 列表覆盖当前插件直接 import 的宿主包；DSH/插件升级后如有新增，补进列表即可。
- shim 的 `package.json` 保留宿主包名和版本，`exports` 只暴露根入口与 `./package.json`。
- 启动器通过 `%~dp0` 定位脚本，仓库可以整体搬家；DSH 路径在 `config.cmd` 覆盖。

## 已知限制

- 不是 DSH 官方方案；DSH 升级后 `app.asar` 内部布局、包名或入口可能变化。
- 依赖 DSH 安装路径中的 `resources\app.asar\dsh\node_modules`。
- 每次插件安装/更新后仍需重新生成（启动器已自动处理）。
- 不修复插件自身的 bundle 缺失、`link:` 依赖丢失或插件管理器开关 bug。

## 长期正解

希望 DSH 或插件作者后续提供以下任一能力，届时本仓库可以退休：

1. DSH 给 profile 插件提供 `@deepseek-ai/*` 的共享模块解析/import map；
2. 插件声明宿主包为 peerDependencies，由 DSH 注入同一实例；
3. 插件不再直接 import 宿主内部包，改用 `ctx` 服务 API。

## License

仓库暂未附带许可证。发布到公开平台前请自行选择并添加 LICENSE。
