import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { mergeIntervals, type Interval } from '../src/intervals';

// Read the spec in src/intervals/mergeIntervals.ts, then check your progress
// with `npm run mutants:intervals`.
//
// Label every property with its pattern, on the line above its `it(`:
//   // Pattern: invariant. The output is sorted.
// (invariant, algebraic, metamorphic, differential, or conditional)

// Valid by construction: start <= end. A small range makes shared endpoints
// and overlaps common; a wide range catches bugs that only show on big numbers.
const smallInterval: fc.Arbitrary<Interval> = fc
  .tuple(fc.integer({ min: -10, max: 10 }), fc.nat(5))
  .map(([s, len]) => [s, s + len]);
const wideInterval: fc.Arbitrary<Interval> = fc
  .tuple(fc.integer({ min: -1000, max: 1000 }), fc.nat(1000))
  .map(([s, len]) => [s, s + len]);
const interval: fc.Arbitrary<Interval> = fc.oneof(smallInterval, wideInterval);
const intervalList = fc.oneof(
  fc.array(smallInterval, { maxLength: 8 }),
  fc.array(interval, { maxLength: 8 }),
);

// Already disjoint intervals: each one starts at least 2 after the previous
// one ends, so they never touch. Shuffled so the input is not sorted.
const disjointSorted: fc.Arbitrary<Interval[]> = fc
  .tuple(fc.integer({ min: -20, max: 20 }), fc.array(fc.tuple(fc.nat(3), fc.nat(3)), { maxLength: 6 }))
  .map(([first, parts]) => {
    const out: Interval[] = [];
    let pos = first;
    for (const [gap, len] of parts) {
      const s = pos + gap;
      out.push([s, s + len]);
      pos = s + len + 2;
    }
    return out;
  });
const disjointShuffled = disjointSorted.chain(xs =>
  fc.tuple(fc.constant(xs), fc.shuffledSubarray(xs, { minLength: xs.length, maxLength: xs.length })),
);

// Is the point p (any real) inside one of the intervals?
const covered = (xs: readonly Interval[], p: number) => xs.some(([s, e]) => s <= p && p <= e);

// Points worth checking: every endpoint, a bit on each side of it, and the
// midpoint between consecutive endpoints (catches gaps like 2 < x < 3).
function probePoints(xs: readonly Interval[]): number[] {
  const ends = [...new Set(xs.flat())].sort((a, b) => a - b);
  const pts: number[] = [];
  ends.forEach((x, i) => {
    pts.push(x - 0.5, x, x + 0.5);
    if (i + 1 < ends.length) pts.push((x + ends[i + 1]) / 2);
  });
  return pts;
}

const copy = (xs: readonly Interval[]): Interval[] => xs.map(([s, e]) => [s, e]);

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

  // Pattern: invariant. The output is sorted, every interval has start <= end, and consecutive intervals neither overlap nor touch.
  it('returns sorted intervals with a gap between neighbours', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        for (const [s, e] of out) expect(s).toBeLessThanOrEqual(e);
        for (let i = 0; i + 1 < out.length; i++) expect(out[i][1]).toBeLessThan(out[i + 1][0]);
      }),
    );
  });

  // Pattern: invariant. The input array and its intervals are not modified.
  it('does not modify the input', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const before = copy(xs);
        const out = mergeIntervals(xs);
        for (const iv of out) iv[1] += 100;
        expect(xs).toEqual(before);
      }),
    );
  });

  // Pattern: differential. A point is covered by the output exactly when it is covered by the input.
  it('covers exactly the same points as the input', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        for (const p of probePoints([...xs, ...out])) expect(covered(out, p)).toBe(covered(xs, p));
      }),
    );
  });

  // Pattern: metamorphic. Shuffling the input or duplicating some of its intervals does not change the output.
  it('ignores order and duplicates', () => {
    fc.assert(
      fc.property(
        intervalList.chain(xs =>
          fc.tuple(
            fc.constant(xs),
            fc.shuffledSubarray(xs, { minLength: xs.length, maxLength: xs.length }),
            fc.subarray(xs),
          ),
        ),
        ([xs, shuffled, extra]) => {
          const out = mergeIntervals(xs);
          expect(mergeIntervals(shuffled)).toEqual(out);
          expect(mergeIntervals([...shuffled, ...copy(extra)])).toEqual(out);
        },
      ),
    );
  });

  // Pattern: metamorphic. Shifting every input interval by k shifts every output interval by k.
  it('commutes with shifting', () => {
    fc.assert(
      fc.property(intervalList, fc.integer({ min: -50, max: 50 }), (xs, k) => {
        const shifted = xs.map(([s, e]): Interval => [s + k, e + k]);
        const expected = mergeIntervals(xs).map(([s, e]) => [s + k, e + k]);
        expect(mergeIntervals(shifted)).toEqual(expected);
      }),
    );
  });

  // Pattern: algebraic. Merging an already merged list gives the same list back.
  it('is idempotent', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const once = mergeIntervals(xs);
        expect(mergeIntervals(once)).toEqual(once);
      }),
    );
  });

  // Pattern: conditional. If no two input intervals overlap or touch, the output is the input sorted by start.
  it('returns already disjoint input sorted and unchanged', () => {
    fc.assert(
      fc.property(disjointShuffled, ([sorted, shuffled]) => {
        expect(mergeIntervals(shuffled)).toEqual(sorted);
      }),
    );
  });

  // Pattern: conditional. If some interval has start > end or a non-integer endpoint, it throws a RangeError.
  it('rejects invalid intervals', () => {
    const bad: fc.Arbitrary<Interval> = fc.oneof(
      fc.tuple(fc.integer({ min: -20, max: 20 }), fc.integer({ min: 1, max: 5 })).map(([s, d]): Interval => [s, s - d]),
      fc.tuple(fc.integer({ min: -20, max: 20 }), fc.nat(5)).map(([s, len]): Interval => [s + 0.5, s + len + 1]),
      fc.tuple(fc.integer({ min: -20, max: 20 }), fc.nat(5)).map(([s, len]): Interval => [s, s + len + 0.5]),
    );
    fc.assert(
      fc.property(intervalList, bad, fc.nat(8), (xs, b, i) => {
        const input = [...xs];
        input.splice(i % (xs.length + 1), 0, b);
        expect(() => mergeIntervals(input)).toThrow(RangeError);
      }),
    );
  });

  it('gives [] for []', () => {
    expect(mergeIntervals([])).toEqual([]);
  });
});
