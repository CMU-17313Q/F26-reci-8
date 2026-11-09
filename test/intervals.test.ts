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
// start plus a non-negative length, so start <= end by construction.
// Small range so endpoints collide and intervals touch/overlap often.
const interval: fc.Arbitrary<Interval> = fc
  .tuple(fc.integer({ min: -20, max: 20 }), fc.nat(10))
  .map(([start, len]) => [start, start + len] as Interval);

const intervalList = fc.array(interval, { maxLength: 8 });

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
    // Pattern: algebraic. Merging an already-merged result changes nothing.
  it('merging twice equals merging once', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const once = mergeIntervals(xs);
        expect(mergeIntervals(once)).toEqual(once);
      }),
    );
  });

  // Pattern: metamorphic. Reordering the input does not change the output.
  it('input order does not matter', () => {
    const shuffledPair = intervalList.chain(xs =>
      fc.tuple(
        fc.constant(xs),
        fc.shuffledSubarray(xs, { minLength: xs.length, maxLength: xs.length }),
      ),
    );
    fc.assert(
      fc.property(shuffledPair, ([xs, shuffled]) => {
        expect(mergeIntervals(shuffled)).toEqual(mergeIntervals(xs));
      }),
    );
  });

  // Pattern: invariant. Output is sorted, each interval is valid, and
  // neighbours are separated.
  it('output is sorted, valid, and disjoint', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        for (const [s, e] of out) expect(s).toBeLessThanOrEqual(e);
        for (let i = 1; i < out.length; i++) {
          // TODO: if touching intervals merge, this should be strict (>).
          expect(out[i][0]).toBeGreaterThan(out[i - 1][1]);
        }
      }),
    );
  });
    // Pattern: differential. A point is covered by the input iff it is covered
  // by the output. Half-integer points catch wrongly merged integer neighbours.
  it('output covers exactly the same points as the input', () => {
    const covered = (p: number, ivs: readonly Interval[]) =>
      ivs.some(([s, e]) => s <= p && p <= e);
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        for (let p = -25; p <= 35; p += 0.5) {
          expect(covered(p, out)).toBe(covered(p, xs));
        }
      }),
    );
  });

  // Pattern: conditional. If no intervals overlap or touch, the output equals the input.
  it('already-disjoint input comes back unchanged', () => {
    // Each next interval starts at least 1 after the previous end (gap 1 = integer neighbours).
    const disjointSorted: fc.Arbitrary<Interval[]> = fc
      .tuple(
        fc.integer({ min: -20, max: 20 }),
        fc.array(fc.tuple(fc.nat(5), fc.integer({ min: 1, max: 3 })), { maxLength: 6 }),
      )
      .map(([start, parts]) => {
        let cursor = start;
        const out: Interval[] = [];
        for (const [len, gap] of parts) {
          out.push([cursor, cursor + len] as Interval);
          cursor = cursor + len + gap;
        }
        return out;
      });
    fc.assert(
      fc.property(disjointSorted, xs => {
        expect(mergeIntervals(xs)).toEqual(xs);
      }),
    );
  });

  // Pattern: metamorphic. Calling merge must not modify its input, and the
  // output must not share interval objects with the input.
  it('does not mutate or alias its input', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const snapshot = structuredClone(xs);
        const out = mergeIntervals(xs);
        expect(xs).toEqual(snapshot);
        for (const iv of out) {
          (iv as number[])[0] = 999; // scribble on the output
        }
        expect(xs).toEqual(snapshot); // input must be unaffected
      }),
    );
  });
});
