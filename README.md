# Studyboard

一个为 macOS 设计的视觉学习白板。先看一个小场景，再逐步展开概念、连起关系；在任意位置留下批注，并带着明确的上下文向 AI 提问。

This is an early, local-first macOS MVP. The interface is primarily Chinese. It is not a hosted service.

## 第一版可以做什么

- 多张本地白板，无限平移/缩放、拖动概念、连线及编辑关系标签
- 清晰保留起始问题，逐步展开下一层，手动标记“待探索 / 探索中 / 我能解释”
- 内置、明确标识的浏览器渲染演练：真实改变 CSS 宽度与背景色，观察布局、换行与绘制的区别；记录预测和自己的解释
- 自由批注，或关联概念/关系；每张批注独立对话，显示 AI 将参考的上下文
- AI 回答留在批注里，只有你选择内容后才加入地图
- 任意主题接入真正的 `pi-durable`；未配置密钥时不会伪造 AI 回答
- 结构化过程、组成与对照图由受信任 React 组件绘制，不执行模型生成的代码
- 自动保存、正常退出前保存确认、编辑撤销、适应地图和快捷键

内置演练使用简化的浏览器流水线示意，说明这两个属性的常见行为；它不是浏览器内部性能跟踪器。AI 生成的学习内容可能出错，重要结论请核对可靠来源。

## 本地运行（macOS）

需要 Node.js 22.19.0 或更新版本，推荐 Node 24.19.0。应用锁定 Electron 44.8.0，内嵌 Node 24.22.0，支持 `node:sqlite`。

```sh
npm ci
npm run dev
```

开发进程由 Vite、TypeScript 和 Electron 组成。`npm run dev:web` 只用于界面预览：浏览器本地存储白板，不接收 API 密钥，也不调用 AI。

## 连接真实 AI

打开左下角“连接你的 AI”，填写 API 地址、模型 ID 和你自己的 API 密钥。

- 默认使用 OpenAI，模型 `gpt-4o-mini`，地址 `https://api.openai.com/v1`
- 支持 OpenAI-compatible Chat Completions 的 HTTPS 服务，兼容性取决于服务商
- 密钥只保留在主进程内存中，本版不把它写入磁盘；退出后需重新输入
- 修改到另一个 API 地址时，必须显式提供该地址的密钥，不会暗中复用旧服务商的密钥
- 也可以在启动应用的进程环境中显式设置 `OPENAI_API_KEY`；环境密钥只用于官方 OpenAI 地址
- 设置保存时不会调用模型，也不代表连接已测试。只有主动发出问题时才会请求服务商，可能产生 API 费用

发送问题时，所选服务商会收到：该问题、当前批注的对话历史、原始主题、选定/关联概念或关系及附近分支。其他白板、其他批注的对话和与选区无关的分支不会自动拼接。实际引用在界面中可查看。

真实 AI 运行时精确锁定以下实验性 API：

- `@earendil-works/pi-durable@1.3.0`
- `@earendil-works/pi-ai@1.3.0`
- `@earendil-works/chord@1.3.0`

没有 faux-provider 运行时回退，没有 Shell、文件、浏览器或任意代码执行工具。单元测试中的离线 provider transport 仅用于测试，不能从应用设置启用。

## 保存与恢复

桌面数据保存在 Electron 的 `userData` 目录，macOS 通常为 `~/Library/Application Support/Studyboard/`。从旧名 Learning Atlas 升级时，首次启动会把 `~/Library/Application Support/Learning Atlas/` 里的 `boards/` 和 `ai/` 复制过来（仅当新目录还没有数据时；旧目录保留不删）：

- `boards/`：经过校验的 JSON 白板，串行原子写入
- `ai/`：按白板/批注隔离的 SQLite 对话数据库，真实 durable 历史

正常关闭会先要求界面保存当前白板，再关闭运行时。如果保存失败，关闭会被取消并提示。突然断电/强制结束进程仍可能丢失最后未提交的编辑。完整 AI 对话在 SQLite；白板只缓存最近 200 条消息，每条最多 32,000 字符。所有数据都是本地文件，不提供云同步或本地静态加密。

重新打开会恢复对话，但不会为了恢复旧请求而自动产生新的付费调用。之前未完成的请求保持暂停；在那张批注再次提问时，旧请求会被中止，新问题开始。原来的消息仍保留。

## 快捷键

- `N`：放下自由批注
- `F`：适应全图
- `⌘N`：新白板
- `⌘Z`：撤销地图编辑
- `⌘S`：立即保存
- `⌘Enter`：发送批注问题
- `Esc`：关闭面板/对话框或取消选择
- `/`：问 AI（选中多张卡时，带着这几张一起问）
- 按住 `空格` 拖动：临时平移画布

画布交互：选择工具下，在空白处按住左键拖出框选（碰到即选中）；`Shift`/`⌘`（Windows/Linux 为 `Ctrl`）点击卡片可加入或移出多选，按住修饰键框选会叠加到已有选择。平移不受影响：双指滚动、按住空格拖动、中键/右键拖动，或切到手形工具（`H`）。选中两张以上时顶部出现「已选 N 张卡 · 问 AI · 清除」，问 AI 会新开一段对话，把这些卡都作为上下文；对话里「参考 → 添加卡片」可以搜索整张白板，随时加入或移出卡片。

从节点圆点拖到另一个节点圆点可以新建关系；选中连线可以改标签。右键空白区域也可以放批注。拖动批注标题移动它。

## 检查和构建

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run dist:mac
```

UI 测试需要 Playwright Chromium：`npx playwright install chromium`。可以通过 `PLAYWRIGHT_CHROMIUM_PATH` 指定已安装的 Chromium。

GitHub Actions 工作流会在 macOS 上执行检查、实际 Electron + SQLite + durable reopen smoke、浏览器交互测试，然后构建 Apple Silicon `.dmg` / `.zip` 预览产物。PR 的产物在对应 Actions run 的 Artifacts 下载。成功构建不等于已完成真机试用。

预览产物仅使用 ad-hoc 签名以满足 Apple Silicon 的本地代码完整性要求，尚未配置 Developer ID 签名或 Apple 公证，因此不是正式分发版。正式发布前需由项目所有者配置合法签名/公证流程。

## 下载最新版本

每次合并到 `main`（或在 Actions 页手动运行 “macOS preview”）且全部检查通过后，工作流会把新构建替换到滚动发布 [`latest`](https://github.com/Yaphet2015/studyboard/releases/tag/latest) 上，下载链接保持不变：

- DMG（Apple Silicon）：<https://github.com/Yaphet2015/studyboard/releases/latest/download/Studyboard-arm64.dmg>
- ZIP（Apple Silicon）：<https://github.com/Yaphet2015/studyboard/releases/latest/download/Studyboard-arm64.zip>

构建未经公证，首次打开时 macOS 会拦截。拖到“应用程序”后，在 Finder 中右键点 Studyboard →“打开”，再确认一次即可；或者在终端执行：

```sh
xattr -dr com.apple.quarantine "/Applications/Studyboard.app"
```

只对你信任的、来自本仓库 Releases 的构建这样做。

## 范围与已知限制

- 首版只面向 macOS Apple Silicon；没有宣称支持 Windows/Linux
- 不包含通用 3D 场景、上传材料、网页检索、多人协作或云同步
- 结构化视觉是有限的安全图表，不是任意生成应用
- 当前仅以 API key 连接模型，不包含 OAuth 登录流程
- 无障碍和触控板细节仍需真实 Mac 试用；浏览器预览不是 macOS 验收
- 未选择开源许可；代码公开可阅读，不自动授予额外许可

See [architecture and safety notes](docs/architecture.md) for implementation details.
