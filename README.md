# OfferDuoDuo

OfferDuoDuo 是一个 Chrome / Edge Manifest V3 浏览器扩展，用来从招聘网页识别岗位、维护投递进度、接入外部校招机会数据源，并把求职记录保存在本地浏览器中。

当前仓库已经移除独立网站和 Sites 部署相关代码。项目现在只聚焦扩展本体；未来如果需要配套网站，应作为独立应用重新放入清晰边界中，而不是混在扩展入口里。

## 项目边界

- `dashboard.html`：扩展内完整工作台入口。
- `sidepanel.html`：浏览器侧边栏入口。
- `src/main.tsx`：React 应用入口，承载扩展工作台和浮层模式。
- `src/App.tsx`：扩展主界面、抓取、机会数据源、投递管理、设置等业务界面。
- `src/background.ts`：Manifest V3 service worker。
- `public/manifest.json`：扩展清单。
- `public/content.js`：招聘网页内容脚本。
- `public/opportunities.json`：默认校招机会数据源，可被用户配置的外部 JSON 替换。

## 本地开发

```powershell
pnpm install
pnpm dev
```

Vite 本地服务用于调试扩展页面。生产构建：

```powershell
pnpm build
```

构建后在 Chrome / Edge 中加载 `dist` 目录：

1. 打开扩展管理页面。
2. 开启开发者模式。
3. 选择“加载已解压的扩展程序”。
4. 选择本项目的 `dist` 目录。

## 核心能力

- 识别当前招聘页面中的岗位信息。
- 识别投递列表和投递进度变化。
- 维护岗位阶段、截止日期、下一步行动和事件时间线。
- 接入公开 JSON 作为外部校招机会数据源。
- 支持 DeepSeek 页面理解配置。
- 支持 Obsidian Markdown 同步。
- 支持 JSON / CSV 备份。

## 未来网站预留

配套网站不再与扩展共用入口。未来新增时建议放在独立边界中：

- `apps/web`：网站应用。
- `apps/extension`：如需进一步拆分，扩展应用可迁入这里。
- `packages/core`：共享类型、数据清洗、机会源解析等纯逻辑。
- `packages/ui`：可复用组件。

当前阶段不保留任何可运行网站代码，避免扩展构建、网站部署和插件入口互相污染。
