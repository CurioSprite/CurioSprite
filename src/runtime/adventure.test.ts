import { describe, expect, it } from 'vitest';
import { emptyActionState, type Action } from '../input/bindings';
import type { InputFrame } from '../input/InputManager';
import { createAdventureProject } from '../models/adventure';
import { createSprite } from '../models/defaults';
import { addLevel, levelView, removeLevel } from '../models/levels';
import { FLOOR_KEYS, NO_FLOOR, type LevelProject } from '../models/project';
import { parseProject, validateProject } from '../models/serialization';
import { floorAt, layoutOf, placeItem, removeItem, resizeLayout, setSpriteKind, spriteKindOf } from '../editor/levelOps';
import { chooseBattle, createGame, playerTile, stepGame, type GameState } from './game';

function frame(held: Action[] = [], pressed: Action[] = []): InputFrame {
  const f = { held: emptyActionState(), pressed: emptyActionState() };
  for (const a of held) f.held[a] = true;
  for (const a of pressed) f.pressed[a] = f.held[a] = true;
  return f;
}
const run = (g: GameState, steps: number, held: Action[] = []) => {
  for (let i = 0; i < steps; i++) stepGame(g, frame(held));
};
const press = (g: GameState, a: Action) => stepGame(g, frame([], [a]));
/** Holds a direction until the player has moved `squares` squares (or gives up). */
function walk(g: GameState, dir: Action, squares = 1) {
  for (let i = 0; i < squares; i++) {
    const from = playerTile(g);
    for (let n = 0; n < 60; n++) {
      stepGame(g, frame([dir]));
      const at = playerTile(g);
      if ((at.tx !== from.tx || at.ty !== from.ty) && !g.player.step) break;
    }
  }
  run(g, 2);
}

const adventure = (): LevelProject => levelView(createAdventureProject('Quest'), 0);

/** An adventure level with no ranger rules and no start message in the way. */
function quiet(setup?: (p: LevelProject) => void) {
  const p = adventure();
  p.rules = [];
  setup?.(p);
  return createGame(p);
}

describe('the adventure starter', () => {
  it('is a valid top-down game that moves square by square, with floor, wild creatures and turn-based battles', () => {
    const game = createAdventureProject('Quest');
    expect(validateProject(game).errors).toEqual([]);
    const [level] = game.levels;
    expect([level.mode, level.movement, game.settings.battle]).toEqual(['topdown', 'grid', 'turns']);
    expect(level.floorTypes.map((f) => f.kind)).toEqual(['ground', 'ground', 'grass', 'water', 'ground']);
    expect(level.enemies.length).toBe(2);
    // Nothing stands in the wild creatures' place: they only come out of the tall grass.
    expect(level.objects.filter((o) => level.enemies.some((e) => e.spriteId === o.spriteId))).toEqual([]);
    expect(level.tiles[level.playerStart.y][level.playerStart.x]).toBe('.');
  });

  it('can be added as a level to any game, reusing the kit sprites a second time', () => {
    const first = addLevel(createAdventureProject('Quest'), 'adventure');
    if (!first.ok) throw new Error(first.error);
    expect(first.project.sprites.length).toBe(createAdventureProject('x').sprites.length);
    expect(validateProject(first.project).errors).toEqual([]);
  });
});

describe('square-by-square movement', () => {
  it('moves one whole square at a time and stops exactly on it', () => {
    const g = quiet();
    const start = playerTile(g);
    walk(g, 'right');
    expect(playerTile(g)).toEqual({ tx: start.tx + 1, ty: start.ty });
    expect(g.player.step).toBeNull();
    expect(g.player.x % 1).toBe(0);
  });

  it('turns to face a wall without moving, and never walks into trees or water', () => {
    const g = quiet();
    const start = playerTile(g);
    // Trees line the top and left edges; the start is next to the left one.
    walk(g, 'left', 3);
    expect(playerTile(g).tx).toBe(1);
    expect(g.player.face).toEqual({ x: -1, y: 0 });
    // Water: the pond starts at x 17, rows 9–12.
    const p = adventure();
    p.rules = [];
    p.level.playerStart = { x: 16, y: 10 };
    const h = createGame(p);
    walk(h, 'right', 2);
    expect(playerTile(h)).toEqual({ tx: 16, ty: 10 });
    expect(start).toEqual({ tx: 2, ty: 7 });
  });
});

describe('talking', () => {
  it('facing the ranger and pressing A shows what they say, one line per A, while the game waits', () => {
    const p = adventure();
    p.rules = p.rules.filter((r) => r.when.on !== 'start');
    const g = createGame(p);
    g.hearts = 1;
    walk(g, 'right', 2);
    // The ranger stands just above: pressing up turns to face them.
    walk(g, 'up');
    expect(g.player.face).toEqual({ x: 0, y: -1 });
    press(g, 'primary');
    expect(g.dialog).toHaveLength(3);
    expect(g.dialog[0]).toMatch(/tall grass/);
    expect(g.hearts).toBe(2);
    // The game waits: walking does nothing until the lines are read.
    const at = playerTile(g);
    run(g, 30, ['down']);
    expect(playerTile(g)).toEqual(at);
    press(g, 'primary');
    press(g, 'primary');
    press(g, 'primary');
    expect(g.dialog).toEqual([]);
  });

  it('pressing A at nothing does nothing', () => {
    const g = quiet();
    press(g, 'primary');
    expect(g.dialog).toEqual([]);
  });
});

describe('tall grass', () => {
  it('wild creatures jump out as you walk through it; running away sends them back', () => {
    const p = adventure();
    p.rules = [];
    // Start in the middle of the first tall-grass patch (x 7–14, y 9–13).
    p.level.playerStart = { x: 8, y: 11 };
    const g = createGame(p);
    let steps = 0;
    while (!g.battle && steps < 80) {
      walk(g, steps % 10 < 5 ? 'right' : 'left');
      steps++;
    }
    expect(g.battle).not.toBeNull();
    const wild = g.enemies[g.battle!.enemy];
    expect(wild.wild).toBe(true);
    expect(wild.name).toMatch(/^Wild /);
    // Wild ones don't count towards "beat every enemy".
    expect(g.enemies.filter((e) => e.wild && !e.removed)).toEqual([]);
    run(g, 120);
    chooseBattle(g, 'run');
    run(g, 120);
    expect(g.battle).toBeNull();
    expect(g.enemies.some((e) => e.wild)).toBe(false);
  });

  it('nothing jumps out of plain grass or paths', () => {
    const g = quiet();
    for (let i = 0; i < 20; i++) walk(g, i % 2 ? 'left' : 'right', 3);
    expect(g.battle).toBeNull();
  });
});

describe('painting the floor', () => {
  const kit = () => {
    const p = adventure();
    const sprite = (name: string) => p.sprites.find((s) => s.name === name)!.id;
    return { l: layoutOf(p.level), grass: sprite('Grass'), water: sprite('Water'), ranger: sprite('Ranger') };
  };

  it('paints under things, and erasing a bare square takes its floor up', () => {
    const { l, water, ranger } = kit();
    const painted = placeItem(l, 4, 6, { kind: 'floor', spriteId: water });
    expect(floorAt(painted, 4, 6)).toBe(water);
    expect(painted.objects.some((o) => o.spriteId === ranger && o.x === 4 && o.y === 6)).toBe(true);
    const once = removeItem(painted, 4, 6);
    expect(floorAt(once, 4, 6)).toBe(water);
    expect(once.objects.some((o) => o.x === 4 && o.y === 6)).toBe(false);
    expect(floorAt(removeItem(once, 4, 6), 4, 6)).toBeNull();
  });

  it('a sprite made into floor moves its placed copies onto the floor; made solid again, they come back', () => {
    const { l } = kit();
    const rock = createSprite('Rock');
    const placed = placeItem(placeItem(l, 5, 3, { kind: 'decoration', spriteId: rock.id }), 6, 3, { kind: 'decoration', spriteId: rock.id });
    const floored = setSpriteKind(placed, rock.id, { kind: 'floor', floor: 'ground' });
    expect(spriteKindOf(floored, rock.id)).toEqual({ kind: 'floor', floor: 'ground' });
    expect(floored.objects.some((o) => o.spriteId === rock.id)).toBe(false);
    expect([floorAt(floored, 5, 3), floorAt(floored, 6, 3)]).toEqual([rock.id, rock.id]);
    const back = setSpriteKind(floored, rock.id, { kind: 'solid' });
    expect(back.objects.filter((o) => o.spriteId === rock.id)).toHaveLength(2);
    expect(back.floorTypes.some((f) => f.spriteId === rock.id)).toBe(false);
    // The other floor letters still point at the same sprites.
    expect(floorAt(back, 2, 7)).toBe(floorAt(l, 2, 7));
  });

  it('keeps the floor through resizing', () => {
    const { l, grass } = kit();
    const taller = resizeLayout(l, l.width, l.height + 15);
    expect(taller.floor).toHaveLength(taller.height);
    expect(floorAt(taller, 1, 15 + 1)).toBe(grass);
    expect(taller.floor[0]).toBe(NO_FLOOR.repeat(l.width));
  });

  it('is saved and loaded, and broken floors are refused', () => {
    const game = createAdventureProject('Quest');
    const back = parseProject(JSON.stringify(game));
    if (!back.ok) throw new Error(back.errors.join());
    expect(back.project.levels[0].floor).toEqual(game.levels[0].floor);
    const broken: any = JSON.parse(JSON.stringify(game));
    broken.levels[0].floor[0] = FLOOR_KEYS[30].repeat(game.levels[0].width);
    expect(parseProject(broken).ok).toBe(false);
  });
});

describe('doors between levels', () => {
  it('a "go to another level" rule sends the player there; deleting that level takes the rule away', () => {
    const made = addLevel(createAdventureProject('Quest'), 'topdown');
    if (!made.ok) throw new Error(made.error);
    let game = made.project;
    const [first, second] = game.levels;
    const ranger = game.sprites.find((s) => s.name === 'Ranger')!.id;
    game = { ...game, rules: [...game.rules, { id: 'door', when: { on: 'talk', spriteId: ranger }, then: { do: 'goLevel', levelId: second.id }, levelId: first.id }] };
    expect(validateProject(game).errors).toEqual([]);

    const p = levelView(game, 0);
    p.rules = p.rules.filter((r) => r.when.on !== 'start');
    const g = createGame(p);
    walk(g, 'right', 2);
    walk(g, 'up');
    press(g, 'primary');
    expect(g.goTo).toBe(second.id);

    const broken: any = JSON.parse(JSON.stringify(game));
    broken.rules.find((r: any) => r.id === 'door').then.levelId = 'nowhere';
    expect(parseProject(broken).ok).toBe(false);

    const removed = removeLevel(game, 1);
    if (!removed.ok) throw new Error(removed.error);
    expect(removed.project.rules.some((r) => r.id === 'door')).toBe(false);
  });
});
