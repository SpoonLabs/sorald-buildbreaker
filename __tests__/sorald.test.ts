import * as sorald from '../src/sorald';

test('parseAffectedLines returns correct range', () => {
  const startLine = 19;
  const endLine = startLine + 3;
  const violationSpec = `2057:spoon/support/comparator/CtLineElementComparator.java:${startLine}:13:${endLine}:36`;

  const range = sorald.parseAffectedLines(violationSpec);

  // note that Range is right-exclusive
  const expectedRange = {start: startLine, end: endLine + 1};

  expect(range).toEqual(expectedRange);
});
