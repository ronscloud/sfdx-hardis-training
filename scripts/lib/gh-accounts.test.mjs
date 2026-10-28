/**
 * node --test scripts/lib/gh-accounts.test.mjs
 *
 * The outputs below are the shapes `gh auth status --hostname github.com`
 * prints: several accounts since gh 2.40, one line before that, a token from a
 * variable, and an account whose token no longer works.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { parseGhAccounts } from "./util.mjs";

test("two accounts, the second one active", () => {
  const text = [
    "github.com",
    "  ✓ Logged in to github.com account old-employer (keyring)",
    "  - Active account: false",
    "  - Git operations protocol: https",
    "  - Token scopes: 'gist', 'read:org', 'repo', 'workflow'",
    "",
    "  ✓ Logged in to github.com account octocat (keyring)",
    "  - Active account: true",
    "  - Git operations protocol: https"
  ].join("\r\n");
  assert.deepEqual(parseGhAccounts(text), [
    { login: "old-employer", source: "keyring", active: false },
    { login: "octocat", source: "keyring", active: true }
  ]);
});

test("one account, the wording of gh before 2.40", () => {
  const text = "github.com\n  ✓ Logged in to github.com as octocat (/home/me/.config/gh/hosts.yml)\n  ✓ Git operations for github.com configured to use https protocol.";
  assert.deepEqual(parseGhAccounts(text), [
    { login: "octocat", source: "/home/me/.config/gh/hosts.yml", active: true }
  ]);
});

test("a token from GH_TOKEN keeps its source, so it is not offered a switch", () => {
  const text = "github.com\n  ✓ Logged in to github.com account octocat (GH_TOKEN)\n  - Active account: true";
  assert.deepEqual(parseGhAccounts(text), [{ login: "octocat", source: "GH_TOKEN", active: true }]);
});

test("an account whose token failed is left out", () => {
  const text = [
    "github.com",
    "  X Failed to log in to github.com account old-employer (keyring)",
    "  - Active account: true",
    "  - The token in keyring is invalid."
  ].join("\n");
  assert.deepEqual(parseGhAccounts(text), []);
});

test("not signed in", () => {
  assert.deepEqual(parseGhAccounts("You are not logged into any GitHub hosts. To log in, run: gh auth login"), []);
});
