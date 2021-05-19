import {Range, overlapsAny} from '../src/ranges';

function range(start: number, end: number): Range {
  return {start: start, end: end};
}

test('overlapsAny true when identical range is in compare', () => {
  const soughtRange = range(0, 3);
  const ranges = [
    range(10, 30),
    soughtRange,
    range(4, 10),
    range(33, 43)
  ];

  expect(overlapsAny(soughtRange, ranges)).toBe(true);
});

test('overlapsAny true when sought range ends on compare range start + 1', () => {
  const soughtRange = range(10, 15);
  const barelyOverlaps = range(soughtRange.end - 1, soughtRange.end + 5);
  const ranges = [
    range(100, 101),
    range(93, 204),
    barelyOverlaps,
    range(-100, -90)
  ];

  expect(overlapsAny(soughtRange, ranges)).toBe(true);
});

test('overlapsAny true when sought range starts on compare range end - 1', () => {
  const soughtRange = range(10, 15);
  const barelyOverlaps = range(soughtRange.start - 5, soughtRange.start + 1);
  const ranges = [
    range(100, 101),
    range(93, 204),
    barelyOverlaps,
    range(-100, -90)
  ];

  expect(overlapsAny(soughtRange, ranges)).toBe(true);
});

test('overlapsAny false when sought range ends on compare range start', () => {
  const soughtRange = range(10, 15);
  const justOutside = range(soughtRange.end, soughtRange.end + 5);
  const ranges = [
    range(100, 101),
    range(93, 204),
    justOutside,
    range(-100, -90)
  ];

  expect(overlapsAny(soughtRange, ranges)).toBe(false);
});

test('overlapsAny false when sought range starts on compare range end', () => {
  const soughtRange = range(10, 15);
  const justOutside = range(soughtRange.start - 5, soughtRange.start);
  const ranges = [
    range(100, 101),
    range(93, 204),
    justOutside,
    range(-100, -90)
  ];

  expect(overlapsAny(soughtRange, ranges)).toBe(false);
});
