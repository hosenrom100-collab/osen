import { test } from "node:test";
import assert from "node:assert/strict";
import { computeFreezeAt, getCutoffBoundaries } from "../src/app/shopping/lib/freeze";

const monday1600 = { enabled: true, day: 1, time: "16:00", deliveryDay: null };
const at = (iso: string) => new Date(iso);
const created = (iso: string) => ({ createdAt: new Date(iso) });

// Israel is UTC+3 until the last Sunday of October (25.10.2026), UTC+2 after it.

test("boundaries in summer time (UTC+3)", () => {
  const { last, next } = getCutoffBoundaries(monday1600, at("2026-10-14T07:00:00Z")); // Wed 10:00 IDT
  assert.equal(last.toISOString(), "2026-10-12T13:00:00.000Z"); // Mon 16:00 IDT
  assert.equal(next.toISOString(), "2026-10-19T13:00:00.000Z");
});

test("boundaries across the end of daylight saving", () => {
  const before = getCutoffBoundaries(monday1600, at("2026-10-20T07:00:00Z")); // Tue before the switch
  assert.equal(before.last.toISOString(), "2026-10-19T13:00:00.000Z"); // 16:00 IDT
  assert.equal(before.next.toISOString(), "2026-10-26T14:00:00.000Z"); // 16:00 IST, one hour later in UTC
  const after = getCutoffBoundaries(monday1600, at("2026-10-27T07:00:00Z"));
  assert.equal(after.last.toISOString(), "2026-10-26T14:00:00.000Z");
  assert.equal(after.next.toISOString(), "2026-11-02T14:00:00.000Z");
});

test("Sunday looks back to last week's cutoff and Saturday crosses a month end", () => {
  const sunday = getCutoffBoundaries(monday1600, at("2026-10-18T07:00:00Z"));
  assert.equal(sunday.last.toISOString(), "2026-10-12T13:00:00.000Z");
  assert.equal(sunday.next.toISOString(), "2026-10-19T13:00:00.000Z");
  const saturday = getCutoffBoundaries(monday1600, at("2026-10-31T20:00:00Z"));
  assert.equal(saturday.last.toISOString(), "2026-10-26T14:00:00.000Z");
  assert.equal(saturday.next.toISOString(), "2026-11-02T14:00:00.000Z");
});

test("the cutoff itself belongs to the passed side, and 00:00 is honoured", () => {
  const exact = getCutoffBoundaries(monday1600, at("2026-10-12T13:00:00Z"));
  assert.equal(exact.last.toISOString(), "2026-10-12T13:00:00.000Z");
  const midnight = getCutoffBoundaries({ ...monday1600, day: 5, time: "00:00" }, at("2026-10-14T07:00:00Z"));
  assert.equal(midnight.next.toISOString(), "2026-10-15T21:00:00.000Z"); // Fri 00:00 IDT
});

test("computeFreezeAt: disabled cutoff means no freeze", () => {
  assert.equal(computeFreezeAt({ ...monday1600, enabled: false }, [], at("2026-10-14T07:00:00Z")), null);
  assert.equal(computeFreezeAt(undefined, [], at("2026-10-14T07:00:00Z")), null);
});

test("computeFreezeAt: open list freezes at the coming cutoff", () => {
  const now = at("2026-10-14T07:00:00Z");
  const items = [created("2026-10-13T07:00:00Z")]; // created after last Monday 16:00
  assert.equal(computeFreezeAt(monday1600, items, now)!.toISOString(), "2026-10-19T13:00:00.000Z");
});

test("computeFreezeAt: list never closed stays frozen from the last cutoff", () => {
  const now = at("2026-10-20T07:00:00Z"); // Tue, after Monday's cutoff
  const items = [created("2026-10-15T07:00:00Z")]; // created before Mon 19.10 16:00
  assert.equal(computeFreezeAt(monday1600, items, now)!.toISOString(), "2026-10-19T13:00:00.000Z");
});

test("computeFreezeAt: an empty list after the cutoff rolls to the next one", () => {
  const now = at("2026-10-20T07:00:00Z");
  assert.equal(computeFreezeAt(monday1600, [], now)!.toISOString(), "2026-10-26T14:00:00.000Z");
});

test("computeFreezeAt is stable across the moment the cutoff passes", () => {
  const items = [created("2026-10-12T07:00:00Z")]; // Mon morning
  const before = computeFreezeAt(monday1600, items, at("2026-10-12T12:59:00Z"));
  const after = computeFreezeAt(monday1600, items, at("2026-10-12T13:01:00Z"));
  assert.equal(before!.toISOString(), after!.toISOString());
});
