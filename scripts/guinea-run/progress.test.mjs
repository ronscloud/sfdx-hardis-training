/**
 * node --test scripts/guinea-run/progress.test.mjs
 *
 * The save of Guinea Run when the game is open twice (two tabs, two VS Code
 * windows): each save keeps the best of what is stored and of what this game
 * did, so a world won in one is never erased by the other.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createProgress, mergeProgress } from "../../site-theme/javascripts/guinea-run/core/progress.js";

const KEY = "guinea-run-progress-v1";

/** A browser with one localStorage, shared by every game opened in it. */
function fakeBrowser() {
  const items = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => (items.has(key) ? items.get(key) : null),
      setItem: (key, value) => items.set(key, String(value)),
      removeItem: (key) => items.delete(key)
    },
    addEventListener: () => {}
  };
  return { stored: () => JSON.parse(items.get(KEY) || "null") };
}

test("two games won different worlds: both stay won", () => {
  const browser = fakeBrowser();
  const one = createProgress();
  const two = createProgress();
  one.complete(0, 1200, 3, 1, { w: 0, sc: 1200 });
  two.complete(1, 900, 2, 2, { w: 1, sc: 900 });
  const saved = browser.stored();
  assert.equal(saved.worlds[0].best, 1200);
  assert.equal(saved.worlds[1].best, 900);
  assert.equal(saved.unlocked, 2);
  // The game that did not win world 0 reads it after its own save
  assert.equal(two.world(0).best, 1200);
});

test("the same world won twice keeps the higher score and its result", () => {
  const browser = fakeBrowser();
  const one = createProgress();
  const two = createProgress();
  one.complete(2, 2000, 3, 3, { w: 2, sc: 2000 });
  two.complete(2, 1500, 3, 3, { w: 2, sc: 1500 });
  const saved = browser.stored();
  assert.equal(saved.worlds[2].best, 2000);
  assert.equal(saved.worlds[2].record.sc, 2000);
});

test("badges, notes and the pinball best are kept from both", () => {
  const browser = fakeBrowser();
  const one = createProgress();
  const two = createProgress();
  one.addBadge(1);
  one.addNote(3);
  one.completeBonus(50000, { pin: 1, sc: 50000 });
  two.addBadge(2);
  two.addNote(5);
  two.completeBonus(20000, { pin: 1, sc: 20000 });
  const saved = browser.stored();
  assert.deepEqual(saved.badges, [1, 2]);
  assert.deepEqual(Object.keys(saved.notes).sort(), ["3", "5"]);
  assert.equal(saved.bonus.best, 50000);
  assert.equal(saved.bonus.record.sc, 50000);
});

test("a mode chosen in one game is not undone by a save of the other", () => {
  const browser = fakeBrowser();
  const one = createProgress();
  const two = createProgress();
  one.setMode("hard");
  two.addNote(1);
  assert.equal(browser.stored().mode, "hard");
  two.setMode("normal");
  assert.equal(browser.stored().mode, "normal");
});

test("a reset is not merged back with what it forgets", () => {
  const browser = fakeBrowser();
  const one = createProgress();
  one.setMode("hard");
  one.complete(0, 1000, 3, 1, null);
  one.reset();
  const saved = browser.stored();
  assert.deepEqual(saved.worlds, {});
  assert.equal(saved.unlocked, 0);
  assert.equal(saved.mode, "hard");
});

test("a volatile game (a check) never writes", () => {
  const browser = fakeBrowser();
  const check = createProgress({ volatile: true, unlockAll: true });
  check.complete(0, 1000, 3, 1, null);
  assert.equal(browser.stored(), null);
});

test("mergeProgress: a signed result wins a tie", () => {
  const stored = { v: 1, unlocked: 1, worlds: { 0: { best: 800, stars: 2, record: { sc: 800, sg: "x" } } } };
  const mine = { v: 1, unlocked: 1, worlds: { 0: { best: 800, stars: 3, record: { sc: 800 } } } };
  const merged = mergeProgress(stored, mine, new Set());
  assert.equal(merged.worlds[0].record.sg, "x");
  assert.equal(merged.worlds[0].stars, 3);
});

test("mergeProgress: what was sent keeps the higher score of each board", () => {
  const stored = { v: 1, sent: { worlds: { 0: 500, 1: 900 }, pinball: 100 }, sentAt: 10 };
  const mine = { v: 1, sent: { worlds: { 0: 700 }, pinball: 50 }, sentAt: 5 };
  const merged = mergeProgress(stored, mine, new Set());
  assert.deepEqual(merged.sent, { worlds: { 0: 700, 1: 900 }, pinball: 100, orgman: 0 });
  assert.equal(merged.sentAt, 10);
});

test("mergeProgress: the best Org-Man game and what was sent of it are kept from both", () => {
  const stored = { v: 1, bonuses: { orgman: { best: 900, record: { org: 1, sc: 900, sg: "a" }, teaserSeen: true } }, sent: { worlds: {}, pinball: 0, orgman: 300 } };
  const mine = { v: 1, bonuses: { orgman: { best: 500, record: { org: 1, sc: 500, sg: "b" }, teaserSeen: false } }, sent: { worlds: {}, pinball: 0, orgman: 700 } };
  const merged = mergeProgress(stored, mine, new Set());
  assert.equal(merged.bonuses.orgman.best, 900);
  assert.equal(merged.bonuses.orgman.record.sg, "a", "the record of the best game");
  assert.equal(merged.bonuses.orgman.teaserSeen, true);
  assert.equal(merged.sent.orgman, 700);
});
