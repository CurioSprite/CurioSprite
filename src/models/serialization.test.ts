import { describe, expect, it } from 'vitest';
import { createProject } from './defaults';
import { PROJECT_FORMAT, PROJECT_SCHEMA_VERSION, TILE } from './project';
import { duplicateProject, migrateLegacyProject, parseProject, serializeProject, validateProject } from './serialization';

/** A game as saved before levels (schema v3): one `level`, its view and win rule in the settings. */
function asV3(p: unknown): any {
  const raw: any = JSON.parse(JSON.stringify(p));
  const { mode, direction: _direction, winRule, ...level } = raw.levels[0];
  delete raw.levels;
  return { ...raw, schemaVersion: 3, level, settings: { ...raw.settings, mode, winRule } };
}

describe('default project', () => {
  it('is valid and playable', () => {
    const p = createProject('Space Cat');
    expect(validateProject(p).errors).toEqual([]);
    expect(p.meta.name).toBe('Space Cat');
    expect(p.sprites.find((s) => s.id === p.player.spriteId)).toBeDefined();
    expect(p.levels[0].objects.some((o) => o.kind === 'treasure')).toBe(true);
    expect(p.levels[0].tiles).toHaveLength(p.levels[0].height);
  });

  it('gets a unique id every time', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createProject('x').id));
    expect(ids.size).toBe(50);
  });
});

describe('serializeProject / parseProject', () => {
  it('round-trips without losing data', () => {
    const p = createProject('Round Trip');
    p.sprites[0].pixels[5] = 7;
    p.levels[0].mode = 'topdown';
    const json = serializeProject(p);
    const doc = JSON.parse(json);
    expect(doc.format).toBe(PROJECT_FORMAT);
    expect(doc.version).toBe(PROJECT_SCHEMA_VERSION);

    const parsed = parseProject(json);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.project).toEqual(p);
      expect(parsed.migrated).toBe(false);
    }
  });

  it('accepts a bare stored project object', () => {
    const p = createProject('Bare');
    const parsed = parseProject(JSON.parse(JSON.stringify(p)));
    expect(parsed.ok).toBe(true);
  });

  it('rejects invalid JSON', () => {
    expect(parseProject('{nope')).toEqual({ ok: false, errors: ['File is not valid JSON'] });
  });

  it('rejects files from a newer version', () => {
    const r = parseProject({ format: PROJECT_FORMAT, version: 99, project: {} });
    expect(r.ok).toBe(false);
  });

  it('rejects other formats', () => {
    expect(parseProject({ format: 'something-else', version: 1 }).ok).toBe(false);
    expect(parseProject(42).ok).toBe(false);
    expect(parseProject(null).ok).toBe(false);
  });

  it.each([
    ['wrong pixel count', (p: any) => (p.sprites[0].pixels = [1, 2, 3])],
    ['colour index outside palette', (p: any) => (p.sprites[0].pixels[0] = 999)],
    ['unsupported sprite size', (p: any) => (p.sprites[0].width = 20)],
    ['missing player sprite', (p: any) => (p.player.spriteId = 'missing')],
    ['ragged level row', (p: any) => (p.levels[0].tiles[0] = '..')],
    ['unknown tile', (p: any) => (p.levels[0].tiles[0] = 'X'.repeat(p.levels[0].width))],
    ['bad colour', (p: any) => (p.palette[0] = 'red')],
    ['empty name', (p: any) => (p.meta.name = '   ')],
    ['unknown mode', (p: any) => (p.levels[0].mode = 'flying-saucer')],
    ['NaN speed', (p: any) => (p.player.speed = Number.NaN)],
    ['missing meta', (p: any) => delete p.meta],
  ])('reports corruption: %s', (_label, corrupt) => {
    const p = JSON.parse(JSON.stringify(createProject('Broken')));
    corrupt(p);
    const r = parseProject(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThan(0);
  });

  it('does not share arrays with its input', () => {
    const p = createProject('Copy');
    const parsed = parseProject(p);
    if (!parsed.ok) throw new Error('expected ok');
    parsed.project.sprites[0].pixels[0] = 3;
    expect(p.sprites[0].pixels[0]).not.toBe(3);
  });
});

describe('placed sprites', () => {
  it('treats a missing walk-through list as "everything solid"', () => {
    const p: any = JSON.parse(JSON.stringify(createProject('t')));
    delete p.levels[0].passThroughSpriteIds;
    const r = parseProject(p);
    expect(r.ok && r.project.levels[0].passThroughSpriteIds).toEqual([]);
  });

  it('rejects walk-through entries for missing sprites', () => {
    const p: any = JSON.parse(JSON.stringify(createProject('t')));
    p.levels[0].passThroughSpriteIds = ['nope'];
    expect(parseProject(p).ok).toBe(false);
  });
});

describe('win rules and goals', () => {
  it('new games are won by reaching a goal flag', () => {
    const p = createProject('t');
    expect(p.levels[0].winRule).toBe('goal');
    expect(p.levels[0].objects.some((o) => o.kind === 'goal')).toBe(true);
    expect(p.sprites.find((s) => s.id === p.levels[0].goalSpriteId)?.name).toBe('Flag');
  });

  it('older games keep "collect every coin" and get a Flag sprite with a stable id', () => {
    const p = asV3(createProject('t'));
    const oldFlag = p.level.goalSpriteId;
    p.sprites = p.sprites.filter((s: any) => s.id !== oldFlag);
    p.level.tiles = p.level.tiles.map((r: string) => r.replace(/G/g, '.'));
    delete p.level.goalSpriteId;
    delete p.settings.winRule;
    const a = parseProject(p);
    const b = parseProject(p);
    if (!a.ok || !b.ok) throw new Error('expected ok');
    expect(a.project.levels[0].winRule).toBe('coins');
    expect(a.project.levels[0].goalSpriteId).toBe('starter-flag');
    expect(a.project.sprites.map((s) => s.id)).toEqual(b.project.sprites.map((s) => s.id));
    expect(validateProject(a.project).errors).toEqual([]);
  });

  it('rejects an unknown win rule', () => {
    const p: any = JSON.parse(JSON.stringify(createProject('t')));
    p.levels[0].winRule = 'fastest';
    expect(parseProject(p).ok).toBe(false);
  });
});

describe('upgrading schema v2 levels', () => {
  /** A game as CurioSprite saved it before objects existed. */
  function v2Game() {
    const p = asV3(createProject('Old'));
    const slime = p.level.enemies[0].spriteId;
    p.schemaVersion = 2;
    delete p.level.objects;
    const rows = p.level.tiles.map((r: string) => r.split(''));
    rows[5][3] = '*';
    rows[5][4] = 'G';
    p.level.tiles = rows.map((r: string[]) => r.join(''));
    p.level.decorations = [{ spriteId: slime, x: 6, y: 5 }];
    return p;
  }

  it('turns treasure / goal letters and placed sprites into objects, with the same ids every time', () => {
    const saved = JSON.stringify(v2Game());
    const a = parseProject(saved);
    const b = parseProject(saved);
    if (!a.ok || !b.ok) throw new Error(a.ok ? '' : a.errors.join());
    expect(a.project.schemaVersion).toBe(4);
    expect(a.project.levels[0].tiles.join('')).not.toMatch(/[*G]/);
    expect(a.project.levels[0].objects).toEqual([
      { id: 'o-3-5', kind: 'treasure', x: 3, y: 5, n: 1 },
      { id: 'o-4-5', kind: 'goal', x: 4, y: 5, n: 1 },
      { id: 'o-6-5', kind: 'sprite', spriteId: a.project.levels[0].enemies[0].spriteId, x: 6, y: 5, n: 1 },
    ]);
    expect(b.project.levels[0].objects).toEqual(a.project.levels[0].objects);
    expect(validateProject(a.project).errors).toEqual([]);
  });

  it('rejects two objects on one square, and unknown kinds', () => {
    const p: any = JSON.parse(JSON.stringify(createProject('t')));
    p.levels[0].objects.push({ ...p.levels[0].objects[0], id: 'twin' });
    expect(parseProject(p).ok).toBe(false);
    const q: any = JSON.parse(JSON.stringify(createProject('t')));
    q.levels[0].objects[0].kind = 'cloud';
    expect(parseProject(q).ok).toBe(false);
  });
});

describe('views, enemies and hearts', () => {
  it.each(['platformer', 'topdown'] as const)('a new %s game is valid, with enemies placed on open squares', (view) => {
    const p = createProject('t', new Date(), view);
    expect(validateProject(p).errors).toEqual([]);
    expect(p.levels[0].mode).toBe(view);
    expect(p.levels[0].enemies).toHaveLength(1);
    expect(p.levels[0].objects.length).toBeGreaterThan(0);
    for (const o of p.levels[0].objects) expect(p.levels[0].tiles[o.y][o.x]).toBe(TILE.empty);
    expect(p.levels[0].tiles[p.levels[0].playerStart.y][p.levels[0].playerStart.x]).toBe(TILE.empty);
  });

  it('older games get no enemies, 3 hearts and action battles', () => {
    const p: any = JSON.parse(JSON.stringify(createProject('t')));
    delete p.levels[0].enemies;
    p.levels[0].objects = [];
    delete p.player.hearts;
    delete p.settings.battle;
    const r = parseProject(p);
    if (!r.ok) throw new Error(r.errors.join());
    expect(r.project.levels[0].enemies).toEqual([]);
    expect(r.project.player.hearts).toBe(3);
    expect(r.project.settings.battle).toBe('action');
  });

  it('an enemy is never also walk-through', () => {
    const p: any = JSON.parse(JSON.stringify(createProject('t')));
    p.levels[0].passThroughSpriteIds = [p.levels[0].enemies[0].spriteId];
    const r = parseProject(p);
    expect(r.ok && r.project.levels[0].passThroughSpriteIds).toEqual([]);
  });

  it.each([
    ['missing sprite', (p: any) => (p.levels[0].enemies[0].spriteId = 'nope')],
    ['bad hp', (p: any) => (p.levels[0].enemies[0].hp = 0)],
    ['unknown moves', (p: any) => (p.levels[0].enemies[0].moves = 'teleport')],
    ['bad hearts', (p: any) => (p.player.hearts = 99)],
    ['unknown battle style', (p: any) => (p.settings.battle = 'cards')],
  ])('rejects %s', (_label, corrupt) => {
    const p: any = JSON.parse(JSON.stringify(createProject('t')));
    corrupt(p);
    expect(parseProject(p).ok).toBe(false);
  });
});

describe('rules', () => {
  it('new games come with example rules; older games get none', () => {
    const p: any = JSON.parse(JSON.stringify(createProject('t')));
    expect(p.rules.length).toBeGreaterThan(0);
    delete p.rules;
    const r = parseProject(p);
    expect(r.ok && r.project.rules).toEqual([]);
  });

  it.each([
    ['unknown trigger', { id: 'a', when: { on: 'dance' }, then: { do: 'win' } }],
    ['touch a missing sprite', { id: 'a', when: { on: 'touch', spriteId: 'nope' }, then: { do: 'win' } }],
    ['empty message', { id: 'a', when: { on: 'start' }, then: { do: 'message', text: '  ' } }],
    ['bad count', { id: 'a', when: { on: 'collect', count: 0 }, then: { do: 'win' } }],
    ['an attack on two things at once', { id: 'a', when: { on: 'hit', spriteId: 'x', objectId: 'y' }, then: { do: 'win' } }],
    ['beaten for a missing sprite', { id: 'a', when: { on: 'beat', count: 'each', spriteId: 'nope' }, then: { do: 'win' } }],
  ])('rejects a rule with %s', (_label, bad) => {
    const p: any = JSON.parse(JSON.stringify(createProject('t')));
    p.rules = [bad];
    expect(parseProject(p).ok).toBe(false);
  });
});

describe('legacy 0.1 migration', () => {
  const legacyPixels = Array.from({ length: 256 }, (_, i) => (i === 0 ? '#ffcf4a' : i === 1 ? '#101828' : '#00000000'));

  it('upgrades a stored 0.1 project and keeps its id and drawing', () => {
    const r = migrateLegacyProject({ id: 'abc123', name: 'Old Quest', createdAt: 1700000000000, sprites: [{ id: 's', name: 'Hero', pixels: legacyPixels }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { project } = r;
    expect(project.id).toBe('abc123');
    expect(project.meta.name).toBe('Old Quest');
    const hero = project.sprites.find((s) => s.id === project.player.spriteId)!;
    expect(project.palette[hero.pixels[0] - 1]).toBe('#ffcf4a');
    expect(project.palette[hero.pixels[1] - 1]).toBe('#101828');
    expect(hero.pixels[2]).toBe(0);
  });

  it('upgrades a 0.1 exported file through parseProject', () => {
    const r = parseProject({ format: PROJECT_FORMAT, version: 1, project: { id: 'x', name: 'Exported', sprites: [{ pixels: legacyPixels }] } });
    expect(r.ok && r.migrated).toBe(true);
  });

  it('rejects a legacy project with no usable sprite', () => {
    expect(migrateLegacyProject({ name: 'Empty', sprites: [{ pixels: [] }] }).ok).toBe(false);
  });
});

describe('duplicateProject', () => {
  it('creates an independent copy with a new id', () => {
    const p = createProject('Original');
    p.revision = 4;
    const copy = duplicateProject(p, 'Copy');
    expect(copy.id).not.toBe(p.id);
    expect(copy.revision).toBe(0);
    expect(copy.meta.name).toBe('Copy');
    copy.sprites[0].pixels[0] = 9;
    expect(p.sprites[0].pixels[0]).not.toBe(9);
  });
});
