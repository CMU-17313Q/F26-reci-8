import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { mergeIntervals, type Interval } from '../src/intervals';

// Read the spec in src/intervals/mergeIntervals.ts, then check your progress
// with `npm run mutants:intervals`.
//
// Label every property with its pattern, on the line above its `it(`:
//   // Pattern: invariant. The output is sorted.
// (invariant, algebraic, metamorphic, differential, or conditional)

const interval: fc.Arbitrary<Interval> = fc.integer().chain(start =>
  fc.integer({ min: start }).map((end): Interval => [start, end]),
);
const intervalList = fc.array(interval);
const disjointIntervalList: fc.Arbitrary<Interval[]> = fc
  .tuple(
    fc.integer(),
    fc.array(fc.tuple(fc.nat(10), fc.integer({ min: 1, max: 10 })), {
      minLength: 1,
      maxLength: 10,
    }),
  )
  .map(([start, lengthsAndGaps]) => {
    let nextStart = start;
    return lengthsAndGaps.map(([length, gap]): Interval => {
      const current: Interval = [nextStart, nextStart + length];
      nextStart = current[1] + gap;
      return current;
    });
  });
const touchingPair: fc.Arbitrary<[Interval, Interval]> = fc
  .tuple(
    fc.integer(),
    fc.integer({ min: 1, max: 10 }),
    fc.integer({ min: 1, max: 10 }),
  )
  .map(([start, leftLength, rightLength]) => {
    const sharedEndpoint = start + leftLength;
    return [
      [start, sharedEndpoint],
      [sharedEndpoint, sharedEndpoint + rightLength],
    ];
  });
const overlappingPair: fc.Arbitrary<[Interval, Interval]> = fc
  .tuple(
    fc.integer(),
    fc.nat(10),
    fc.integer({ min: 1, max: 10 }),
  )
  .map(([start, leftLength, rightExtension]) => [
    [start, start + leftLength],
    [start, start + leftLength + rightExtension],
  ]);
const intervalListAndPermutation = intervalList.chain(xs =>
  fc
    .shuffledSubarray(xs, { minLength: xs.length, maxLength: xs.length })
    .map(permuted => [xs, permuted] as const),
);

function covers(intervals: readonly Interval[], point: number): boolean {
  return intervals.some(([start, end]) => start <= point && point <= end);
}

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

  // Pattern: invariant. The output is sorted and consecutive intervals neither overlap nor touch.
  it('returns sorted, separated intervals', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        for (let i = 0; i < out.length; i++) {
          expect(Number.isInteger(out[i][0])).toBe(true);
          expect(Number.isInteger(out[i][1])).toBe(true);
          expect(out[i][0]).toBeLessThanOrEqual(out[i][1]);
          if (i > 0) expect(out[i - 1][1]).toBeLessThan(out[i][0]);
        }
      }),
    );
  });

  // Pattern: invariant. Touching intervals merge into one interval at their shared endpoint.
  it('merges intervals that share an endpoint', () => {
    fc.assert(
      fc.property(touchingPair, ([left, right]) => {
        expect(mergeIntervals([left, right])).toEqual([[left[0], right[1]]]);
      }),
    );
  });

  // Pattern: invariant. Merging does not modify the input array or its intervals.
  it('does not modify overlapping input intervals', () => {
    fc.assert(
      fc.property(overlappingPair, pair => {
        const before = pair.map(([start, end]): Interval => [start, end]);
        mergeIntervals(pair);
        expect(pair).toEqual(before);
      }),
    );
  });

  // Pattern: differential. Input and output cover the same points.
  it('preserves point coverage', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        const endpoints = [...xs, ...out].flatMap(([start, end]) => [start, end]);
        const sortedEndpoints = [...new Set(endpoints)].sort((a, b) => a - b);
        const points = sortedEndpoints.flatMap((point, i) =>
          i + 1 < sortedEndpoints.length
            ? [point, (point + sortedEndpoints[i + 1]) / 2]
            : [point],
        );

        for (const point of points) {
          expect(covers(out, point)).toBe(covers(xs, point));
        }
      }),
    );
  });

  // Pattern: metamorphic. Permuting the input does not change the result.
  it('is independent of input order', () => {
    fc.assert(
      fc.property(intervalListAndPermutation, ([xs, permuted]) => {
        expect(mergeIntervals(permuted)).toEqual(mergeIntervals(xs));
      }),
    );
  });

  // Pattern: algebraic. Merging an already-merged result leaves it unchanged.
  it('is idempotent', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const once = mergeIntervals(xs);
        expect(mergeIntervals(once)).toEqual(once);
      }),
    );
  });

  // Pattern: conditional. Already-separated intervals are returned unchanged.
  it('preserves inputs that are already disjoint and non-touching', () => {
    fc.assert(
      fc.property(disjointIntervalList, xs => {
        expect(mergeIntervals(xs)).toEqual(xs);
      }),
    );
  });
});
