import {ClosedRange, overlapsAny} from '../src/ranges';

function closedRange(start: number, end: number): ClosedRange {
  return {start: start, end: end};
}

test('overlapsAny true when identical range is in compare', () => {
  const soughtRange = closedRange(0, 3);
  const ranges = [
    closedRange(10, 30),
    soughtRange,
    closedRange(4, 10),
    closedRange(33, 43)
  ];

  expect(overlapsAny(soughtRange, ranges)).toBe(true);
});

test('overlapsAny true when sought range ends on compare range start', () => {
  const soughtRange = closedRange(10, 15);
  const barelyOverlaps = closedRange(soughtRange.end, soughtRange.end + 5);
  const ranges = [
    closedRange(100, 101),
    closedRange(93, 204),
    barelyOverlaps,
    closedRange(-100, -90)
  ];

  expect(overlapsAny(soughtRange, ranges)).toBe(true);
});

test('overlapsAny true when sought range starts on compare range end', () => {
  const soughtRange = closedRange(10, 15);
  const barelyOverlaps = closedRange(soughtRange.start - 5, soughtRange.start);
  const ranges = [
    closedRange(100, 101),
    closedRange(93, 204),
    barelyOverlaps,
    closedRange(-100, -90)
  ];

  expect(overlapsAny(soughtRange, ranges)).toBe(true);
});

test('overlapsAny false when sought range ends on compare range start - 1', () => {
  const soughtRange = closedRange(10, 15);
  const justOutside = closedRange(soughtRange.end + 1, soughtRange.end + 5);
  const ranges = [
    closedRange(100, 101),
    closedRange(93, 204),
    justOutside,
    closedRange(-100, -90)
  ];

  expect(overlapsAny(soughtRange, ranges)).toBe(false);
});

test('overlapsAny false when sought range starts on compare range end + 1', () => {
  const soughtRange = closedRange(10, 15);
  const justOutside = closedRange(soughtRange.start - 5, soughtRange.start - 1);
  const ranges = [
    closedRange(100, 101),
    closedRange(93, 204),
    justOutside,
    closedRange(-100, -90)
  ];

  expect(overlapsAny(soughtRange, ranges)).toBe(false);
});
