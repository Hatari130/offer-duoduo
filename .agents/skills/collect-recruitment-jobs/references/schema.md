# 岗位字段与来源约定

读实际项目数据结构后再映射。现有前端读取 `apps/web/src/previews/job-discovery/jobs.json`，数组每元素一个岗位。以下字段必须存在，允许空值的字段没有证据时用 null；数组无内容用 []。

| 字段 | 类型与含义 |
| --- | --- |
| source_job_id | 非空字符串，官网岗位 ID，保留前导零 |
| company_name | 公司名 |
| job_title | 官网岗位全名 |
| locations | 字符串数组，多城市一个岗位；采用现有项目的城市规范，不丢地区信息 |
| job_direction | 官网岗位方向/职能分类，未披露 null |
| job_subdirection | 官网子方向，未披露 null；不要虚构细分 |
| recruitment_category | 校招 / 实习 / 社招 / 全职 / null，按证据归类 |
| recruitment_type | 具体标签：校招、转正实习、日常实习、实习、社招、全职等；未确认 null |
| recruitment_project | 如 2027 校园招聘、北斗计划；未明确 null |
| education_requirement | 如 本科及以上、硕士（在读）、本科—硕士；保留限制和优先条件 |
| major_requirement | 如 计算机、软件工程等相关专业（优先）；不能整段照搬任职资格 |
| skills | 资格中显式提及的技能关键词数组；不代表全部为硬性要求 |
| jd | 合并的完整岗位正文，换行保留，去掉行首条目编号；不删正文中的版本号、日期、数值 |
| salary | 官网薪资含币种/周期，如 10K–13K/月；未披露 null |
| department | 官网部门名；未披露 null，不从岗位名推测 |
| published_at | ISO 8601 时间或 YYYY-MM-DD 日期；未披露 null |
| published_at_source | 证据字段/官网标签，缺失时说明未披露；区分首次发布时间与官网展示发布时间 |
| last_verified_at | 实际核验时刻，带时区的 ISO 8601 |
| verified_date | 本次核验的北京时间日期 YYYY-MM-DD |
| source_list_url | 用户范围对应的官网列表 URL |
| detail_url | 实际确认的可读详情 URL；仅列表展开详情时可用列表 URL并注明 |
| application_url | 官方岗位投递入口；仅有详情页按钮时可复用详情 URL，不能编造表单地址 |

采集输出可增加：`company_id`、`dedupe_key`、`first_seen_at`、`updated_at`、`deadline_at`、`graduation_requirement`、`status`、`status_evidence`、`collection_method`、`raw_record_ref`、`content_hash`。未知为 null。新增字段不要导致现有前端失配。

## 必须保留的区别

- **校招不等于全职。** 汽车之家官网“全职”不应仅因没有实习二字就改称校招或社招；官网独立校招分类对应校招。美团的日常/转正实习继续分开。
- **日期不是同一个字段。** 美团已核实的 `firstPostTime` 是首次发布时间，`refreshTime` 是更新；汽车之家 `publicShowTime` 是官网标注发布时间，不拿内部 `createTime` 替换。小红书现有记录没有发布时间，继续 null，除非取得新证据。站点字段会变化，这些仅是已验证案例而非永恒规则。
- **投递入口可能需要登录。** 汽车之家观察到的 `api/out/position` 会转到登录及投递页；适合作 `application_url`，不可称作无需登录的可读详情页。
- **原始 ID 跨公司可能冲突。** 去重键用 company_id 或 company_name + source_job_id。当前页面历史收藏/投递/URL 使用单独 source_job_id；遇到冲突时需同步迁移前端键和旧数据，不能简单改 ID 导致收藏失效。
- 已有名单中未再次出现的岗位不能仅据此删除或认定下线；要有完整同范围快照和可靠状态证据，或遵从用户明确的清理范围。

## validation.json 最低内容

入口与筛选范围、开始/结束时间、实际采集方式、官网总数（不可得 null）、列表记录数、唯一岗位数、详情成功数、失败 ID/URL、公司与类型统计、发布时间已知/缺失数量、重复与差异处理说明、原始证据路径。没有逐条详情核验时不要记录为已逐条核验。
