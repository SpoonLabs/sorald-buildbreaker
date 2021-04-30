/**
 * A closed range on the form [start, end].
 */
export interface ClosedRange {
  start: number;
  end: number;
}

/**
 * Determine whether or not the sought range overlaps with any of the ranges in
 * compare.
 *
 * @param soughtRange - The range to find an overlap for
 * @param compare - Ranges to search for overlap with the sought range
 * @returns true if there is any range in compare that overlaps with the sought
 * range
 */
export function overlapsAny(
  soughtRange: ClosedRange,
  compare: ClosedRange[]
): boolean {
  return compare.find(range => rangesOverlap(soughtRange, range)) !== undefined;
}

/**
 * Determine whether or not two ranges overlap.
 *
 * @param lhs - A range
 * @param rhs - A range
 * @returns true if the ranges overlap
 */
function rangesOverlap(lhs: ClosedRange, rhs: ClosedRange): boolean {
  return (
    (lhs.start <= rhs.start && lhs.end >= rhs.start) ||
    (rhs.start <= lhs.start && rhs.end >= lhs.start)
  );
}
