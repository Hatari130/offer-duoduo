# 生产安全与数据同步

## 已实现的边界

- 网站登录使用随机不透明会话令牌；数据库只保存 SHA-256 散列，浏览器只接收 `HttpOnly + SameSite=Lax + Secure` Cookie。
- 插件得到独立的设备会话，可在网站设置中逐台撤销；自动授权码和交接码只保存散列且一次性使用。
- 生产启动会拒绝：无 PostgreSQL、开启 demo、关闭 HTTPS、不安全 CORS、缺少机会导入密钥等配置。
- 所有私有查询都先按 `user_id` 过滤。账号删除依靠 PostgreSQL 外键级联清理个人数据。
- 录音只在转写任务内存中短暂存在，处理完成后覆盖缓冲区；数据库保存文字稿与问答，不保存原始音频。

## 同步依据

| 字段 | 作用 |
| --- | --- |
| 会话中的 `user_id` | 决定数据归属，客户端不能自行指定 |
| `deviceId` | 标识插件设备，便于撤销和观察 |
| `application.id` | 同一条投递的稳定实体标识 |
| `revision` / `baseRevision` | 乐观锁；版本不一致时拒绝覆盖 |
| `changeId` | 幂等键；网络重试不会重复写入 |
| `cursor` | 只拉取上次同步后的增量变更 |

投递记录双向增量同步。出现冲突时，服务端返回服务端版本和被拒绝的本地变更；插件不会用服务端记录覆盖本地草稿，而是让用户选择“保留本地”或“使用云端”。插件首次连接会绑定本地数据所有者，断开连接也不清除该绑定，因此切换账号不会泄露旧账号的本地投递。

机会目录属于公共数据，只允许带 `X-OfferFlow-Ingest-Key` 的受信服务端导入任务写入；插件不再充当数据发布者。简历定制通过一次性交接码从插件进入网站，后续版本保存在用户的服务端空间。

## 上线步骤

1. 准备域名并备案（如适用），或为固定公网 IP 签发支持 IP SAN 的短期 TLS 证书；启用自动续期后，将 HTTP 全部重定向到 HTTPS。
2. 创建独立 PostgreSQL 账号和数据库，启用云盘/磁盘加密；从 `apps/api/.env.production.example` 生成 `/etc/offerflow/api.env`，权限设为仅服务账号可读。
3. 执行 `pnpm --filter @offerflow/api db:migrate`。旧状态文件迁移使用 `pnpm --filter @offerflow/api db:import-state -- /绝对路径/state.json`，迁移后所有用户需重新登录。
4. Web 构建时设置 `VITE_API_BASE_URL=https://app.example.com/api`，执行 `pnpm --filter @offerflow/web build:production`。
5. 安装 `deploy/nginx.offerflow.conf.example` 与 systemd 服务，替换域名、证书路径和目录；确认 API 只监听 `127.0.0.1`。
6. 插件发布构建必须设置 `VITE_OFFERFLOW_API_URL=https://app.example.com/api`、`VITE_OFFERFLOW_WEB_URL=https://app.example.com`，再执行 `pnpm --filter @offerflow/extension build:production`。将商店分配的扩展 ID 写入 API 的精确 CORS 白名单。当前 IP 站点过渡包可显式设置 `VITE_OFFERFLOW_ALLOW_INSECURE_HTTP=true`，但提交 Chrome Web Store 前必须完成 HTTPS，并删除该临时开关。
7. 做验收：注册开关、登录/退出、Cookie 标志、设备撤销、跨账号阻断、冲突选择、数据导出、账号删除、恢复备份、限流和安全响应头。

## GitHub 单一发布源

- `main` 是生产代码的唯一来源，禁止直接编辑或手工覆盖服务器工作目录。
- 推送 `main` 后，GitHub Actions 会安装锁定依赖、运行类型检查与测试、构建 Web，再上传以 Git commit SHA 命名的不可变 release。
- 同一流水线会按扩展 manifest 版本构建正式插件、生成网站下载 ZIP，并校验 `extension-release.json` 与 manifest 版本一致；不再手工维护旧 ZIP。
- 服务器只保留 `/etc/jobkoi-api.env`、数据库、日志和备份等运行时状态；这些内容不进入 release，也不进入 GitHub。
- `/www/wwwroot/jobkoi` 是指向当前 release 的符号链接。激活脚本使用仅保存在服务器的 `MIGRATION_DATABASE_URL` 执行前向数据库迁移；API 运行时继续使用低权限 `DATABASE_URL`。随后脚本原子切换链接、重启 API 并检查健康状态；失败时恢复上一个 release。
- GitHub 使用专用的 `admin` 部署密钥，并只能通过受限 sudo 命令激活已经上传且校验过结构的 release。

## 运维底线

- PostgreSQL 每日加密备份，至少保留 7 个日备和 4 个周备；每季度做一次实际恢复演练。备份与生产机使用不同账号/区域。
- 日志不得记录密码、Cookie、Bearer 令牌、完整简历、面试文字稿或 AI 请求正文。监控只记录请求 ID、状态码、耗时和脱敏用户 ID。
- 数据库账号遵循最小权限；SSH 禁止密码登录；系统、Node、PostgreSQL 和依赖按月更新，高危漏洞立即处理。
- 正式对外前补全运营主体、隐私联系人、第三方处理商、保存期限、未成年人和数据跨境条款，并完成律师审阅及适用的合规备案。
