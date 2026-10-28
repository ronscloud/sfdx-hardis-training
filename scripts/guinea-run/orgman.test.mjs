/**
 * node --test scripts/guinea-run/orgman.test.mjs
 *
 * Org-Man, the second bonus, without a browser: its mazes (every dot reachable,
 * no dead end, the tunnels open), its rules (the extra lives, the ceiling of a
 * maze the Hall of Fame holds a score to), its admins (out of the house and
 * back in) and whole games played by the bot of the check.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { MAZES, parseMaze, cellAt, canEnter, PATH, DIRS, wrapX } from "../../site-theme/javascripts/guinea-run/worlds/orgman/maze.js";
import { POINTS, EXTRA_FIRST, maxMazeScore, maxScoreThrough, levelSettings, salesManagerIn } from "../../site-theme/javascripts/guinea-run/worlds/orgman/rules.js";
import { createSim } from "../../site-theme/javascripts/guinea-run/worlds/orgman/sim.js";
import { createAutoplay } from "../../site-theme/javascripts/guinea-run/worlds/orgman/autoplay.js";
import { seededRandom } from "../../site-theme/javascripts/guinea-run/core/random.js";

const DT = 1 / 120;

/** Plays a game with the bot, at most `seconds` of game time. */
function play(seed, seconds, { level = 1, onEvent = () => {} } = {}) {
  const events = {};
  const sim = createSim(seededRandom(seed), (name, data) => {
    events[name] = (events[name] || 0) + 1;
    onEvent(name, data, sim);
  });
  const bot = createAutoplay(sim);
  sim.newGame(level);
  for (let i = 0; i < seconds / DT && sim.state.phase !== "over"; i++) {
    bot.step();
    sim.update(DT);
    if (sim.state.phase === "cleared") {
      sim.nextLevel();
    }
  }
  return { sim, events };
}

test("every maze is a closed grid: same width, mirrored, every path reachable and none a dead end", () => {
  for (const maze of MAZES) {
    const g = parseMaze(maze);
    for (const row of maze.rows) {
      assert.equal(row.length, g.w, `${maze.id}: a row of another width`);
      assert.equal([...row].reverse().join(""), row, `${maze.id}: a row is not mirrored: ${row}`);
    }
    const seen = new Set();
    const stack = [g.pig.y * g.w + g.pig.x];
    while (stack.length) {
      const i = stack.pop();
      if (seen.has(i)) {
        continue;
      }
      seen.add(i);
      const x = i % g.w;
      const y = Math.floor(i / g.w);
      for (const d of DIRS) {
        if (canEnter(g, x + d.x, y + d.y, "pig")) {
          stack.push((y + d.y) * g.w + wrapX(g, x + d.x));
        }
      }
    }
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        if (cellAt(g, x, y) !== PATH) {
          continue;
        }
        assert.ok(seen.has(y * g.w + x), `${maze.id}: ${x},${y} cannot be reached`);
        const ways = DIRS.filter((d) => cellAt(g, x + d.x, y + d.y) === PATH).length;
        const gate = x === g.gate.x && y === g.gate.y;
        assert.ok(ways >= 2 || gate, `${maze.id}: ${x},${y} is a dead end`);
      }
    }
    assert.equal(g.powers.length, 4, `${maze.id}: four rockets`);
    assert.ok(g.dots.length > 140, `${maze.id}: enough metadata to eat (${g.dots.length})`);
    // A tunnel row: its two edges are paths, and they lead to each other
    const tunnel = [...Array(g.h).keys()].filter((y) => cellAt(g, 0, y) === PATH);
    assert.ok(tunnel.length >= 1 && tunnel.every((y) => cellAt(g, g.w - 1, y) === PATH), `${maze.id}: a tunnel from side to side`);
  }
});

test("the ceiling of a maze adds up everything it can give, and grows with the levels", () => {
  const g = parseMaze(MAZES[0]);
  const caught = POINTS.admins.reduce((a, b) => a + b, 0);
  const expected = g.dots.length * POINTS.dot + 4 * POINTS.power + 4 * caught + 2 * 100 + POINTS.sweep + POINTS.cleanPerLevel;
  assert.equal(maxMazeScore(1), expected);
  assert.ok(maxMazeScore(4) > maxMazeScore(3) + 4 * POINTS.salesManager - 1, "the Sales Manager's mazes can give more");
  assert.equal(maxScoreThrough(3), maxMazeScore(1) + maxMazeScore(2) + maxMazeScore(3));
  assert.ok(salesManagerIn(4) && salesManagerIn(8) && !salesManagerIn(5));
});

test("the levels get faster and the blue shorter, never to nothing", () => {
  let previous = levelSettings(1);
  for (let level = 2; level <= 30; level++) {
    const s = levelSettings(level);
    assert.ok(s.admin >= previous.admin, `the admins never slow down (level ${level})`);
    assert.ok(s.frightened <= previous.frightened && s.frightened >= 1, `the blue shortens, at least one second (level ${level})`);
    assert.ok(s.admin < s.pig + 0.05, `the guinea pig stays about as fast as the admins (level ${level})`);
    previous = s;
  }
});

test("a seed replays the same game", () => {
  const a = play(7, 90).sim.summary();
  const b = play(7, 90).sim.summary();
  assert.deepEqual(a, b);
});

test("the admins all come out of the house, and caught ones go back in as eyes", () => {
  const out = new Set();
  let eyesHome = 0;
  const sim = createSim(seededRandom(3), () => {});
  const bot = createAutoplay(sim);
  sim.newGame(1);
  const wasEyes = new Set();
  for (let i = 0; i < 240 / DT && sim.state.phase !== "over"; i++) {
    bot.step();
    sim.update(DT);
    if (sim.state.phase === "cleared") {
      sim.nextLevel();
    }
    for (const a of sim.state.admins) {
      if (a.mode === "active") {
        out.add(a.id);
      }
      if (a.mode === "eyes") {
        wasEyes.add(a.id);
      } else if (wasEyes.has(a.id) && (a.mode === "leaving" || a.mode === "active")) {
        wasEyes.delete(a.id);
        eyesHome++;
      }
    }
  }
  assert.ok([0, 1, 2, 3].every((id) => out.has(id)), `the four admins played (${[...out]})`);
  assert.ok(eyesHome > 0, "a caught admin found the house and came out again");
});

/** Puts the guinea pig next to a dot, walking into it, and plays until it is eaten. */
function eatOneDot(sim) {
  const s = sim.state;
  const g = s.grid;
  for (const tile of g.dots) {
    if (!s.dots[tile]) {
      continue;
    }
    const x = tile % g.w;
    const y = Math.floor(tile / g.w);
    for (let dir = 0; dir < 4; dir++) {
      const d = DIRS[dir];
      const fromX = wrapX(g, x - d.x);
      const fromY = y - d.y;
      if (canEnter(g, fromX, fromY, "pig")) {
        s.pig.tx = fromX;
        s.pig.ty = fromY;
        s.pig.t = 0;
        s.pig.dir = dir;
        s.pig.want = dir;
        // Admins far away: back in the house
        for (const a of s.admins) {
          a.mode = "house";
          a.releaseAt = 999;
        }
        const left = s.left;
        for (let i = 0; i < 60 && s.left === left; i++) {
          sim.update(DT);
        }
        return;
      }
    }
  }
}

test("an extra life at 10,000 points, then every 100,000, never more than five", () => {
  const sim = createSim(seededRandom(1), () => {});
  sim.newGame(1);
  for (let i = 0; i < 3 / DT; i++) {
    sim.update(DT);
  }
  const s = sim.state;
  const lives = s.lives;
  s.score = EXTRA_FIRST - 5;
  eatOneDot(sim);
  assert.equal(s.lives, lives + 1, "one more life past 10,000");
  s.score = EXTRA_FIRST + 100000 - 5;
  s.lives = 5;
  eatOneDot(sim);
  assert.equal(s.lives, 5, "never more than five");
});

test("the bot of the check plays real games: it clears mazes and scores", () => {
  let cleared = 0;
  let best = 0;
  for (const seed of [3, 4, 9]) {
    const { sim, events } = play(seed, 600);
    cleared += events.cleared || 0;
    best = Math.max(best, sim.state.score);
    assert.ok(sim.state.score <= maxScoreThrough(sim.state.level), "never above the ceiling of the mazes reached");
  }
  assert.ok(cleared >= 2, `the bot cleared mazes (${cleared})`);
  assert.ok(best > 5000, `the bot scores (${best})`);
});

test("a check can jump to one dot left, and eating it clears the maze", () => {
  let clearedAt = null;
  const sim = createSim(seededRandom(5), (name, data) => {
    if (name === "cleared") {
      clearedAt = data.level;
    }
  });
  const bot = createAutoplay(sim);
  sim.newGame(1);
  for (let i = 0; i < 3 / DT; i++) {
    sim.update(DT);
  }
  sim.jump("clear");
  assert.equal(sim.state.left, 1);
  for (let i = 0; i < 20 / DT && clearedAt === null && sim.state.phase !== "over"; i++) {
    bot.step();
    sim.update(DT);
  }
  assert.equal(clearedAt, 1, "the last dot cleared maze 1");
  sim.nextLevel();
  assert.equal(sim.state.level, 2);
  assert.equal(sim.state.left, parseMaze(MAZES[1]).dots.length + 4, "maze 2 starts full");
});
