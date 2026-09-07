# JobKoI 用户数据存储、隔离与安全检测报告

检测日期：2026-09-07。线上匿名检查时间：北京时间 10:54 左右。

## 结论

当前系统有服务端账号隔离和登录安全基础，但**还不能认定满足“投递及经授权的简历信息上云，网申专用信息只留本地”的产品边界**。

最优先的问题不是已发现一个任意读取别人数据库的接口，而是：插件把包含网申专用字段的完整个人档案当作简历同步；同一浏览器切换账号时，本地简历归属也存在遗漏。

“用户同意上传”应理解为允许指定内容进入自己的云端私有空间，不等于公开可见、不必隔离或允许任意转交第三方。此报告按这一产品边界评估，不作法律合规认证。

## 范围与证据等级

- 代码基线：本地 Git HEAD `771e735`；同时检查现有 9 个未提交的插件文件改动，单独标明。没有修改这些业务文件、提交代码或部署。
- 本地：API 全套测试 37 项通过；插件同步测试 5 项通过；新增 11 个诊断场景通过（测试框架另计父测试，共 12 项）。诊断中包含“成功复现缺陷”，不能把通过率理解为安全通过率。
- 线上：仅访问 `jobkoi.cn` 的公开网页与匿名 API，没有登录、注册、上传、删除或访问真实用户记录。
- 数据库：审阅 PostgreSQL 实现与迁移 SQL；本地动态检查使用不持久化的 MemoryStore。**没有用生产 PostgreSQL 做双账号测试，也没有确认线上部署版本等于本地 HEAD。**
- 不在已验证范围：生产磁盘/备份加密、数据库角色实际权限、服务器端口暴露、真实日志内容、历史已上传数据、灾备恢复、依赖漏洞扫描及全面渗透测试。

## 一、实际上存了什么

| 数据 | 当前实现 | 是否符合预期边界 |
| --- | --- | --- |
| 个人投递、流程事件及备注等投递字段 | 本地与云端双向同步；服务端按账号存储 | 基本符合；备注中主动填写的隐私也随记录上传 |
| 多份通用简历 | 插件所有 `kind=base`（含缺省）的简历自动同步，不只是当前选中那份 | 尚无逐份上云开关或字段授权投影 |
| 姓名、联系方式、教育、工作/项目经历等 | 包含在完整 `profile` 内同步 | 可作为用户明确授权的简历子集 |
| 证件号、健康/婚姻/政治状态、家庭成员、紧急联系人、额外网申字段 | 只要进入已保存简历的 `profile`，也会随同步上传 | **不符合“网申专用字段只留本地”** |
| 原始 PDF 文件 | 普通简历模板同步不传原文件 | 不能据此推导“PDF 内容没有上云” |
| 定制任务的原文、未分类文本、图片资产 | 创建网页定制任务时可上传 `sourceEvidence`、`sourceAssets` 和完整档案 | 是普通字段同步之外的另一条上传通道 |
| 网页创建/编辑的简历 | 云端保存文档、档案；插件同步时合并回简历库 | 同样需要本地专用字段保护，避免反向覆盖 |
| 定制简历版本 | 云端独立存储，按账号访问 | 不等于普通简历模板同步集合 |

具体链路：网申信息页保存整个草稿到简历库 → 后台同步遍历通用简历 → 上传完整 `profile` → API 接受并存储 JSON。

证据：[ProfileView.tsx:767](D:/2026/2026product/offerflow/apps/extension/src/features/profile/ProfileView.tsx:767)、[cloudSync.ts:370](D:/2026/2026product/offerflow/apps/extension/src/infrastructure/sync/cloudSync.ts:370)、[profile.ts:154](D:/2026/2026product/offerflow/packages/domain/src/profile.ts:154)、[openWebTailor.ts:58](D:/2026/2026product/offerflow/apps/extension/src/features/tailor/openWebTailor.ts:58)。

## 二、主要发现

### F1 · P1：本地专用字段没有被挡在云端之外

适用：HEAD 与当前工作区。代码确认，并通过本地 API 复现。

`syncResumeTemplates()` 使用 `profile: resume.profile`。服务端校验只要求 `profile` 是对象，没有严格的允许字段列表；PostgreSQL 原样合并并持久化模板内容。网申信息页保存时也会把完整草稿放进当前简历，空简历库时会创建“我的简历”。因此不是只有手工构造请求才能发生。

本地用纯虚构标记验证：`idNumber`、`familyMembers`、`extraFields.localOnlySentinel` 上传后均可从账号自己的模板接口取回。没有读取真实用户资料，不能据此断言已经发生生产泄漏。

建议：定义独立 `CloudResumeProfile`，插件出站和服务端入站都按白名单重建对象；禁止用对象展开复制完整网申档案。默认排除证件、家庭、健康、紧急联系人和任意 `extraFields`；确需额外内容时单独选择与授权。回传合并只修改简历字段，保留本地网申字段。

证据：[cloudSync.ts:390](D:/2026/2026product/offerflow/apps/extension/src/infrastructure/sync/cloudSync.ts:390)、[resumes.ts:171](D:/2026/2026product/offerflow/packages/contracts/src/resumes.ts:171)、[postgres-store.ts:1130](D:/2026/2026product/offerflow/apps/api/src/store/postgres-store.ts:1130)。

### F2 · P1：同一浏览器换账号时，简历归属保护不完整

适用：HEAD 存在旧路径问题，未提交改动另有新风险；静态链路确认，未执行真实插件换号。

- HEAD 普通换号会比较 `ownerUserId` 并阻止上传，这是有效防护。但“清除本地投递并忘记所有者”只清投递、不清简历。清理后连接 B 账号，旧简历仍可被同步到 B。
- 当前未提交改动在“清空旧数据”路径补上了档案和简历清理；但换号确认框只说迁移“历史投递记录”。点击确定后保留全部旧简历，再以新账号执行简历同步，因此迁移范围大于提示范围。
- 新增 `forceRebind` 分支可以跳过所有者不匹配判断，界面也有对应入口。待删除简历队列只保存全局 ID，没有账号和服务地址命名空间；保留旧队列转绑时存在错账号执行删除的条件性风险，尤其是两账号具有同 ID 模板时。未证明任意跨账号删除。

这属于**客户端把 A 的本地资料用 B 的合法会话重新上传**，不是服务端绕过 B 的权限读到 A。

建议：按服务地址和账号 ID 分隔简历、档案、投递、同步状态及删除队列；换号时停止并等待旧同步结束。迁移必须明确列出投递与简历数量、让用户选择；“取消”应中止操作，而不是立即删除旧资料。

证据：[cloudSync.ts:157](D:/2026/2026product/offerflow/apps/extension/src/infrastructure/sync/cloudSync.ts:157)、[CloudSyncSettings.tsx:335](D:/2026/2026product/offerflow/apps/extension/src/features/settings/CloudSyncSettings.tsx:335)、[storage.ts:217](D:/2026/2026product/offerflow/apps/extension/src/infrastructure/storage/storage.ts:217)。HEAD 旧行为可用 `git show 771e735:apps/extension/src/infrastructure/sync/cloudSync.ts` 检查。

### F3 · P2：删除通用简历只是隐藏，完整内容仍保留并下发

适用：HEAD 与当前工作区；代码确认，本地复现。

模板删除是 `{ ...current, deletedAt, updatedAt }` 软删除。列表隐藏它，但同步接口返回包含已删除项的完整模板，其中档案、文档仍在。故“从列表消失”不等于“彻底删除云端内容”。当前插件“彻底删除本地与云端所有简历模板”的提示与实现不一致。

建议：同步墓碑仅保留 ID、删除版本/时间等元数据，清空档案、文档和资产；为历史内容、版本及备份设定明确清理期限。账号注销是不同操作：PostgreSQL 删除用户并通过外键级联清理相关业务表，但本次未验证生产数据库的实际删除效果。

证据：[postgres-store.ts:1118](D:/2026/2026product/offerflow/apps/api/src/store/postgres-store.ts:1118)、[0010_resume_templates.sql:5](D:/2026/2026product/offerflow/packages/db/migrations/0010_resume_templates.sql:5)、[postgres-store.ts:572](D:/2026/2026product/offerflow/apps/api/src/store/postgres-store.ts:572)。

### F4 · P2：账号数据导出遗漏通用简历库

适用：HEAD 与当前工作区；本地复现。

`/v1/account/export` 包含投递、对话、面试记录、定制版本、会话信息，却没有 `resumeTemplates`。只使用通用简历、不生成定制版本的用户，导出包缺少其核心简历内容。

建议：补全通用简历、关联文档/资产与明确的删除状态；用“只创建通用简历、不创建定制任务”的账号测试导出完整性。

证据：[app.ts:1116](D:/2026/2026product/offerflow/apps/api/src/app.ts:1116)。

### F5 · P2：AI 定制原文通道绕过结构化字段最小化

适用：HEAD 与当前工作区；本地拦截模拟 AI 请求确认，没有调用外部模型。

AI 提示词并非直接发送全部结构化档案：它选择摘要、技能、经历和项目等内容，这点应保留。但它同时将整个 `sourceEvidence` 序列化发送；其中 `rawText`、`unclassifiedText` 可能重新带入原简历中的敏感内容。

默认配置指向 DeepSeek，可由环境变量改写；本次未读取生产密钥或确认实际供应商。不能据默认配置断言线上全部使用某一供应商。

建议：对“保存到自己的云端”和“发给 AI 处理”分别说明范围；发送前对原文和未分类文本做筛选/脱敏，只传需要改写的内容块。服务器也应执行此边界。

证据：[openWebTailor.ts:64](D:/2026/2026product/offerflow/apps/extension/src/features/tailor/openWebTailor.ts:64)、[resume-tailor.ts:175](D:/2026/2026product/offerflow/apps/api/src/ai/resume-tailor.ts:175)、[config.ts:100](D:/2026/2026product/offerflow/apps/api/src/config.ts:100)。

### F6 · P2：线上 HTML 页面缺少安全响应头

适用：线上匿名 GET 的实测结果。

`https://jobkoi.cn/app/resumes` 返回 200 的 SPA 外壳，没有在响应中看到 CSP、X-Frame-Options、X-Content-Type-Options 或 HSTS；HTML 内也无 CSP meta。API 响应有这些防护，不会自动给 HTML 文档建立 CSP 或防嵌入策略。访问过 API 后可能建立 HSTS，但不应依赖这一前提。

这不是已经复现 XSS 或点击劫持，而是网页层纵深防护缺失。建议在实际 Nginx/站点入口配置响应头并回归正常功能；仓库示例已有相关配置，不能等同于已部署生效。

证据：[线上简历中心](https://jobkoi.cn/app/resumes)、[nginx.offerflow.conf.example:20](D:/2026/2026product/offerflow/deploy/nginx.offerflow.conf.example:20)。

### F7 · P3：开发 MemoryStore 注销遗漏模板清理

本地诊断中账号注销后，会话失效、投递和定制版本清除，但 `resumeTemplates` 在内存里仍残留。仅认定为开发实现缺陷；PostgreSQL 模板表有用户外键级联删除，不能把该复现直接归因给生产环境。

证据：[memory-store.ts:392](D:/2026/2026product/offerflow/apps/api/src/store/memory-store.ts:392)。

## 三、账号隔离与现有有效保护

| 检查 | 结果 | 证据范围 |
| --- | --- | --- |
| 未登录读取投递/简历 | 401 | 本地及线上匿名实测 |
| B 读取、修改、删除 A 的模板 | 拒绝，404 | 本地双账号 API |
| 两账号使用同一模板 ID | 各自保存，A 不被 B 覆盖 | 本地 API；SQL 使用 `(id,user_id)` 复合键 |
| B 读取、删除 A 投递 | 拒绝，404 | 本地 API |
| B 修改 A 投递 | 409，无 A 的服务端数据；与不存在的 ID 响应相同 | 本地 API |
| B 经同步拉取 A 投递 | 没有返回 A 数据 | 本地 API |
| B 访问 A 定制任务/简历版本 | 读、改、删或生成被拒绝 | 本地 API |
| 请求正文伪造 `userId` | 不改变投递/模板归属 | 本地 API |
| 非管理员访问后台 | 403 | 本地 API、已有回归测试 |
| Cookie 请求携带恶意 Origin | 403 | 本地 API；缺失 Origin 的写请求目前允许 |
| 线上恶意 Origin 匿名请求 | 401，不返回 Allow-Origin 放行头 | 线上公开请求；非登录态跨域测试 |
| 密码与会话 | 密码 scrypt + 随机盐；随机会话 token，数据库存哈希 | 代码审阅 |
| 网页 Cookie | HttpOnly、SameSite=Lax，HTTPS 配置下 Secure | 代码审阅，未实测生产登录 Cookie |
| 交接码及密码重置 | 一次性/过期控制；重置撤销会话 | 代码及既有回归测试 |
| 线上配置能力声明 | demo 关闭、邮箱验证开启、注册开放 | 公开 capabilities 接口，不代表穷尽运行配置 |
| API 传输与缓存 | HTTPS 可用、HTTP 301 转 HTTPS、API no-store/HSTS/CSP 等 | 线上匿名实测 |

私有路由从服务端会话取得 `userId`，不是信任前端传入的账号 ID。抽查的 PostgreSQL 投递、模板、任务、版本查询有用户条件。未发现对应迁移中启用 RLS（行级安全）；因此当前主要依赖应用查询正确性。这是可加强的防线，不是单凭缺少 RLS 就断言越权漏洞。

证据：[app.ts:1084](D:/2026/2026product/offerflow/apps/api/src/app.ts:1084)、[postgres-store.ts:1028](D:/2026/2026product/offerflow/apps/api/src/store/postgres-store.ts:1028)、[crypto.ts:7](D:/2026/2026product/offerflow/apps/api/src/auth/crypto.ts:7)、[线上能力声明](https://jobkoi.cn/api/v1/auth/capabilities)。

## 四、云存储和运维尚不能保证的部分

1. 业务 JSON 在应用层未做字段加密；它不是端到端加密产品。具备数据库读取权限的服务/运维角色原则上可读内容。磁盘加密是否开启需要服务器证据。
2. 仓库文档要求最小权限数据库账号、加密备份、日志脱敏和恢复演练，但要求不等于执行证明。没有检查真实备份或日志，不能写“已加密备份、无日志泄漏”。
3. 插件档案和设备 token 使用扩展本地存储，未见应用层加密。不同浏览器用户配置与同一配置内的业务账号是不同隔离边界；本地存储本身不解决业务换号问题。
4. API 对未知错误调用 `console.error(error)`；未验证实际错误对象及日志收集链路是否会携带上游正文或资料。应检查脱敏与访问权限，不在此认定日志已泄漏。
5. 需在隔离的 PostgreSQL 测试库补跑双账号、账户删除及同 ID 冲突测试，再核对生产迁移、运行角色和备份恢复。线上匿名 401 不能替代这些验证。

证据：[syncState.ts:15](D:/2026/2026product/offerflow/apps/extension/src/infrastructure/sync/syncState.ts:15)、[app.ts:1615](D:/2026/2026product/offerflow/apps/api/src/app.ts:1615)、[production-security.md](D:/2026/2026product/offerflow/docs/production-security.md)。

## 五、建议修复顺序与验收条件

1. **先收紧上云边界**：拆出云端简历字段结构；插件、模板 CRUD/同步、定制任务及 AI 出站都执行一致的白名单。禁止字段测试标记不得出现在云端、AI 请求或导出中。历史云端数据另行制定清理方案，勿未经确认直接删除。
2. **再修换号归属**：以账号和服务地址划分本地空间；增加 A→退出→B、清空后换号、显式迁移、离线待删除、同步进行中换号等测试，保证 A 的资料和队列不会被 B 隐式上传/执行。
3. **补删除、导出和网页防护头**：删除墓碑不含正文；导出包含所有活动简历；HTML 与 API 分别验证安全头。
4. **补生产证据**：确认实际部署 SHA、数据库最小权限、仅内网/本机暴露、磁盘及备份加密、日志脱敏与一次恢复演练。

达成这些条件后，才适合把“网申专用信息只留本地、云端数据按账号隔离”作为已验收的产品承诺。

## 六、复现材料

新增文件：[probe.mjs](D:/2026/2026product/offerflow/outputs/security-audit-2026-09-07/probe.mjs)。仅使用虚构账号与字段，服务监听 `127.0.0.1` 随机端口、禁止持久化，AI 请求由本地 mock 截获。

在项目根目录执行：

```powershell
pnpm --filter @offerflow/api test
pnpm --filter @offerflow/extension test:sync
node --experimental-transform-types --test outputs/security-audit-2026-09-07/probe.mjs
```

线上只读复核示例：

```powershell
curl.exe --max-time 15 -sS -D - -o NUL https://jobkoi.cn/app/resumes
curl.exe --max-time 15 -sS -D - https://jobkoi.cn/api/v1/resume-templates
curl.exe --max-time 15 -sS -D - https://jobkoi.cn/api/v1/applications
```

本次联网遵循 web-access 技能的匿名 HTTP 路径，未使用登录态。仅新增此报告与本地诊断脚本，没有修复业务代码、迁移数据或发布上线。

