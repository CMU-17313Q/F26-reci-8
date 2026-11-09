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
const interval: fc.Arbitrary<Interval> = fc.tuple(fc.integer(), fc.integer()).map(([a, b]) => {
  // Construct valid intervals: ensure start <= end
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  return [start, end] as Interval;
});
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

  // Pattern: invariant. Output intervals are sorted and disjoint.
  it('output is sorted and disjoint (no overlap or touch)', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const result = mergeIntervals(xs);
        for (let i = 0; i < result.length - 1; i++) {
          // Must be sorted
          expect(result[i][0]).toBeLessThanOrEqual(result[i + 1][0]);
          // Must not touch or overlap: result[i][1] < result[i+1][0]
          expect(result[i][1]).toBeLessThan(result[i + 1][0]);
        }
      }),
    );
  });

  // Pattern: differential. Point coverage must be preserved.
  it('coverage is preserved: point in input iff point in output', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const result = mergeIntervals(xs);
        
        // Collect candidate test points
        const points = new Set<number>();
        for (const [start, end] of xs.concat(result)) {
          points.add(start);
          points.add(end);
          // Add points inside intervals
          if (start < end) {
            points.add(start + 0.5);
            points.add(Math.floor((start + end) / 2));
          }
        }
        
        // Check each point
        for (const p of points) {
          const inInput = xs.some(([s, e]) => s <= p && p <= e);
          const inOutput = result.some(([s, e]) => s <= p && p <= e);
          expect(inOutput).toBe(inInput);
        }
      }),
    );
  });

  // Pattern: algebraic. Touching intervals must merge.
  it('touching intervals [a,b] and [b,c] merge into [a,c]', () => {
    // Specifically generate pairs of touching intervals
    const touchingPair: fc.Arbitrary<Interval[]> = fc
      .tuple(fc.integer(), fc.integer())
      .map(([a, b]) => {
        const s1 = Math.min(a, b);
        const s2 = Math.max(a, b) + 1; // Ensure s2 > s1
        const t = s1 + (s2 - s1) / 2; // Touch point between them
        const i1 = [s1, Math.floor(t)] as Interval;
        const i2 = [Math.floor(t), s2] as Interval;
        return [i1, i2];
      });

    fc.assert(
      fc.property(touchingPair, xs => {
        const result = mergeIntervals(xs);
        // Two touching intervals should merge to one
        expect(result.length).toBe(1);
        // The merged interval should cover both
        expect(result[0][0]).toBeLessThanOrEqual(xs[0][0]);
        expect(result[0][1]).toBeGreaterThanOrEqual(xs[1][1]);
      }),
    );
  });

  // Pattern: conditional. Empty input gives empty output.
  it('empty input gives empty output', () => {
    expect(mergeIntervals([])).toEqual([]);
  });

  // Pattern: algebraic. Integer neighbors must NOT merge.
  it('[a, b] and [b+1, c] are NOT merged (gap exists)', () => {
    // Generate intervals exactly 1 apart: [a, b] and [b+1, c]
    const integerNeighbors: fc.Arbitrary<Interval[]> = fc
      .tuple(fc.integer({ min: -100, max: 100 }), fc.integer({ min: 1, max: 20 }), fc.integer({ min: 1, max: 20 }))
      .map(([base, len1, len2]) => {
        const i1: Interval = [base, base + len1];
        const i2: Interval = [base + len1 + 1, base + len1 + 1 + len2]; // Exactly 1 apart
        return [i1, i2];
      });

    fc.assert(
      fc.property(integerNeighbors, ([i1, i2]) => {
        const result = mergeIntervals([i1, i2]);
        // Must NOT merge: should stay as 2 separate intervals with a gap
        expect(result.length).toBe(2);
        expect(result).toEqual([i1, i2]);
      }),
    );
  });

  // Pattern: metamorphic. Merging is idempotent.
  it('merging merged intervals gives same result (idempotent)', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const once = mergeIntervals(xs);
        const twice = mergeIntervals(once);
        expect(twice).toEqual(once);
      }),
    );
  });

  // Pattern: conditional. Non-overlapping sorted inputs stay separate.
  it('non-overlapping disjoint inputs remain unchanged', () => {
    // Generator for strictly disjoint intervals (with gaps between them)
    const disjointIntervals: fc.Arbitrary<Interval[]> = fc
      .array(
        fc.tuple(
          fc.integer(),
          fc.integer({ min: 0, max: 100 }) // gap size
        ),
        { maxLength: 5 }
      )
      .map(pairs => {
        let pos = 0;
        return pairs.map(([offset, gap]) => {
          const start = pos + Math.abs(offset) % 10;
          const end = start + Math.abs(gap) % 5 + 1;
          pos = end + 2; // Ensure gap of at least 2
          return [start, end] as Interval;
        });
      });

    fc.assert(
      fc.property(disjointIntervals, xs => {
        // Verify inputs are actually disjoint
        for (let i = 0; i < xs.length - 1; i++) {
          expect(xs[i][1]).toBeLessThan(xs[i + 1][0]);
        }
        
        // Disjoint sorted input should pass through unchanged
        expect(mergeIntervals(xs)).toEqual(xs);
      }),
    );
  });

  // Pattern: algebraic. Already-merged intervals pass through.
  it('already-merged intervals are unchanged', () => {
    // Build valid merged intervals (sorted, disjoint)
    const validMerged: fc.Arbitrary<Interval[]> = fc
      .array(
        fc.tuple(fc.integer(), fc.integer({ min: 0, max: 50 })),
        { maxLength: 4 }
      )
      .map(pairs => {
        let intervals: Interval[] = pairs.map(([offset, len]) => [
          offset * 100,
          offset * 100 + Math.abs(len) + 1,
        ]);
        // Sort and ensure disjoint
        intervals.sort((a, b) => a[0] - b[0]);
        let result: Interval[] = [];
        for (const [s, e] of intervals) {
          if (result.length === 0 || s > result[result.length - 1][1]) {
            result.push([s, e]);
          }
        }
        return result;
      });

    fc.assert(
      fc.property(validMerged, xs => {
        expect(mergeIntervals(xs)).toEqual(xs);
      }),
    );
  });

  // Pattern: metamorphic. Input is not modified.
  it('input array is not modified', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const original = xs.map(([s, e]) => [s, e] as Interval);
        mergeIntervals(xs);
        expect(xs).toEqual(original);
      }),
    );
  });
});
