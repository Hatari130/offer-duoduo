import assert from "node:assert/strict";
import test from "node:test";
import {
  parseOpportunityUrlState,
  buildOpportunitySearchString,
  DEFAULT_OPPORTUNITY_URL_STATE
} from "../src/features/opportunities/opportunityUrlParams.ts";

test("parses default state when search string is empty", () => {
  const state = parseOpportunityUrlState("");
  assert.equal(state.page, 1);
  assert.equal(state.query, "");
  assert.equal(state.city, "all");
  assert.equal(state.industry, "all");
  assert.equal(state.cohort, "all");
  assert.equal(state.batch, "all");
  assert.equal(state.companyType, "all");
  assert.equal(state.quickFilter, "all");
  assert.equal(state.requiresAuthLogin, false);
});

test("parses valid page number from query params", () => {
  const state2 = parseOpportunityUrlState("?page=2");
  assert.equal(state2.page, 2);
  assert.equal(state2.requiresAuthLogin, false);

  const state3 = parseOpportunityUrlState("?page=3");
  assert.equal(state3.page, 3);
  assert.equal(state3.requiresAuthLogin, false);
});

test("safely falls back to page 1 for invalid or zero/negative page numbers", () => {
  assert.equal(parseOpportunityUrlState("?page=0").page, 1);
  assert.equal(parseOpportunityUrlState("?page=-5").page, 1);
  assert.equal(parseOpportunityUrlState("?page=abc").page, 1);
  assert.equal(parseOpportunityUrlState("?page=").page, 1);
});

test("caps page at 3 and flags requiresAuthLogin when unauthenticated user requests page > 3", () => {
  const state4 = parseOpportunityUrlState("?page=4", false);
  assert.equal(state4.page, 3);
  assert.equal(state4.requiresAuthLogin, true);

  const state10 = parseOpportunityUrlState("?page=10", false);
  assert.equal(state10.page, 3);
  assert.equal(state10.requiresAuthLogin, true);
});

test("allows page > 3 when user is authenticated", () => {
  const state4 = parseOpportunityUrlState("?page=4", true);
  assert.equal(state4.page, 4);
  assert.equal(state4.requiresAuthLogin, false);

  const state20 = parseOpportunityUrlState("?page=20", true);
  assert.equal(state20.page, 20);
  assert.equal(state20.requiresAuthLogin, false);
});

test("parses filters and quick filter correctly", () => {
  const state = parseOpportunityUrlState("?q=前端&city=上海&industry=互联网&quickFilter=closing&page=2");
  assert.equal(state.query, "前端");
  assert.equal(state.city, "上海");
  assert.equal(state.industry, "互联网");
  assert.equal(state.quickFilter, "closing");
  assert.equal(state.page, 2);
});

test("builds clean query string omitting default values", () => {
  assert.equal(buildOpportunitySearchString({ page: 1 }), "");
  assert.equal(buildOpportunitySearchString({ page: 2 }), "?page=2");
  assert.equal(buildOpportunitySearchString({ page: 3, city: "北京" }), "?city=%E5%8C%97%E4%BA%AC&page=3");
  assert.equal(
    buildOpportunitySearchString({ query: "后端", quickFilter: "latest", page: 1 }),
    "?q=%E5%90%8E%E7%AB%AF&quickFilter=latest"
  );
});
