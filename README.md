# OfferFlow

OfferFlow 是一个 Chrome / Edge Manifest V3 浏览器扩展，用于从招聘网页抓取岗位，并持续维护秋招投递进度。

项目同时包含完整的网页工作台：

- `index.html`：可独立部署的本地优先网页版本；
- `dashboard.html`：随扩展打包、直接共享 `chrome.storage.local` 的插件工作台。

扩展顶部和网页浮层中的“网页工作台”按钮会打开 `dashboard.html`。此时插件抓取、
投递进度监听、个人资料和网页工作台使用同一份数据，不需要导入导出。

## 当前版本

- 抓取当前岗位页面（优先读取 JobPosting JSON-LD，并使用页面文本规则补充）
- 可选 DeepSeek V4 Flash 页面理解，支持投递列表和非标准招聘页面
- 多岗位投递记录选择、批量创建或更新
- 投递进度页保持打开时自动监听DOM变化并静默同步阶段
- 创建岗位与重复岗位检测
- 扩展内秋招看板
- 投递日历：展示真实投递时间、截止日期和当日事项
- 阶段、截止时间和下一步行动维护
- 投递事件时间线
- 连接 Obsidian 目录并创建或更新 Markdown
- 同步时保留“我的准备笔记”区域
- JSON / CSV 完整备份
- 网页工作台：投递表格、批量阶段更新、拖拽看板、开招动态、日历
- 开招动态：按开放时间显示“今天 / 昨天 / 几天前开启投递”的公司
- 网页工作台：个人资料、文档中心、工作区 JSON 导入导出
- 扩展内工作台与插件本地数据实时共享

## 本地运行

```powershell
pnpm install
pnpm build
```

开发网页工作台：

```powershell
pnpm dev
```

打开 Vite 输出的本地地址即可。生产构建会同时生成扩展页面、独立网站，以及 Sites
部署使用的 Worker 入口。

然后在 Chrome 或 Edge 中：

1. 打开扩展管理页面；
2. 开启开发者模式；
3. 选择“加载已解压的扩展程序”；
4. 选择本项目的 `dist` 目录；
5. 打开招聘网页，点击 OfferFlow 图标。

如需使用 DeepSeek：

1. 打开 OfferFlow 左下角设置；
2. 在“DeepSeek 页面理解”中填写 API Key；
3. 保持模型为 `deepseek-v4-flash`；
4. 点击“测试连接”并保存。

开启“实时监听投递进度页”后，OfferFlow 会在页面首次加载以及进度相关 DOM
发生变化时重新识别页面。只有岗位编号能够唯一匹配、且阶段确实变化时才会自动
更新，其他情况不会改动已有记录。

API Key 只保存在当前浏览器的 `chrome.storage.local` 中，不写入源码、构建文件或
Obsidian 笔记。

## 数据策略

OfferFlow 使用 `chrome.storage.local` 保存主数据。Obsidian 是单向 Markdown 镜像：

- 每条岗位使用稳定的 `offerflow_id`；
- `applied_at` 保存招聘网站提供的真实投递时间；
- OfferFlow 更新 YAML Properties 和受管正文；
- `## 我的准备笔记` 及其后内容由用户自由维护；
- 首版不做 Obsidian 到 OfferFlow 的双向同步。

## 下一阶段

- 增加网站级解析适配器
- 增加提醒与跨设备备份
