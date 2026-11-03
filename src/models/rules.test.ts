import { describe, expect, it } from 'vitest';
import { createLevelProject } from '../testing';
import type { Rule } from './project';
import { describeTrigger, ruleSprites, ruleSubject } from './rules';

const r = (when: Rule['when']): Rule => ({ id: 'x', when, then: { do: 'win' } });

describe('rule grouping', () => {
  it('sorts rules into the whole game, treasure, or one sprite', () => {
    expect(ruleSubject(r({ on: 'start' }))).toEqual({ kind: 'game' });
    expect(ruleSubject(r({ on: 'beat', count: 'all' }))).toEqual({ kind: 'game' });
    expect(ruleSubject(r({ on: 'collect', count: 3 }))).toEqual({ kind: 'treasure' });
    expect(ruleSubject(r({ on: 'touch', spriteId: 'k' }))).toEqual({ kind: 'sprite', spriteId: 'k' });
    expect(ruleSubject(r({ on: 'beat', count: 'each', spriteId: 's' }))).toEqual({ kind: 'sprite', spriteId: 's' });
  });

  it('names the sprite in "beaten" rules and leaves role sprites out of sprite sections', () => {
    const p = createLevelProject('t');
    const slime = p.level.enemies[0].spriteId;
    expect(describeTrigger({ on: 'beat', count: 'each', spriteId: slime }, p)).toBe('a Slime is beaten');
    expect(describeTrigger({ on: 'beat', count: 'all', spriteId: slime }, p)).toBe('every Slime is beaten');
    expect(ruleSprites(p).map((s) => s.name)).toEqual(['Slime']);
  });
});
