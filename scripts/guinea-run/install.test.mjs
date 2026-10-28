/**
 * node --test scripts/guinea-run/install.test.mjs
 *
 * The offer to add Guinea Run to the home screen (core/install.js): which
 * offer shows where, and that it goes away only once the game is surely
 * installed. A player who dismisses the browser's box keeps an offer.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { INSTALLED_KEY, createInstallOffer, installKind, rememberedInstalled } from "../../site-theme/javascripts/guinea-run/core/install.js";

const ANDROID = { touch: true, testMode: false, userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/130", platform: "Linux armv8l", maxTouchPoints: 5 };
const IPHONE = { touch: true, testMode: false, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", platform: "iPhone", maxTouchPoints: 5 };
const IPAD = { touch: true, testMode: false, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel", maxTouchPoints: 5 };
const DESKTOP = { touch: false, testMode: false, userAgent: "Mozilla/5.0 (Windows NT 10.0)", platform: "Win32", maxTouchPoints: 0 };

function memoryStorage() {
  const items = new Map();
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key)
  };
}

/** The beforeinstallprompt event of Chrome, answered with outcome. */
function promptEvent(outcome) {
  const event = { prompted: 0 };
  event.prompt = async () => {
    event.prompted++;
  };
  event.userChoice = Promise.resolve({ outcome, platform: "web" });
  return event;
}

function offer(storage, isApp = false) {
  const calls = { n: 0 };
  const install = createInstallOffer({ storage, isApp, notify: () => calls.n++ });
  return { install, calls };
}

test("no offer in a frame or the app, without touch, or in a check", () => {
  assert.equal(installKind(null, ANDROID), null);
  assert.equal(installKind(undefined, DESKTOP), null);
  assert.equal(installKind(undefined, { ...ANDROID, testMode: true }), null);
});

test("a course page offers the game page, unless the game is remembered as installed", () => {
  assert.deepEqual(installKind(undefined, ANDROID), { kind: "page" });
  assert.equal(installKind(undefined, { ...ANDROID, remembered: true }), null);
});

test("the game page: the browser's button on Android, the Safari steps on an iPhone or an iPad", () => {
  const { install } = offer(memoryStorage());
  assert.deepEqual(installKind(install, ANDROID), { kind: "menu" });
  assert.deepEqual(installKind(install, IPHONE), { kind: "ios" });
  assert.deepEqual(installKind(install, IPAD), { kind: "ios" });
  install.promptArrived(promptEvent("accepted"));
  assert.deepEqual(installKind(install, ANDROID), { kind: "prompt" });
});

test("a late beforeinstallprompt tells the game, so the map redraws its offer", () => {
  const { install, calls } = offer(memoryStorage());
  install.promptArrived(promptEvent("accepted"));
  assert.equal(calls.n, 1);
});

test("a dismissed box keeps an offer: the menu entry, then the button again when the browser offers it", async () => {
  const storage = memoryStorage();
  const { install, calls } = offer(storage);
  const event = promptEvent("dismissed");
  install.promptArrived(event);
  assert.equal(await install.prompt(), "dismissed");
  assert.equal(event.prompted, 1);
  assert.deepEqual(installKind(install, ANDROID), { kind: "menu" });
  assert.equal(rememberedInstalled(storage), false);
  install.promptArrived(promptEvent("accepted"));
  assert.deepEqual(installKind(install, ANDROID), { kind: "prompt" });
  assert.equal(calls.n, 3);
});

test("a box that fails to open keeps an offer", async () => {
  const { install } = offer(memoryStorage());
  install.promptArrived({ prompt: () => Promise.reject(new Error("not allowed")), userChoice: new Promise(() => {}) });
  assert.equal(await install.prompt(), "failed");
  assert.deepEqual(installKind(install, ANDROID), { kind: "menu" });
});

test("accepted hides the offer for this visit only, until appinstalled confirms it", async () => {
  const storage = memoryStorage();
  const { install } = offer(storage);
  install.promptArrived(promptEvent("accepted"));
  assert.equal(await install.prompt(), "accepted");
  assert.equal(installKind(install, ANDROID), null);
  assert.equal(rememberedInstalled(storage), false);
  // Next visit, no appinstalled came: offered again
  assert.deepEqual(installKind(offer(storage).install, ANDROID), { kind: "menu" });
});

test("appinstalled hides the offer and is remembered for the next visits and the course pages", () => {
  const storage = memoryStorage();
  const { install } = offer(storage);
  install.promptArrived(promptEvent("accepted"));
  install.installedNow();
  assert.equal(installKind(install, ANDROID), null);
  assert.equal(storage.getItem(INSTALLED_KEY), "1");
  assert.equal(installKind(offer(storage).install, ANDROID), null);
  assert.equal(installKind(undefined, { ...ANDROID, remembered: rememberedInstalled(storage) }), null);
});

test("running as the app is remembered", () => {
  const storage = memoryStorage();
  offer(storage, true);
  assert.equal(rememberedInstalled(storage), true);
});

test("getInstalledRelatedApps: listed means installed, an empty list never brings the offer back", () => {
  const storage = memoryStorage();
  const empty = offer(storage).install;
  empty.relatedApps([]);
  assert.deepEqual(installKind(empty, ANDROID), { kind: "menu" });
  const { install } = offer(storage);
  install.relatedApps([{ platform: "webapp", url: "https://example.com/manifest.webmanifest" }]);
  assert.equal(installKind(install, ANDROID), null);
  assert.equal(rememberedInstalled(storage), true);
  // The next visit, on a page where Chrome answers an empty list: still installed
  const next = offer(storage).install;
  next.relatedApps([]);
  assert.equal(installKind(next, ANDROID), null);
  assert.equal(rememberedInstalled(storage), true);
});

test("a storage that throws never breaks the offer", () => {
  const broken = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {
      throw new Error("blocked");
    }
  };
  assert.equal(rememberedInstalled(broken), false);
  assert.equal(rememberedInstalled(null), false);
  const { install } = offer(broken);
  install.installedNow();
  assert.equal(installKind(install, ANDROID), null);
});
