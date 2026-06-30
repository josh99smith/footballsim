/**
 * Balance harness — simulates many plays and full games headlessly and reports
 * stat distributions, to guide tuning. Deterministic (seeded). Not a test.
 *
 *   npx vite-node scripts/balance.ts
 */
import { PlaySim } from "../src/sim/engine";
import { OFF_PLAYS, DEF_PLAYS, getOffPlay, getDefPlay } from "../src/sim/playbook";
import { RNG } from "../src/sim/rng";
import { DEFAULT_TEAMS } from "../src/sim/roster";
import { FIELD } from "../src/sim/constants";
import { GameFlow } from "../src/sim/game";
import { pickOffense, pickDefense, fourthDownDecision, DEFAULT_PHILOSOPHY } from "../src/sim/coordinator";

function setup(seed: number, off: string, def: string, ballOn = 25) {
  const t = DEFAULT_TEAMS(seed);
  return {
    offPlay: getOffPlay(off), defPlay: getDefPlay(def),
    offRoster: t.home.offense, defRoster: t.away.defense,
    ballY: FIELD.WIDTH / 2, yardsToGoal: 100 - ballOn, rng: new RNG(seed ^ 0x777),
  };
}

const N = Number(process.argv[2] ?? 200);

console.log(`\n=== Per-play distributions (${N} reps each) ===`);
const defs = DEF_PLAYS.map((d) => d.id);
for (const off of OFF_PLAYS) {
  let sum = 0, att = 0, comp = 0, td = 0, ints = 0, sacks = 0;
  const yards: number[] = [];
  for (let s = 0; s < N; s++) {
    const def = defs[s % defs.length];
    const r = new PlaySim(setup(s, off.id, def)).runToCompletion();
    sum += r.yards; yards.push(r.yards);
    if (r.isPass) {
      if (r.endReason === "sack") { sacks++; }
      else {
        att++;
        // A completion is a pass that wasn't incomplete or picked.
        if (r.endReason !== "incomplete" && r.endReason !== "interception") comp++;
        if (r.endReason === "interception") ints++;
      }
    }
    if (r.touchdown) td++;
  }
  void td; void yards;
  const mean = (sum / N).toFixed(2);
  const pass = att ? ` comp%=${((comp / att) * 100).toFixed(0)} int=${ints} sack=${sacks}` : "";
  console.log(`${off.name.padEnd(18)} mean=${mean.padStart(6)}${pass}`);
}

// Run game vs a neutral base front, for tuning reference.
console.log(`\n=== Runs vs 4-3 Cover 3 (neutral front) ===`);
for (const off of OFF_PLAYS.filter((p) => p.type === "run")) {
  let sum = 0;
  for (let s = 0; s < N; s++) sum += new PlaySim(setup(s, off.id, "cover3-base")).runToCompletion().yards;
  console.log(`${off.name.padEnd(18)} mean=${(sum / N).toFixed(2)}`);
}

console.log(`\n=== Full-game scores (${Math.min(N, 30)} games) ===`);
const phi = DEFAULT_PHILOSOPHY;
let totHome = 0, totAway = 0, totPlays = 0, games = Math.min(N, 30);
for (let g = 0; g < games; g++) {
  const teams = DEFAULT_TEAMS(2000 + g);
  const flow = new GameFlow(teams, new RNG(2000 + g));
  let guard = 0;
  while (!flow.gameOver && guard++ < 3000) {
    const info = flow.info();
    if (info.down === 4) {
      const d = fourthDownDecision(info, phi, flow.rng);
      if (d === "punt") { flow.punt(); continue; }
      if (d === "fieldGoal") { flow.fieldGoalAttempt(); continue; }
    }
    const sim = flow.createSnap(pickOffense(info, phi, flow.rng), pickDefense(info, phi, flow.rng));
    flow.commitPlayResult(sim.runToCompletion());
    totPlays++;
  }
  totHome += flow.score.home; totAway += flow.score.away;
}
console.log(`avg final: HOME ${(totHome / games).toFixed(1)} - ${(totAway / games).toFixed(1)} AWAY`);
console.log(`avg plays/game: ${(totPlays / games).toFixed(0)}`);
