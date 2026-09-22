# 吉利校园招聘全职岗位采集结果

采集日期：2026-09-15（Asia/Shanghai）

来源页面：<https://app.mokahr.com/campus-recruitment/geely/78436?locale=zh-CN#/jobs?page=1&anchorName=jobsList&commitment[0]=%E5%85%A8%E8%81%8C>

## 结果

- 官网筛选结果：2009 个全职岗位
- 列表页：67 页（前 66 页各 30 条，末页 29 条）
- 唯一职位 ID：2009
- 完整职位详情：2009
- 失败请求：0
- 空 JD：0
- 空发布时间：0
- 空地点：0
- 空学历要求：0

## 文件

- `jobs.json`：整理后的完整职位数组，适合程序导入。
- `jobs.jsonl`：每行一个职位，适合流式处理。
- `吉利全职岗位全集.md`：便于人工检索和阅读的职位全集。
- `raw-pages.json`：67 页官网列表接口的解密结果。
- `raw-details.json`：2009 个官网详情接口的解密结果。
- `raw-details.ndjson`：详情采集的断点文件。
- `validation.json`：数量、唯一性、筛选条件和缺失字段校验。
- `collect.cjs`：本次采集脚本。

## 字段说明

整理结果保留职位 ID、名称、地点、职能、细分职能、招聘年度、学历、专业要求、英语要求、完整 JD、部门、官网发布时间、详情链接和投递链接。`major_requirement` 从完整 JD 中包含“专业”要求的句子提取；官网未提供结构化薪资，因此 `salary` 为 `null`。
