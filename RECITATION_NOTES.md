# Recitation 9

The starter failed on `[[0, -1]]`: its generator violated start <= end.
The generator now constructs valid intervals by ordering integer endpoints, without filtering.

All five patterns are labeled immediately above their tests. Coverage is compared at every endpoint and midpoint between consecutive endpoints, including half-integers, so real-number gaps are checked. Additional properties check input preservation and construct touching intervals directly.

Tests and mutation checks were run after each property; see validation.log for the results and counterexamples. The initial repaired starter killed 4/7 mutants. Shape checks detected touching intervals; differential coverage detected incorrectly merged integer neighbors; input preservation detected mutation of the caller's intervals.

Final validation: 8 properties pass, 7/7 mutants killed across all five runs, and TypeScript typecheck passes. Mutant source files were not read.
