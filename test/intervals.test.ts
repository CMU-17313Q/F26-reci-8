import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { mergeIntervals, type Interval } from '../src/intervals';

// Read the spec in src/intervals/mergeIntervals.ts, then check your progress
// with `npm run mutants:intervals`.
//
// Label every property with its pattern, on the line above its `it(`:
//   // Pattern: invariant. The output is sorted.
// (invariant, algebraic, metamorphic, differential, or conditional)

// A first attempt at a generator. It has a problem: run the tests and read
// the counterexample.
const interval: fc.Arbitrary<Interval> = fc.tuple(fc.integer({ min: -20, max: 20 }), fc.integer({ min: -20, max: 20 })).map(([a, b]) => [Math.min(a, b), Math.max(a, b)]);
const intervalList = fc.array(interval);

describe('mergeIntervals', () => {
  // Pattern: invariant. Every input interval lies inside some output interval.
  it('every input interval lies inside some output interval', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        const uncovered = xs.filter(([s, e]) => !out.some(([a, b]) => a <= s && e <= b));
        expect(uncovered).toEqual([]);
      }),
    );
  });

  // Add your properties here. Aim for at least one of each pattern:
  // invariant, algebraic, metamorphic, differential, conditional.
  // Pattern: invariant. Output is sorted, valid, and strictly separated.
  it('output is sorted, valid, and strictly separated', () => {
    fc.assert(fc.property(intervalList, xs => {
      const out = mergeIntervals(xs);
      out.forEach(([s, e], i) => {
        expect(Number.isInteger(s) && Number.isInteger(e) && s <= e).toBe(true);
        if (i) expect(out[i - 1][1]).toBeLessThan(s);
      });
    }));
  });
  // Pattern: differential. Input and output cover the same real points.
  it('input and output cover the same real points', () => {
    fc.assert(fc.property(intervalList, xs => {
      const out = mergeIntervals(xs);
      const endpoints = [...new Set([...xs, ...out].flat())].sort((a, b) => a - b);
      const probes = endpoints.flatMap((x, i) => i ? [x, (endpoints[i - 1] + x) / 2] : [x]);
      if (endpoints.length) probes.push(endpoints[0] - 1, endpoints[endpoints.length - 1] + 1);
      const covers = (ys: Interval[], p: number) => ys.some(([s, e]) => s <= p && p <= e);
      for (const p of probes) expect(covers(out, p)).toBe(covers(xs, p));
    }));
  });
  // Pattern: metamorphic. Permuting and duplicating input preserves the result.
  it('permuting and duplicating input preserves the result', () => {
    fc.assert(fc.property(intervalList.chain(xs => fc.shuffledSubarray(xs, { minLength: xs.length, maxLength: xs.length }).map(shuffled => ({ xs, shuffled }))), ({ xs, shuffled }) => {
      expect(mergeIntervals([...shuffled, ...shuffled])).toEqual(mergeIntervals(xs));
    }));
  });
  // Pattern: algebraic. Merging twice equals merging once.
  it('merging twice equals merging once', () => {
    fc.assert(fc.property(intervalList, xs => {
      const out = mergeIntervals(xs);
      expect(mergeIntervals(out)).toEqual(out);
    }));
  });
  // Pattern: conditional. Already separated intervals are unchanged.
  it('already separated intervals are unchanged', () => {
    fc.assert(fc.property(fc.array(fc.tuple(fc.nat(4), fc.integer({ min: 1, max: 4 }))), parts => {
      let cursor = -30;
      const xs: Interval[] = parts.map(([width, gap]) => {
        const start = cursor; cursor += width + gap;
        return [start, start + width];
      });
      expect(mergeIntervals(xs)).toEqual(xs);
    }));
  });
  // Pattern: invariant. Merging does not modify the input or its intervals.
  it('merging does not modify the input or its intervals', () => {
    fc.assert(fc.property(intervalList, xs => {
      const before = xs.map(([s, e]): Interval => [s, e]);
      mergeIntervals(xs);
      expect(xs).toEqual(before);
    }));
  });
  // Pattern: conditional. Intervals sharing an endpoint merge.
  it('intervals sharing an endpoint merge', () => {
    fc.assert(fc.property(fc.integer({ min: -100, max: 100 }), fc.nat(20), fc.nat(20), (s, a, b) => {
      expect(mergeIntervals([[s, s + a], [s + a, s + a + b]])).toEqual([[s, s + a + b]]);
    }));
  });
});
