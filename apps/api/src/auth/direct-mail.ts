import { createRequire } from "node:module";
import type { ApiConfig } from "../config.ts";
import { StoreError } from "../store/store.ts";

const require = createRequire(import.meta.url);
const directMailSdk = require("@alicloud/dm20151123") as typeof import("@alicloud/dm20151123");

export interface EmailMailer {
  configured: boolean;
  sendVerificationEmail(email: string, code: string): Promise<void>;
}

function verificationEmailHtml(code: string): string {
  return `<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;background:#f5f2eb;color:#1f2937;font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif">
    <div style="max-width:560px;margin:0 auto;padding:32px 20px">
      <div style="background:#fff;border:1px solid #e5e1d8;border-radius:16px;padding:32px">
        <p style="margin:0 0 8px;color:#a45f45;font-size:13px;font-weight:700;letter-spacing:.04em">JOBKOI</p>
        <h1 style="margin:0 0 16px;font-size:24px;line-height:1.35">验证你的邮箱</h1>
        <p style="margin:0 0 20px;color:#5f6673;line-height:1.7">请输入下面的验证码完成操作：</p>
        <div style="margin:0 0 20px;padding:16px 20px;background:#f8f6f1;border-radius:12px;font-size:32px;font-weight:700;letter-spacing:8px;text-align:center">${code}</div>
        <p style="margin:0;color:#7a808b;font-size:13px;line-height:1.7">验证码 5 分钟内有效。如果不是你本人操作，请忽略这封邮件。</p>
      </div>
    </div>
  </body>
</html>`;
}

export function createDirectMailMailer(config: ApiConfig): EmailMailer {
  const configured = Boolean(
    config.alibabaCloudAccessKeyId
      && config.alibabaCloudAccessKeySecret
      && config.directMailAccount
  );
  if (!configured) {
    return {
      configured: false,
      async sendVerificationEmail() {
        throw new Error("阿里云邮件推送尚未配置");
      }
    };
  }

  const Client = directMailSdk.default;
  const clientConfig = {
    accessKeyId: config.alibabaCloudAccessKeyId,
    accessKeySecret: config.alibabaCloudAccessKeySecret,
    endpoint: "dm.aliyuncs.com"
  } as unknown as ConstructorParameters<typeof Client>[0];
  const client = new Client(clientConfig);

  return {
    configured: true,
    async sendVerificationEmail(email, code) {
      const request = new directMailSdk.SingleSendMailRequest({
        accountName: config.directMailAccount,
        addressType: 1,
        replyToAddress: false,
        toAddress: email,
        fromAlias: config.directMailFromAlias,
        subject: "JobKoI 邮箱验证码",
        htmlBody: verificationEmailHtml(code)
      });
      const runtime = {} as Parameters<typeof client.singleSendMailWithOptions>[1];
      try {
        await client.singleSendMailWithOptions(request, runtime);
      } catch (error) {
        console.error("JobKoI DirectMail delivery failed", error);
        throw new StoreError("EMAIL_DELIVERY_FAILED", "验证码邮件发送失败，请稍后重试", 502);
      }
    }
  };
}
