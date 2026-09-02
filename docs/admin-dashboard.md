# JobKoI 运营后台

`apps/admin` 是一个私有、只读的运营数据后台。它复用 JobKoI 账号登录，但只有 API 环境变量 `ADMIN_EMAILS` 中的邮箱可以读取统计接口。

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

`ADMIN_EMAILS` 支持英文逗号分隔多个邮箱。留空时所有账号都会被统计接口拒绝。

正式后台随主站发布在 `/admin/`，不需要单独配置域名。

部署 API 前照常运行数据库迁移。`0009_admin_analytics_indexes.sql` 只增加后台聚合查询所需的索引，不改变业务数据。

## 当前指标口径

- 累计注册：未注销且非体验账号的用户总数。
- 新增注册：所选周期内注册的用户数。
- 活跃用户：所选周期内存在未撤销登录会话活动的去重用户数。
- 新建对话：所选周期内创建且未删除的对话数。
- 回答成功率：完成状态的 AI 回答数除以全部 AI 回答数。
- 回答好评率：好评数除以所有主动评价数；无人评价时显示为空。
- 功能使用：所选周期内新增的投递、简历版本和面试记录。

日趋势按 Asia/Shanghai 自然日聚合。顶部活跃用户使用登录会话的最近活动时间，因此它适合看周期活跃人数，不用于还原历史逐日 DAU；图表中的“对话用户”使用每日消息记录计算。

## 隐私边界

- 后台不返回对话原文、附件、简历内容或反馈正文。
- 最近用户列表只返回脱敏邮箱。
- 浏览器只调用 `/v1/admin/dashboard`，不直接连接 PostgreSQL。
- 体验账号和已注销账号不计入运营指标。
