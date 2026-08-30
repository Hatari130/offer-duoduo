import assert from "node:assert/strict";
import test from "node:test";
import {
  isApplicationSyncRequest,
  isCreateInterviewRecordFromTranscriptRequest,
  isExchangeDeviceCodeRequest,
  isLoginRequest,
  isMessageFeedbackRequest,
  isOpportunitySyncRequest,
  isRegisterRequest,
  isRetryMessageRequest,
  isSendMessageRequest,
  isUpdateConversationRequest,
  isSupportedInterviewAudioMimeType,
  normalizeMimeType
} from "../src/index.ts";

test("auth contracts accept complete payloads and reject ambiguous input", () => {
  assert.equal(isLoginRequest({ email: "user@example.com", password: "secret123" }), true);
  assert.equal(isLoginRequest({ email: "user@example.com" }), false);
  assert.equal(
    isRegisterRequest({ email: "user@example.com", password: "secret123", displayName: "Lin", avatarKey: "cloud", acceptPrivacy: true }),
    true
  );
  assert.equal(isRegisterRequest({ email: "user@example.com", password: "secret123" }), false);
  assert.equal(isRegisterRequest({ email: "user@example.com", password: "secret123", displayName: "Lin", avatarKey: "cloud", acceptPrivacy: false }), false);
  assert.equal(isRegisterRequest({ email: "user@example.com", password: "secret123", displayName: "Lin", avatarKey: "unknown", acceptPrivacy: true }), false);
  assert.equal(
    isExchangeDeviceCodeRequest({ code: "1234-5678", deviceId: "browser-1" }),
    true
  );
});

test("chat contracts require a stable client message id", () => {
  assert.equal(isSendMessageRequest({ content: "如何准备秋招？", clientMessageId: "msg-1" }), true);
  assert.equal(isSendMessageRequest({ content: "如何准备秋招？" }), false);
  assert.equal(isRetryMessageRequest({ clientMessageId: "retry-1" }), true);
  assert.equal(isRetryMessageRequest({ clientMessageId: 1 }), false);
  assert.equal(isSendMessageRequest({
    content: "结合材料分析岗位",
    clientMessageId: "msg-2",
    attachments: [{ id: "file-1", name: "notes.txt", mimeType: "text/plain", size: 12, content: "项目复盘" }],
    context: [{ kind: "application", id: "app-1", label: "星河科技 · 产品经理" }]
  }), true);
  assert.equal(isSendMessageRequest({
    content: "读取材料",
    clientMessageId: "msg-3",
    attachments: [{ id: "file-2", name: "resume.pdf", mimeType: "application/pdf", size: 12, content: "伪造文本" }]
  }), false);
  assert.equal(isUpdateConversationRequest({ title: "字节产品岗准备" }), true);
  assert.equal(isUpdateConversationRequest({ title: "" }), false);
  assert.equal(isMessageFeedbackRequest({ feedback: "positive" }), true);
  assert.equal(isMessageFeedbackRequest({ feedback: "maybe" }), false);
});

test("application sync contract validates the incremental envelope", () => {
  const application = {
    id: "application-1",
    company: "星河科技",
    position: "产品经理",
    stage: "applied",
    sourceUrl: "https://jobs.example.com/1",
    sourceHost: "jobs.example.com",
    responsibilities: [],
    requirements: [],
    events: [],
    createdAt: "2026-08-08T00:00:00.000Z",
    updatedAt: "2026-08-08T00:00:00.000Z"
  };
  assert.equal(
    isApplicationSyncRequest({
      deviceId: "browser-1",
      cursor: "0",
      changes: [{ changeId: "change-1", baseRevision: 0, application }]
    }),
    true
  );
  assert.equal(
    isApplicationSyncRequest({
      deviceId: "browser-1",
      changes: [{ changeId: "change-1", baseRevision: "0", application }]
    }),
    false
  );
});

test("opportunity sync contract accepts a normalized feed snapshot", () => {
  const opportunity = {
    id: "opp_1",
    company: "蜀道集团",
    title: "铁路运输管理类（工务管理）",
    batch: "2026 秋招",
    deadline: "2026-08-11",
    graduationYears: ["2026届"],
    roleTags: ["工务管理"],
    cities: ["成都"],
    officialUrl: "https://example.com/apply",
    sourceUrl: "https://example.com/notice"
  };
  assert.equal(
    isOpportunitySyncRequest({
      opportunities: [opportunity],
      fetchedAt: "2026-08-08T10:00:00.000Z",
      sourceUrl: "https://shouna12358-png.github.io/campus-hiring/campus-hiring.json"
    }),
    true
  );
  assert.equal(
    isOpportunitySyncRequest({
      opportunities: [{ ...opportunity, officialUrl: 42 }]
    }),
    false
  );
  assert.equal(isOpportunitySyncRequest({ opportunities: "not-an-array" }), false);
});

test("interview contracts validate transcripts and supported audio MIME parameters", () => {
  assert.equal(
    isCreateInterviewRecordFromTranscriptRequest({
      title: "一面复盘",
      transcript: "面试官：请介绍项目。\n候选人：我负责需求分析。"
    }),
    true
  );
  assert.equal(isCreateInterviewRecordFromTranscriptRequest({ transcript: 42 }), false);
  assert.equal(normalizeMimeType("audio/webm; codecs=opus"), "audio/webm");
  assert.equal(isSupportedInterviewAudioMimeType("audio/webm; codecs=opus"), true);
  assert.equal(isSupportedInterviewAudioMimeType("text/plain"), false);
});
