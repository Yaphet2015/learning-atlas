# Studyboard 搜索与分享配置

[返回 README](../README.md)

## 当前公开入口

Studyboard 是桌面应用。仓库中没有独立官网、公开站点域名或网站部署流程，主要公开入口是 [GitHub 仓库](https://github.com/Yaphet2015/studyboard)。当前优化覆盖 README 内容、项目元数据，以及浏览器预览入口的标题、摘要和分享标签。

`index.html` 的标签只影响应用入口；GitHub 仓库页面的标题、摘要和分享卡由 GitHub 管理。修改本地 HTML 或 `package.json` 不会同步修改 GitHub About、Topics 或 Social preview。

## GitHub About 与 Topics

仓库的 About 简介已设置为：

> A local-first AI learning canvas for macOS. Build concept maps, ask questions with selected context, and export to Markdown or PNG. 本地优先的 AI 视觉学习白板。

仓库已设置以下 Topics：

```text
visual-learning
ai-learning
concept-map
knowledge-map
whiteboard
local-first
macos
electron
react
typescript
```

以上简介与 Topics 已于 2026-10-19 通过 GitHub CLI 应用并读取确认。后续修改仍需在 GitHub 仓库设置中单独保存。操作方法见 [GitHub Topics 文档](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics)。

GitHub 社交分享封面也需要在仓库 Settings 中单独上传。建议使用真实界面截图，配上产品名与一句定位，避免展示密钥或私人对话。见 [GitHub Social preview 文档](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview)。

## 内容维护

- README 第一段直接说明产品、目标平台和使用场景；中英文使用一致的定位。
- 下载按钮指向现有滚动发布，文件名需与 `.github/workflows/macos.yml` 一致。
- 功能描述以可用代码为准。平台、AI 接入方式和许可证改变时，同步更新 README、使用指南、`package.json` 与 `index.html`。
- `package.json` 的 `keywords` 用于描述项目，不会自动成为 GitHub Topics；仓库当前为 `private: true`，不会发布到 npm。
- 网页的 title 与 description 保持简明、具体。搜索结果可能采用页面上的其他文字，不能保证直接显示指定摘要。见 [Google 搜索入门指南](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)。

## 将来部署公开网站时

确认真实站点 URL 后，再设置 canonical、`og:url`、使用绝对地址的分享图片，以及对应的 sitemap 和 robots.txt。当前没有可填写的正式站点地址，因此这些字段尚未配置。

公开产品页应提供无需操作画布即可读取的产品说明、下载入口与文档链接。桌面应用的工作区入口不能替代产品介绍页。若增加多语言页面，每个语言版本应有独立 URL，再配置对应的 hreflang。

上线后用 Search Console 验证抓取与索引情况，并检查分享卡的实际展示。参考 [Google JavaScript SEO 文档](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)。
