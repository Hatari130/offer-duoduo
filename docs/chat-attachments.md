# 对话附件与 PaddleOCR

支持 TXT / Markdown（单个 ≤200 KB）、PDF / PNG / JPG / WebP（单个 ≤8 MB），每条消息最多 2 个附件。图片可选择、拖入或从剪贴板粘贴。没有输入问题时，发送附件会使用“请阅读附件，概括主要内容并给出建议。”

文字版 PDF 使用浏览器中的 pdf.js 提取文字；遇到没有文字层的页面时，整份 PDF 转交 OCR，避免遗漏扫描页面。图片直接通过 OCR 识别。Word `.doc/.docx` 暂不支持，请先导出 PDF。

## 配置

在 Git 忽略的本地文件 `apps/api/.env` 中设置，之后重启 API：

```dotenv
PADDLE_OCR_TOKEN=实际密钥
PADDLE_OCR_JOB_URL=https://paddleocr.aistudio-app.com/api/v2/ocr/jobs
PADDLE_OCR_MODEL=PaddleOCR-VL-1.6
```

`pnpm --filter @offerflow/api dev` 和 `pnpm --filter @offerflow/api start` 会自动加载此文件。生产服务可注入相同环境变量。密钥不能使用 `VITE_` 前缀，也不能提交到仓库。

未配置密钥时，文字版 PDF、TXT、Markdown 仍可使用；图片和扫描 PDF 会显示明确的未配置提示。

## 数据流与保留范围

1. 客户端调用鉴权接口 `POST /v1/chat/ocr`，请求体为二进制文件，`Content-Type` 为文件 MIME。
2. API 在内存中验证大小及文件头，以 multipart `file` 上传 PaddleOCR，携带 `model` 和 `optionalPayload`。
3. API 每 3 秒轮询任务，最长 180 秒；读取成功结果的 JSONL，只取 `result.layoutParsingResults[].markdown.text`，不下载 `images` 或 `outputImages`。
4. 返回 `{ ok: true, data: { text } }`；前端随聊天消息发送文字、文件名、原始类型、大小与附件 ID。原始文件、文件 URL 与 base64 字段不会进入聊天存储。
5. API 不创建原文件、临时文件或对象存储上传。成功、失败和取消路径都会清零接收到的文件 Buffer 并释放引用；运行时、Blob 和网络层复制的内存由垃圾回收管理，并非安全内存擦除保证。

聊天历史会保存提取文字，无法下载或重看原文件。同一对话没有新附件时，后续追问会继续引用最近 2 个附件的文字。PaddleOCR 是外部服务，会接收原文件并生成任务和结果；OfferFlow 不控制服务商的保留期，此实现也没有调用上游删除接口。浏览器取消会停止本地请求和轮询，但已提交的上游任务可能继续执行。

每位用户同时最多 1 个 OCR 请求，每个 API 进程同时最多 4 个；需要多实例统一配额时，应在网关进一步限流。反向代理需允许 ≥8 MB 请求体，超时应大于 180 秒，并避免请求体日志及上传缓冲落盘（例如 Nginx 的此接口需配置 `proxy_request_buffering off`）。

## 验证

合约测试覆盖 PDF/图片文本附件和二进制字段拒绝；API 测试通过模拟上游检查 multipart、轮询、JSONL 解析、超时、错误、鉴权和内存清理。真实 PaddleOCR 联调需配置有效密钥后完成，测试不会自动调用收费服务。
