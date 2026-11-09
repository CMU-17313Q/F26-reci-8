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
const interval: fc.Arbitrary<Interval> = fc
  .tuple(fc.integer({ min: -20, max: 20 }), fc.integer({ min: -20, max: 20 }))
  .map(([a, b]) => [Math.min(a, b), Math.max(a, b)] as Interval);
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
  // Pattern: invariant. Output intervals are sorted and never overlap or touch.
  it('output intervals are sorted and disjoint', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);

        for (let i = 0; i < out.length - 1; i++) {
          expect(out[i][1]).toBeLessThan(out[i + 1][0]);
        }
      }),
    );
  });
    // Pattern: conditional. Intervals with gaps should remain separate.
  it('keeps intervals with gaps separate', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -20, max: 20 }),
        fc.integer({ min: 1, max: 10 }),
        (start, gap) => {
          const xs: Interval[] = [
            [start, start + 1],
            [start + 1 + gap, start + 2 + gap],
          ];

          expect(mergeIntervals(xs)).toEqual(xs);
        },
      ),
    );
  });
    // Pattern: algebraic. Merging twice gives the same result as merging once.
  it('merging twice produces the same result', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const once = mergeIntervals(xs);
        const twice = mergeIntervals(once);

        expect(twice).toEqual(once);
      }),
    );
  });
    // Pattern: invariant. Modifying the output must not modify the input.
  it('output intervals do not share references with input', () => {
    fc.assert(
      fc.property(interval, x => {
        const xs: Interval[] = [[...x] as Interval];
        const original = [...xs[0]];

        const out = mergeIntervals(xs);
        out[0][0] = out[0][0] + 1;

        expect(xs[0]).toEqual(original);
      }),
    );
  });
    // Pattern: metamorphic. Reordering intervals does not change the result.
  it('reordering input produces the same result', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const reversed = [...xs].reverse();

        expect(mergeIntervals(reversed)).toEqual(mergeIntervals(xs));
      }),
    );
  });
    // Pattern: differential. Input and output cover the same points.
  it('preserves coverage of points', () => {
    fc.assert(
      fc.property(
        intervalList,
        fc.integer({ min: -40, max: 40 }),
        fc.constantFrom(0, 0.5),
        (xs, n, offset) => {
          const point = n + offset;
          const covered = (intervals: Interval[]) =>
            intervals.some(([a, b]) => a <= point && point <= b);

          expect(covered(mergeIntervals(xs))).toBe(covered(xs));
        },
      ),
    );
  });
});
