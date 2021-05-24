import * as fs from 'fs';
import * as path from 'path';

import * as suggestions from '../src/suggestions';
import * as git from '../src/git';
import {Repo} from '../src/git';
import * as helpers from '../src/test-helpers';

/**
 * Test for generating patch suggestions from repairing rule 1854, which
 * results in a repair that only deletes a line.
 */
test('generatePatchSuggestions generates correct suggestion for pure deletion repair', async () => {
  // arrange
  const resourceName = 'Violation1854.java';
  const violationSpecs = ['1854:Violation1854.java:5:10:5:13'];
  const repo = await setupRepoWith(resourceName);
  await helpers.downloadIfNotPresent(
    helpers.SORALD_JAR_URL,
    helpers.SORALD_TEST_JAR_PATH
  );

  // act
  const patchSuggestions = await suggestions.generatePatchSuggestions(
    helpers.SORALD_TEST_JAR_PATH,
    await repo.getWorktreeRoot(),
    violationSpecs
  );

  // assert
  expect(patchSuggestions.length).toEqual(1);
  const ps = patchSuggestions[0];
  expect(ps.suggestion).toContain(violationSpecs[0]);
  expect(ps.suggestion).toContain(`\`\`\`suggestion

\`\`\``);
  expect(ps.linesToReplace).toEqual({start: 5, end: 6});
});

/**
 * Test for generating patch suggestions from repairing rule 1118, which
 * results in a repair that only contains additions. This is a special case, as
 * GitHub suggestions can only _replace_ at least one existing line, and not
 * purely add lines.
 *
 * The current behavior is to "replace" the line at which the insertion occurs,
 * and include the same line again in the suggestion.
 */
test('generatePatchSuggestions generates correct suggestion for pure addition repair', async () => {
  // arrange
  const resourceName = 'Violation1118.java';
  const violationSpecs = ['1118:Violation1118.java:1:13:1:26'];
  const repo = await setupRepoWith(resourceName);
  await helpers.downloadIfNotPresent(
    helpers.SORALD_JAR_URL,
    helpers.SORALD_TEST_JAR_PATH
  );

  // act
  const patchSuggestions = await suggestions.generatePatchSuggestions(
    helpers.SORALD_TEST_JAR_PATH,
    await repo.getWorktreeRoot(),
    violationSpecs
  );

  // assert
  expect(patchSuggestions.length).toEqual(1);
  const ps = patchSuggestions[0];
  expect(ps.suggestion).toContain(violationSpecs[0]);
  expect(ps.suggestion).toContain(`\`\`\`suggestion
public class Violation1118 {
    private Violation1118() {
    }
\`\`\``);
  expect(ps.linesToReplace).toEqual({start: 1, end: 1});
});

/**
 * Test for generating patch suggestions from repairing a violation of rule
 * 2184, which results in both an addition and an insertion.
 */
test('generatePatchSuggestions generates correct suggestion for addition+deletion repair', async () => {
  // arrange
  const resourceName = 'Violation2184.java';
  const violationSpecs = ['2184:Violation2184.java:3:29:3:30'];
  const repo = await setupRepoWith(resourceName);
  await helpers.downloadIfNotPresent(
    helpers.SORALD_JAR_URL,
    helpers.SORALD_TEST_JAR_PATH
  );

  // act
  const patchSuggestions = await suggestions.generatePatchSuggestions(
    helpers.SORALD_TEST_JAR_PATH,
    await repo.getWorktreeRoot(),
    violationSpecs
  );

  // assert
  expect(patchSuggestions.length).toEqual(1);
  const ps = patchSuggestions[0];
  expect(ps.suggestion).toContain(violationSpecs[0]);
  expect(ps.suggestion).toContain(`\`\`\`suggestion
        double twoThirds = 2D / 3;
\`\`\``);
  expect(ps.linesToReplace).toEqual({start: 3, end: 4});
});

test('generatePatchSuggestions generates correct suggestions for multiple repairs', async () => {
  // arrange
  const violationSpecs = [
    '1118:Violation1118.java:1:13:1:26',
    '1854:Violation1854.java:5:10:5:13',
    '2184:Violation2184.java:3:29:3:30'
  ];
  const repo = await setupRepoWith(
    'Violation1118.java',
    'Violation1854.java',
    'Violation2184.java'
  );
  await helpers.downloadIfNotPresent(
    helpers.SORALD_JAR_URL,
    helpers.SORALD_TEST_JAR_PATH
  );

  // act
  const patchSuggestions = await suggestions.generatePatchSuggestions(
    helpers.SORALD_TEST_JAR_PATH,
    await repo.getWorktreeRoot(),
    violationSpecs
  );

  // assert
  expect(patchSuggestions.length).toEqual(3);
  const [spec1118, spec1854, spec2184] = violationSpecs;
  const [ps1118, ps1854, ps2184] = patchSuggestions;

  expect(ps1118.suggestion).toContain(spec1118);
  expect(ps1854.suggestion).toContain(spec1854);
  expect(ps2184.suggestion).toContain(spec2184);
});

/**
 * Setup a Git repository with the given resources committed.
 */
async function setupRepoWith(...resourceNames: string[]): Promise<Repo> {
  const tmpdir = await helpers.createTempdir();
  const repo = await git.init(tmpdir);

  for (const resourceName of resourceNames) {
    await fs.promises.copyFile(
      helpers.getResourcePath(resourceName),
      path.join(tmpdir, resourceName)
    );
  }
  await repo.add('.');
  await repo.commit('Initial commit');

  return repo;
}
