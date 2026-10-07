import assert from "node:assert/strict";
import test from "node:test";
import { briefCards } from "../src/features/chat/briefCards.ts";

const now = new Date(2026, 9, 7, 10, 0);
const application = (overrides) => ({
  id: overrides.company,
  position: "产品经理",
  stage: "interested",
  updatedAt: "2026-10-06T08:00:00.000Z",
  ...overrides
});

test("deadlines within three days that are not applied yet come first", () => {
  const cards = briefCards([
    application({ company: "美团", deadline: "2026-10-09" }),
    application({ company: "小红书", deadline: "2026-10-10" }),
    application({ company: "腾讯", deadline: "2026-10-20" }),
    application({ company: "京东", deadline: "2026-10-08", stage: "applied" })
  ], now);
  assert.equal(cards[0].id, "closing");
  assert.equal(cards[0].title, "美团、小红书的投递 3 天内截止");
  assert.match(cards[0].detail, /美团产品经理 10 月 9 日、小红书产品经理 10 月 10 日/);
});

test("an interview invites the interview team with that application selected", () => {
  const cards = briefCards([application({ company: "字节跳动", stage: "interview" })], now);
  const interview = cards.find((card) => card.id === "interview");
  assert.deepEqual(interview.action, { type: "invite", team: "interview_coach", applicationId: "字节跳动" });
});

test("without interviews, applications stuck for two weeks go to the planner", () => {
  const cards = briefCards([
    application({ company: "华为", stage: "applied", updatedAt: "2026-09-10T08:00:00.000Z" }),
    application({ company: "小米", stage: "applied", updatedAt: "2026-10-05T08:00:00.000Z" })
  ], now);
  assert.equal(cards.find((card) => card.id === "stalled").title, "1 个投递超过两周没有进展");
});

test("with no records only the job radar card is shown, and nothing is made up", () => {
  const cards = briefCards([], now);
  assert.deepEqual(cards.map((card) => card.id), ["radar"]);
  assert.doesNotMatch(cards[0].detail, /\d/);
});
