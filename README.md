# Studyboard

把一个问题拆成一棵概念树，在卡片上带着上下文向 AI 提问的 macOS 学习白板。

A local-first visual learning canvas for macOS. The interface is in Chinese. It is not a hosted service.

<picture>
	<source media="(prefers-color-scheme: dark)" srcset="docs/images/hero-dark.png">
	<img alt="Studyboard：左侧是画布列表，中间是从起点问题展开的概念树，右侧抽屉里是一段针对「怎么赔」这张卡的 AI 对话" src="docs/images/hero-light.png">
</picture>

## 能做什么

- **概念树。** 每张白板从一个起点问题开始，向下拆子概念，向右加并列概念，卡片按 §1、§1.2 自动编号。起点之上还能加一个更大的问题，旁边也能再放几个并列的起点问题，编号为 §B、§B1。
- **理解进度。** 每张卡标记为待探索、探索中或我能解释。「走一遍」按顺序逐张复习整张白板。
- **AI 提示。** 鼠标在卡片上停留约 0.6 秒，`+` 旁会出现一个淡色的下一步建议，点一下就生成那张卡。每张卡只请求一次，结果缓存在卡片上。没有配置 AI 时不出现提示，也不发请求。
- **带上下文的对话。** 在卡片上按 `/` 开一段对话。选中的卡片会一起作为上下文发给 AI，AI 实际参考了哪些内容会显示在对话里。每段对话是右侧抽屉里的一个标签，一张卡可以有多段对话。
- **答案不会自动改地图。** AI 的回答留在对话里，只有你点「把回答加进地图」才会变成卡片。
- **结构化图示。** 过程、组成和对照图由应用内置的 React 组件绘制，不执行模型生成的代码。
- **导入与导出。** 可导出可重新导入的学习数据（`.studyboard.json`，含完整对话），也可导出 Markdown 和整张图的 PNG。
- **本地优先。** 自动保存、撤销、深浅色主题和设置页（`⌘.`）都在本地完成。只有你提问时才会联网，而且只连你配置的 AI 服务商。

首次启动会打开一张内置演练白板：通过真实修改 CSS 宽度和背景色，观察布局、换行与绘制的区别。演练用的是简化的浏览器流水线示意，不是浏览器的性能跟踪工具。AI 生成的内容可能出错，重要结论请向可靠来源核对。

## 下载

每次合并到 `main` 且检查通过后，GitHub Actions 会更新滚动发布 [`latest`](https://github.com/Yaphet2015/studyboard/releases/tag/latest)。下载链接保持不变：

- [Studyboard-arm64.dmg](https://github.com/Yaphet2015/studyboard/releases/latest/download/Studyboard-arm64.dmg)（Apple Silicon）
- [Studyboard-arm64.zip](https://github.com/Yaphet2015/studyboard/releases/latest/download/Studyboard-arm64.zip)（Apple Silicon）

构建只做了 ad-hoc 签名，没有 Developer ID 签名，也没有经过 Apple 公证，所以首次打开时 macOS 会拦截。把 Studyboard 拖进「应用程序」后，先打开一次，再到「系统设置 → 隐私与安全性」点「仍要打开」。也可以在终端里移除隔离标记：

```sh
xattr -dr com.apple.quarantine "/Applications/Studyboard.app"
```

只对来自本仓库 Releases 的构建这样做。

## 连接 AI

按 `⌘.` 打开设置页（其他系统为 `Ctrl+.`，也可以用 `⌘K` 或 macOS 应用菜单里的「Settings…」），在「AI 服务」中填写 API 地址、模型 ID 和你自己的 API 密钥，再点「测试连接」。

- 默认地址为 `https://api.openai.com/v1`，默认模型为 `gpt-4o-mini`。任何兼容 OpenAI Chat Completions 的 HTTPS 服务都可以用，能否用通取决于服务商。
- 密钥只需输入一次。主进程用 Electron `safeStorage` 加密后写入 `ai/key.json`，加密用的密钥由 macOS 钥匙串保管。界面上只显示遮盖后的末四位，例如 `sk-••••a1b2`，可以「更换」或「清除」。
- 如果系统钥匙串不可用，设置页会明确提示。这时密钥只保留到退出应用，不会以明文写入磁盘。
- 换成另一个 API 地址时，需要重新填写该地址的密钥，旧密钥不会被带过去。
- 启动应用的环境变量里有 `OPENAI_API_KEY` 时，应用会使用它，但只用于官方 OpenAI 地址。
- 保存设置不会调用模型。只有「测试连接」和你主动提问会请求服务商，可能产生 API 费用。

提问时，服务商会收到：这个问题、当前对话的历史、白板的起点问题、选中和关联的卡片或关系，以及它们附近的分支和整张白板的提纲。其他白板和其他对话不会被发送。

AI 运行时精确锁定 `@earendil-works/pi-durable`、`@earendil-works/pi-ai` 和 `@earendil-works/chord` 的 1.3.0 版本。模型没有 Shell、文件、浏览器或执行代码的工具。

## 快捷键

设置页的「快捷键」一节列出同一份清单，来源是 `src/model/shortcuts.ts`。下表中的 `⌘` 在其他系统上是 `Ctrl`。

| 按键                  | 作用                             |
| --------------------- | -------------------------------- |
| `V` / `H`             | 选择工具 / 平移工具              |
| 按住 `空格` 拖动      | 临时平移                         |
| `L`                   | 连线工具                         |
| `0`                   | 查看全图                         |
| `Shift` 或 `⌘` + 点击 | 多选卡片                         |
| `Tab`                 | 加子概念                         |
| `Enter`               | 加并列概念                       |
| `F2`                  | 改标题                           |
| `1` / `2` / `3`       | 标记为待探索 / 探索中 / 我能解释 |
| `⌫`                   | 删除选中                         |
| `F`                   | 走一遍                           |
| `/`                   | 问 AI，带上选中的卡片            |
| `N`                   | 批注                             |
| `⌘Enter`              | 发送提问                         |
| `⌘K`                  | 切换白板，搜索命令               |
| `⌘\`                  | 展开或收起左侧边栏               |
| `⌘N`                  | 新白板                           |
| `⌘Z`                  | 撤销                             |
| `⌘S`                  | 立即保存                         |
| `⌘.`                  | 设置                             |
| `D`                   | 切换深浅色                       |
| `Esc`                 | 关闭面板，取消选择               |

在空白处拖动可以框选。双指滚动、中键或右键拖动都可以平移画布。

## 数据保存在哪里

桌面版的数据在 Electron 的 `userData` 目录，在 macOS 上是 `~/Library/Application Support/Studyboard/`：

- `boards/`：经过校验的 JSON 白板文件，按顺序原子写入。
- `ai/`：每段对话一个 SQLite 数据库，保存完整的 durable 历史，以及加密后的密钥 `key.json`。

正常退出前，应用会先保存当前白板。保存失败时，退出会被取消并提示。断电或强制结束进程仍可能丢失最后一次未保存的编辑。白板文件里只缓存每段对话最近 200 条消息，完整历史在 SQLite 中。重新打开应用会恢复对话，但不会自动重发之前未完成的请求。数据只在本机，没有云同步。

**从 Learning Atlas 升级。** 应用以前叫 Learning Atlas。如果新目录里还没有数据，首次启动时会把 `~/Library/Application Support/Learning Atlas/` 中的 `boards/` 和 `ai/` 复制过来，旧目录保持不动。代码在 `electron/legacy-data.ts`。

**导入与导出。** 左侧边栏底部有「导入画板」和「导出当前画板」，`⌘K` 里也能搜到。只有 `.studyboard.json` 可以重新导入：导入会新建一张白板，并把对话历史恢复到新的 SQLite 数据库，不包含 API 密钥。Markdown 和 PNG 用于阅读和展示。导入文件最大 64 MB。

`pnpm dev:web` 的网页预览把白板存在浏览器本地存储里，不接收 API 密钥，也不调用 AI。

## 本地开发

需要 Node.js 22.19.0 或更新版本。包管理器是 pnpm，版本锁定在 `package.json` 的 `packageManager` 字段，运行 `corepack enable` 即可启用。

```sh
pnpm install
pnpm dev
```

`pnpm dev` 会同时启动 Vite、TypeScript 监听编译和 Electron。只想看界面时，运行 `pnpm dev:web`，然后打开 <http://127.0.0.1:5173>。

| 脚本             | 作用                                                 |
| ---------------- | ---------------------------------------------------- |
| `pnpm dev`       | 启动桌面版开发环境                                   |
| `pnpm dev:web`   | 只启动浏览器预览，不接 AI                            |
| `pnpm typecheck` | 检查界面和 Electron 两套 TypeScript 配置             |
| `pnpm build`     | 构建界面到 `dist/`，构建主进程到 `dist-electron/`    |
| `pnpm test`      | 运行 Vitest 单元测试                                 |
| `pnpm test:e2e`  | 运行 Playwright 端到端测试                           |
| `pnpm dist:mac`  | 打包 Apple Silicon 的 `.dmg` 和 `.zip` 到 `release/` |
| `pnpm format`    | 用 Prettier 格式化代码和文档                         |

## 测试

```sh
pnpm typecheck
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
```

`tests/*.test.ts` 是 Vitest 单元测试，覆盖布局、编辑、上下文、迁移和 AI 运行时等模块。`tests/e2e/` 是 Playwright 测试，用 `tests/e2e/fake-atlas.ts` 模拟主进程和 AI，在浏览器预览中运行。已安装 Chromium 时，可以用 `PLAYWRIGHT_CHROMIUM_PATH` 指定它的路径。`electron.spec.ts` 和 `electron-transfer.spec.ts` 启动真实的 Electron，只在 macOS 上运行，其他系统会跳过。

GitHub Actions 的「macOS preview」工作流在 macOS 上运行类型检查、单元测试和构建，再验证 Electron 内置的 Node、SQLite 和 durable 历史在重启后能恢复，运行画布交互测试，最后打包并验证 `.dmg` 和 `.zip`。

## 技术栈

- Electron 44（内置 Node 24，用 `node:sqlite` 保存对话）
- React 19、TypeScript 5.9、Vite 7
- `@xyflow/react` 12 绘制画布
- `@earendil-works/pi-durable`、`pi-ai` 和 `chord` 1.3.0 负责 AI 对话和可恢复的历史
- zod 4 校验白板文件和进程间消息
- Vitest 4、Playwright 1.58
- electron-builder 26 打包
- 字体 LXGW WenKai（霞鹜文楷），图标 Lucide

## 项目结构

```text
electron/          主进程：窗口与菜单、白板存储、AI 运行时、密钥加密、旧数据迁移
src/
	App.tsx          应用状态、快捷键和 AI 请求
	components/      画布卡片、抽屉、设置页、走一遍、导出等界面组件
	model/           不依赖界面的逻辑：布局、编辑、编号、上下文、对话、AI 提示
	shared/          两个进程共用的类型、zod 校验和导入导出格式
tests/             Vitest 单元测试
tests/e2e/         Playwright 端到端测试
docs/              架构与安全说明、设计记录、README 图片
```

实现细节和安全边界见 [架构与安全说明](docs/architecture.md)。对话抽屉动效的来源见 [docs/drawer-streaming.md](docs/drawer-streaming.md)。

## 已知限制

- 只支持 macOS Apple Silicon，没有在 Windows 或 Linux 上测试过。
- 不支持上传资料、网页检索、多人协作或云同步。
- 只能用 API 密钥连接模型，没有 OAuth 登录。
- 无障碍和触控板细节需要在真机上试用，浏览器预览不能代替 macOS 验收。

## 许可

本项目没有选择开源许可。仓库里没有 LICENSE 文件，`package.json` 中写的是 `UNLICENSED`。代码公开可读，但不授予任何额外权利。

随应用打包的第三方资源：

- LXGW WenKai 和 LXGW WenKai Mono 字体，SIL Open Font License 1.1。全文在设置页的「关于与许可」中，也在 `node_modules/lxgw-wenkai-webfont/OFL.txt`。字体通过 MIT 许可的 `lxgw-wenkai-webfont` 包引入。
- Lucide 图标，ISC 许可。
- 对话抽屉的思考和流式动效参考了 [Beautiful UI](https://github.com/slev12397/beautiful-ui)（MIT，© 2026 Shane Levine）。只借鉴了设计模式，没有复制代码。
