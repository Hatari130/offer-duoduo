// Verify UTF-8-safe base64 round-trip with Chinese job titles.
import { strict as assert } from "node:assert";

function decodeUtf8Base64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

function encodeUtf8Base64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)))
    );
  }
  return btoa(binary);
}

const samples = [
  "群核信息技术",
  "AI 产品经理（增长策略 GTM）",
  "产品经理 · 杭州 · 期望 25k",
  "英文 ASCII only string",
  "🚀 Emojis + 中文 + English",
  JSON.stringify({
    company: "盒马（中国）有限公司",
    position: "AI 产品经理 · 增长 GTM",
    city: "杭州",
    requirements: ["GPT-4o", "RAG", "SQL", "Tableau"],
    responsibilities: ["负责 AIGC 工作流从 0 到 1", "建立增长仪表盘"],
  })
];

for (const sample of samples) {
  const encoded = encodeUtf8Base64(sample);
  const decoded = decodeUtf8Base64(encoded);
  assert.equal(decoded, sample, `round-trip failed for: ${sample.slice(0, 30)}`);
  console.log(`OK · ${sample.length} chars → ${encoded.length} base64 chars`);
}
console.log("All round-trips passed.");