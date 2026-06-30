import { describe, expect, it } from "vitest";
import { PlaySim, type PlaySetup } from "./engine";
import { DEF_PLAYS, OFF_PLAYS, getDefPlay, getOffPlay } from "./playbook";
import { RNG } from "./rng";
import { DEFAULT_TEAMS } from "./roster";
import { FIELD } from "./constants";
import { GameFlow, type GameInfo } from "./game";
import { pickDefense, pickOffense, DEFAULT_PHILOSOPHY } from "./coordinator";

function makeSetup(seed: number, offId: string, defId: string): PlaySetup {
  const teams = DEFAULT_TEAMS(seed);
  return {
    offPlay: getOffPlay(offId),
    defPlay: getDefPlay(defId),
    offRoster: teams.home.offense,
    defRoster: teams.away.defense,
    ballY: FIELD.WIDTH / 2,
    yardsToGoal: 75,
    rng: new RNG(seed ^ 0x777),
  };
}

describe("expanded playbook", () => {
  it("every offense × defense matchup resolves with 22 agents and a valid end", () => {
    for (const off of OFF_PLAYS) {
      for (const def of DEF_PLAYS) {
        const sim = new PlaySim(makeSetup(3, off.id, def.id));
        expect(sim.agents).toHaveLength(22);
        const r = sim.runToCompletion();
        expect(r.endReason).toBeDefined();
        expect(Number.isFinite(r.yards)).toBe(true);
      }
    }
  });

  it("the draw hands off later than a standard run", () => {
    expect(getOffPlay("draw").handoffTick).toBeGreaterThan(8);
    const r = new PlaySim(makeSetup(5, "draw", "cover3-base")).runToCompletion();
    expect(r.isPass).toBe(false);
  });
});

describe("penalties", () => {
  function g(): GameFlow {
    const game = new GameFlow(DEFAULT_TEAMS(1), new RNG(1));
    game.possession = "home";
    game.down = 2;
    game.distance = 10;
    game.ballOn = 40;
    return game;
  }

  it("false start moves the offense back and replays the down", () => {
    const game = g();
    const out = game.applyPenalty("falseStart");
    expect(out.penalizedTeam).toBe("home");
    expect(game.ballOn).toBe(35);
    expect(game.distance).toBe(15);
    expect(game.down).toBe(2);
  });

  it("pass interference advances the ball and grants a first down", () => {
    const game = g();
    const out = game.applyPenalty("passInterference");
    expect(out.firstDown).toBe(true);
    expect(game.ballOn).toBe(55);
    expect(game.down).toBe(1);
    expect(game.distance).toBe(10);
  });

  it("never moves the ball past a goal line (half the distance)", () => {
    const game = g();
    game.ballOn = 96; // PI of 15 would cross the goal
    game.applyPenalty("passInterference");
    expect(game.ballOn).toBeLessThan(100);
  });
});

describe("situational AI", () => {
  const base: GameInfo = {
    quarter: 1, clock: 600, possession: "home", down: 1, distance: 10,
    ballOn: 25, score: { home: 0, away: 0 }, gameOver: false,
  };

  it("always returns plays that exist in the playbook", () => {
    const rng = new RNG(99);
    for (let i = 0; i < 200; i++) {
      const info: GameInfo = {
        ...base,
        down: 1 + (i % 4),
        distance: 1 + (i % 15),
        ballOn: 1 + (i % 98),
        quarter: 1 + (i % 4),
        clock: (i * 37) % 600,
        score: { home: i % 21, away: (i * 2) % 21 },
      };
      const off = pickOffense(info, DEFAULT_PHILOSOPHY, rng, ((i % 3) - 1));
      const def = pickDefense(info, DEFAULT_PHILOSOPHY, rng, ((i % 3) - 1));
      expect(OFF_PLAYS.some((p) => p.id === off)).toBe(true);
      expect(DEF_PLAYS.some((p) => p.id === def)).toBe(true);
    }
  });
});
