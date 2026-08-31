import assert from "node:assert/strict";
import test from "node:test";
import {
  PUBLIC_OPPORTUNITY_PAGE_LIMIT,
  opportunityPageRequiresLogin
} from "../src/features/opportunities/paginationAccess.ts";

test("allows the first three opportunity pages without login", () => {
  assert.equal(PUBLIC_OPPORTUNITY_PAGE_LIMIT, 3);
  assert.equal(opportunityPageRequiresLogin(1, false), false);
  assert.equal(opportunityPageRequiresLogin(2, false), false);
  assert.equal(opportunityPageRequiresLogin(3, false), false);
});

test("requires login from the fourth opportunity page onward", () => {
  assert.equal(opportunityPageRequiresLogin(4, false), true);
  assert.equal(opportunityPageRequiresLogin(227, false), true);
});

test("does not limit authenticated users", () => {
  assert.equal(opportunityPageRequiresLogin(4, true), false);
  assert.equal(opportunityPageRequiresLogin(227, true), false);
});
