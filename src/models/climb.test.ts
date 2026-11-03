import { describe, expect, it } from 'vitest';
import { createProject } from './defaults';
import { SCREEN_TILES, TILE } from './project';
import { validateProject } from './serialization';

/** Each row's solid runs, as [from, to]. */
const runs = (row: string): Array<[number, number]> => {
  const out: Array<[number, number]> = [];
  for (let x = 0; x < row.length; x++) {
    if (row[x] !== TILE.solid) continue;
    const from = x;
    while (row[x + 1] === TILE.solid) x++;
    out.push([from, x]);
  }
  return out;
};

describe('climb starter', () => {
  const p = createProject('Tower', new Date(), 'platformer', true);
  const { tiles, width, height } = p.levels[0];

  it('is a side-view tower, one screen wide and three tall, with the flag at the top', () => {
    expect(p.levels[0].mode).toBe('platformer');
    expect(width).toBe(SCREEN_TILES.width);
    expect(height).toBe(SCREEN_TILES.height * 3);
    const goal = p.levels[0].objects.find((o) => o.kind === 'goal')!;
    expect(goal.y).toBeLessThan(SCREEN_TILES.height / 2);
    expect(p.levels[0].playerStart.y).toBeGreaterThan(height - SCREEN_TILES.height);
    expect(validateProject(p).errors).toEqual([]);
  });

  it('every ledge is one jump above the last, beside it rather than overhead, with a gap to jump through', () => {
    const ledges = tiles.map((row, y) => ({ y, runs: runs(row) })).filter((r) => r.runs.length && r.y < height - 2);
    let below = { y: height - 2, run: [0, width - 1] as [number, number] };
    for (const ledge of [...ledges].reverse()) {
      const [run] = ledge.runs;
      expect(below.y - ledge.y).toBeLessThanOrEqual(3);
      if (below.y < height - 2) {
        // No overlap, and at least one open column between them.
        expect(run[1] < below.run[0] - 1 || run[0] > below.run[1] + 1).toBe(true);
      }
      below = { y: ledge.y, run };
    }
  });

  it('only climb games get the tower', () => {
    expect(createProject('t').levels[0].height).toBe(SCREEN_TILES.height);
    expect(createProject('t', new Date(), 'topdown', true).levels[0].height).toBe(SCREEN_TILES.height);
  });
});

describe('climbing the starter tower', () => {
  it('a simple bot can jump from ledge to ledge all the way to the flag', async () => {
    const { createGame, stepGame } = await import('../runtime/game');
    const { emptyActionState } = await import('../input/bindings');
    const p = createProject('Tower', new Date(), 'platformer', true);
    // Only the jumping is being tested: no enemies in the way.
    p.levels[0].objects = p.levels[0].objects.filter((o) => o.kind !== 'sprite');
    const { levelView } = await import('./levels');
    const g = createGame(levelView(p, 0));
    const ts = g.tileSize;
    // Ledges from the bottom up, as [from, to] columns and the row.
    const ledges = p.levels[0].tiles
      .map((row, y) => ({ y, run: runs(row)[0] }))
      .filter((l) => l.run && l.y < p.levels[0].height - 2)
      .reverse();
    const goal = p.levels[0].objects.find((o) => o.kind === 'goal')!;
    let next: (typeof ledges)[number] | undefined = ledges[0];
    for (let step = 0; step < 60 * 90 && g.status === 'playing'; step++) {
      const pl = g.player;
      // Standing: aim for the next ledge above; past the last one, walk to the flag.
      if (pl.onGround) {
        const feetRow = Math.round((pl.y + pl.h) / ts);
        next = ledges.find((l) => l.y < feetRow);
      }
      const target = next ? next.run : ([goal.x, goal.x] as [number, number]);
      const left = target[0] * ts;
      const right = (target[1] + 1) * ts;
      const f = { held: emptyActionState(), pressed: emptyActionState() };
      const centre = pl.x + pl.w / 2;
      const towards: 'left' | 'right' = centre < (left + right) / 2 ? 'right' : 'left';
      const gap = pl.x + pl.w <= left ? left - (pl.x + pl.w) : pl.x >= right ? pl.x - right : -1;
      if (!next) {
        f.held[towards] = true; // on the top: walk to the flag
      } else if (!pl.onGround) {
        f.held[towards] = true;
        f.held.primary = true;
      } else if (gap < 6) {
        // Under (or right against) the ledge: step back out to jump at it.
        f.held[towards === 'right' ? 'left' : 'right'] = true;
      } else if (gap > 20) {
        f.held[towards] = true;
      } else {
        f.held[towards] = true;
        f.pressed.primary = f.held.primary = true;
      }
      stepGame(g, f);
    }
    expect(g.status).toBe('won');
  });
});

describe('which way a side-view level goes', () => {
  it('new games go across, climbs go up, and it is saved', async () => {
    const { parseProject } = await import('./serialization');
    expect(createProject('t').levels[0].direction).toBe('across');
    const climb = createProject('t', new Date(), 'platformer', true);
    expect(climb.levels[0].direction).toBe('up');
    const back = parseProject(JSON.stringify(climb));
    expect(back.ok && back.project.levels[0].direction).toBe('up');
    const broken: any = JSON.parse(JSON.stringify(climb));
    broken.levels[0].direction = 'sideways';
    expect(parseProject(broken).ok).toBe(false);
  });

  it('older games are read as going up only if they are a tall one-screen tower', async () => {
    const { parseProject } = await import('./serialization');
    // A game saved before levels, and before climbs: one level, its view in the settings.
    const old = (p: ReturnType<typeof createProject>) => {
      const raw: any = JSON.parse(JSON.stringify(p));
      const { mode, direction: _d, winRule, ...level } = raw.levels[0];
      raw.schemaVersion = 3;
      raw.level = level;
      delete raw.levels;
      raw.settings = { ...raw.settings, mode, winRule };
      return parseProject(raw);
    };
    const tower = old(createProject('t', new Date(), 'platformer', true));
    expect(tower.ok && tower.project.levels[0].direction).toBe('up');
    const run = old(createProject('t'));
    expect(run.ok && run.project.levels[0].direction).toBe('across');
  });

  it('turning a run into a climb stacks the same number of screens on top, keeping the first screen', async () => {
    const { layoutLoses, layoutOf, reshapeLayout } = await import('../editor/levelOps');
    const run = layoutOf(createProject('t').levels[0]); // 2 screens across
    const up = reshapeLayout(run, 'up');
    expect([up.width, up.height]).toEqual([SCREEN_TILES.width, SCREEN_TILES.height * 2]);
    // The ground of the first screen is still at the bottom.
    expect(up.tiles[up.height - 1].slice(0, 10)).toBe(run.tiles[run.height - 1].slice(0, 10));
    expect(layoutLoses(run, up)).toBe(true);
    const back = reshapeLayout(up, 'across');
    expect([back.width, back.height]).toEqual([SCREEN_TILES.width * 2, SCREEN_TILES.height]);
    expect(layoutLoses(up, back)).toBe(false);
  });
});
