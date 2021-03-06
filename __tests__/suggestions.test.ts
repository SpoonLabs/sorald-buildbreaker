import * as fs from 'fs';
import * as path from 'path';

import * as suggestions from '../src/suggestions';
import {PatchSuggestion} from '../src/suggestions';
import * as git from '../src/git';
import {Repo} from '../src/git';
import * as helpers from '../src/test-helpers';
import {SORALD_JAR} from '../src/action';

import got, {CancelableRequest} from 'got';

jest.mock('got');

const gotMock = got as jest.MockedFunction<typeof got>;

const VIOLATION_1118_SUGGESTION: PatchSuggestion = {
  linesToReplace: {start: 1, end: 1},
  file: 'Violation1118.java',
  violationSpec: '1118:Violation1118.java:1:13:1:26',
  suggestion: `\`\`\`suggestion
public class Violation1118 {
    private Violation1118() {
    }
\`\`\``
};

const VIOLATION_1854_SUGGESTION: PatchSuggestion = {
  linesToReplace: {start: 5, end: 6},
  file: 'Violation1854.java',
  violationSpec: '1854:Violation1854.java:5:10:5:13',
  suggestion: `\`\`\`suggestion

\`\`\``
};

const VIOLATION_2184_SUGGESTION: PatchSuggestion = {
  linesToReplace: {start: 3, end: 4},
  file: 'Violation2184.java',
  violationSpec: '2184:Violation2184.java:3:29:3:30',
  suggestion: `\`\`\`suggestion
        double twoThirds = 2D / 3;
\`\`\``
};

jest.setTimeout(20 * 1000);

/**
 * Test for generating patch suggestions from repairing rule 1854, which
 * results in a repair that only deletes a line.
 */
test('generatePatchSuggestions generates correct suggestion for pure deletion repair', async () => {
  await testGeneratePatchSuggestions(VIOLATION_1854_SUGGESTION);
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
  await testGeneratePatchSuggestions(VIOLATION_1118_SUGGESTION);
});

/**
 * Test for generating patch suggestions from repairing a violation of rule
 * 2184, which results in both an addition and an insertion.
 */
test('generatePatchSuggestions generates correct suggestion for addition+deletion repair', async () => {
  await testGeneratePatchSuggestions(VIOLATION_2184_SUGGESTION);
});

/**
 * Test for generating patch suggestsions for violations of multiple rules in multiple files.
 */
test('generatePatchSuggestions generates correct suggestions for multiple repairs', async () => {
  await testGeneratePatchSuggestions(
    VIOLATION_1118_SUGGESTION,
    VIOLATION_1854_SUGGESTION,
    VIOLATION_2184_SUGGESTION
  );
});

/**
 * Test that the correct links and violation specifier are included in the PR comment message.
 */
test('generateSuggestionMessage includes correct metadata for rule 2097', async () => {
  const returnValue = {
    json: async () => {
      return {
        title: '"equals(Object obj)" should test argument type',
        type: 'BUG',
        status: 'ready',
        remediation: {func: 'Constant/Issue', constantCost: '5min'},
        tags: [],
        defaultSeverity: 'Minor',
        ruleSpecification: 'RSPEC-2097',
        sqKey: 'S2097',
        scope: 'All'
      };
    }
  } as unknown as CancelableRequest; // this is a hack to not have to specify all properties of CancelableRequest
  const violationSpec = '2097:dontcare:1:1:1:1';
  gotMock.mockReturnValue(returnValue);

  const ps: PatchSuggestion = {
    linesToReplace: {start: 1, end: 2},
    file: 'dontcare',
    suggestion: 'dontcare',
    violationSpec: violationSpec
  };

  const generatedMessage = await suggestions.generateSuggestionMessage(ps);

  expect(generatedMessage).toContain(
    '[2097: "equals(Object obj)" should test argument type](https://rules.sonarsource.com/java/RSPEC-2097)'
  );
  expect(generatedMessage).toContain(
    `[Sorald's documentation for details on the repair](https://github.com/SpoonLabs/sorald/blob/master/docs/HANDLED_RULES.md)`
  );
  expect(generatedMessage).toContain(violationSpec);
});

/**
 * Run a single test case for the given patch suggestions, where the file
 * indicated by each suggestion is committed to a repository and repaired with
 * Sorald. The patch suggestions that are generated from the repaired
 * repository are then expected to match the input patch suggestions.
 */
async function testGeneratePatchSuggestions(
  ...expectedSuggestions: PatchSuggestion[]
): Promise<void> {
  // arrange
  const repo = await setupRepoWith(
    ...expectedSuggestions.map(ps => ps.file.toString())
  );

  // act
  const patchSuggestions = await suggestions.generatePatchSuggestions(
    SORALD_JAR,
    await repo.getWorktreeRoot(),
    expectedSuggestions.map(ps => ps.violationSpec)
  );

  // assert
  expect(patchSuggestions).toEqual(expectedSuggestions);
}

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
