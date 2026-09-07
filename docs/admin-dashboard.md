# JobKoI 运营后台

`apps/admin` 是一个私有的运营数据与反馈管理后台。它复用 JobKoI 账号登录，但只有 API 环境变量 `ADMIN_EMAILS` 白名单中的邮箱可以访问运营统计与反馈管理接口。

## 本地启动

本地启动 API 前，在 PowerShell 中配置管理员邮箱：

```powershell
$env:ADMIN_EMAILS="owner@example.com"
pnpm dev:api
```

再打开另一个终端启动后台：

```powershell
pnpm dev:admin
```

然后打开 `http://127.0.0.1:5174`，使用白名单中的 JobKoI 账号登录。

## 生产配置

至少配置以下变量：

```env
ADMIN_EMAILS=owner@example.com
CORS_ORIGINS=https://app.example.com,https://admin.example.com
```

后台前端配置：

```env
VITE_API_BASE_URL=/api
```

`ADMIN_EMAILS` 支持英文逗号分隔多个邮箱。留空时所有账号都会被后台接口拒绝（403 ADMIN_FORBIDDEN）。

正式后台随主站发布在 `/admin/`，不需要单独配置域名。

部署 API 前照常运行数据库迁移。`0009_admin_analytics_indexes.sql` 只增加后台聚合查询所需的索引，不改变业务数据。

## 功能模块

### 1. 运营数据大盘
- 累计注册：未注销且非体验账号的用户总数。
- 新增注册：所选周期内注册的用户数。
- 活跃用户：所选周期内存在未撤销登录会话活动的去重用户数。
- 新建对话：所选周期内创建且未删除的对话数。
- 回答成功率：完成状态的 AI 回答数除以全部 AI 回答数。
- 回答好评率：好评数除以所有主动评价数；无人评价时显示为空。
- 功能使用：所选周期内新增的投递、简历版本和面试记录。
- 日趋势按 Asia/Shanghai 自然日聚合。图表中的“对话用户”使用每日消息记录计算。

### 2. 产品共建反馈管理
后台提供共建反馈列表与全流程状态跟进：
- **状态流转**：`待处理 (new)` -> `处理中 (reviewing)` -> `已规划 (planned)` -> `已解决 (resolved)` -> `已关闭 (closed)`。
- **检索与筛选**：支持按跟进状态、问题类别（功能建议/使用问题/内容纠错/其他想法）筛选，以及模糊搜索（反馈内容、联系方式、页面路径、用户姓名/邮箱）。
- **管理员便捷操作**：
  - 实时状态快捷切换（支持加载中防护与即时计数刷新）；
  - 反馈长文本一键展开/收起；
  - 邮箱/微信号/手机等联系方式一键复制（带悬浮提示与 Toast 反馈）；
  - 顶部与导航栏实时呈现待处理（new）红点徽标。

## 后台 API 接口

所有接口均需要通过 Bearer Token 鉴权，且必须命中 `ADMIN_EMAILS` 邮箱白名单：

- `GET /v1/admin/dashboard?range=30d`：获取聚合大盘运营数据。
- `GET /v1/admin/feedback?status=all&category=&keyword=&limit=50&offset=0`：查询反馈列表及各状态数量统计。
- `PATCH /v1/admin/feedback/:id/status`：更新反馈状态，请求体 `{ "status": "reviewing" }`。

## 隐私边界

- **核心数据严格隔离**：后台不返回用户对话原文、附件或简历私有内容。
- **最近用户列表**：运营大盘中的最近注册用户只返回脱敏邮箱。
- **反馈内容与联系方式**：仅经由严格白名单验证的管理员有权限调阅反馈原文与用户主动填写的联系方式，以便进行需求沟通与客户回访。
- **无直接 DB 暴露**：前端浏览器仅通过受控 API 与后端通信，体验账号与已注销账号不计入运营数据。
