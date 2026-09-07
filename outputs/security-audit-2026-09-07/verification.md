# 安全修复验证记录 — 2026-09-07

本次完成本地代码修复和回归验证，未部署生产环境，未清理真实数据库。原 report.md / probe.mjs 保留为修复前审计证据；probe 的漏洞存在性断言不再是通过标准。

## 已修复

- 云简历使用递归字段白名单，插件出站和 API 存储/读取共同过滤。网申专用字段、原始解析证据和文件名不随云简历上传；本地合并保留本地专用字段。自由文本仍可能包含用户主动填写的信息，过滤器不是文本隐私识别器。
- 插件账号与服务地址共同绑定数据归属；旧连接须重新确认上传范围。登录采用预览与确认两阶段，迁移、同步、删除和清理统一由后台串行执行。退出不抹去归属和离线修改，旧账号删除队列不能流入新账号。
- 删除只留空内容同步标记，阻止过期客户端复活；远端重置失败不清除本地原件。账号导出包含主简历，账号删除覆盖模板数据。
- AI 请求移除原始证据，并增加明确发送确认；日志不记录上游错误正文。依据 better-writing 规则，确认文案分别说明上传范围、删除范围及取消的效果。
- Web/Admin 增加 CSP 构建兜底及预览安全响应头，提供 Nginx 共享配置和部署后只读检查器。
- 新增历史简历数据清理工具：默认只读、只输出计数；实际写入要求备份确认，行锁与事务保护，失败回滚。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| 全工作区 pnpm typecheck | 通过；新增清理脚本后 API 类型检查再次通过 |
| contracts | 10/10 |
| API 全套（含历史清理测试） | 54/54 |
| 插件同步/账号安全 | 18/18 |
| Web 全套 | 37/37 |
| 插件简历渲染 | 10/10 |
| pnpm build（全工作区） | 通过 |
| 插件 build:production + 12 项必需产物校验 | 通过，构建端点 https://jobkoi.cn/api 和 https://jobkoi.cn |
| Web build:production | 通过，同源 /api |
| 本地 Vite preview /app/resumes 实际 HTTP 安全响应头 | 通过 |
| git diff --check | 通过，仅 CRLF 提示 |

构建存在非阻断的大文件分包提示。未做真实浏览器登录/人工交互验收；账号竞态由模拟 Chrome 后台和 API 的自动化回归覆盖。未连接真实 PostgreSQL；历史清理的测试使用查询替身，不能替代预发布数据库验证。

## 上线前仍需执行（本次未执行）

1. 备份并部署新 API/Web/Admin 和插件。Web 的 CSP 已精确允许当前校招数据源 `https://shouna12358-png.github.io`；如以后更换 `VITE_CAMPUS_HIRING_FEED_URL` 的 origin，必须同步更新 CSP 和回归测试。
2. 将 deploy/nginx-security-headers.conf 加到实际站点的 HTTPS HTML 响应位置，核对继承关系，经 nginx -t 后再重载；构建中的 meta 无法替代 frame-ancestors / HSTS 响应头。
3. 用 node deploy/check-web-security.mjs https://实际域名/app/resumes 检查真实响应头，并完成登录、同步、AI、PDF 导出浏览器冒烟测试。
4. 在预发布 PostgreSQL 上验证清理工具，再安排生产维护窗口。配置好 DATABASE_URL 后先运行 pnpm --filter @offerflow/api db:sanitize-resumes（只读）；核对计数、创建并验证受限访问备份后，另行授权运行 pnpm --filter @offerflow/api db:sanitize-resumes --apply --backup-confirmed。不要将连接串写进命令历史或报告。写入操作会移除历史多余字段及已删除模板内容，恢复依赖备份。
5. 旧数据库记录目前仅在读取时过滤，尚未完成静态数据清理。工具仅处理 resume_templates、resume_versions、tailor_tasks 的 payload；备份、WAL、旧日志及已有用户自由文本需要独立的保留/清理策略，不应宣称已经物理彻底删除。
