import { test } from "node:test";
import assert from "node:assert/strict";
import { clampVegetarian, vegetarianLine, vegetarianOf } from "../src/lib/catering/vegetarian";

test("vegetarian count stays between 0 and the total", () => {
  assert.equal(clampVegetarian(3, 25), 3);
  assert.equal(clampVegetarian(-2, 25), 0);
  assert.equal(clampVegetarian(30, 25), 25);
  assert.equal(clampVegetarian(2.7, 25), 2);
  assert.equal(clampVegetarian(NaN, 25), 0);
  assert.equal(clampVegetarian(5, 0), 0);
});

test("old orders without the field have no vegetarian portions", () => {
  assert.equal(vegetarianOf({ totalPortions: 20 }), 0);
  assert.equal(vegetarianOf({ vegetarianPortions: 4, totalPortions: 20 }), 4);
  assert.equal(vegetarianOf({ vegetarianPortions: 4 }), 0);
});

test("summary line names the dish and the split", () => {
  assert.equal(vegetarianLine(3, 25), "מנה צמחונית: 3 מתוך 25 מנות (22 רגילות)");
  assert.equal(vegetarianLine(3, 25, "  שניצל תירס "), "שניצל תירס: 3 מתוך 25 מנות (22 רגילות)");
  assert.equal(vegetarianLine(0, 25), "");
});
