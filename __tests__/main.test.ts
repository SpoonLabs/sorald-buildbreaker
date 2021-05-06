import * as path from 'path';

import * as main from '../src/main';
import * as git from '../src/git';

import * as helpers from '../src/test-helpers';

function wrapInClassInMainMethod(
  className: string,
  statements: string
): string {
  return `public class ${className} {
  public static void main(String[] args) {
    ${statements}
  }
}
`;
}

jest.setTimeout(20 * 1000);

test('runSorald can ratchet from HEAD~', async () => {
  // Test that buildbreaker can ratchet from HEAD~. The only reason we use
  // HEAD~ is that it's very easy to setup the test.

  // arrange
  const workdir = await helpers.createTempdir();
  const repo = await git.init(workdir);

  // create a commit with a single violation each of rules 2164 (math on float) and 1854 (dead store)
  const className = 'Main';
  const filePath = path.join(workdir, `${className}.java`);
  const baseMethodBody = `float a = 2;
  float b = 2; // 1854: dead store
  b = 3;
  float c = a / b; // 2164: math on float
  System.out.println(c);`;
  const initialClassContent = wrapInClassInMainMethod(
    className,
    baseMethodBody
  );
  helpers.createFile(filePath, initialClassContent);
  await repo.add(filePath);
  await repo.commit('Initial commit');

  // create a new commit with one more violation of each rule
  const secondCommitMethodBody = `${baseMethodBody}
  c = b / a; // 2164: math on float
  System.out.println(c);
  b = c; // 1854: dead store`;
  const secondCommitClassContent = wrapInClassInMainMethod(
    className,
    secondCommitMethodBody
  );
  await helpers.createFile(filePath, secondCommitClassContent);
  await repo.add(filePath);
  await repo.commit('Update file');

  // act
  const soraldJarUrl =
    'https://github.com/SpoonLabs/sorald/releases/download/sorald-0.1.0/sorald-0.1.0-jar-with-dependencies.jar';
  const repairs = main.runSorald(workdir, soraldJarUrl, 'HEAD~');

  await expect(repairs).resolves.toEqual([
    '1854:Main.java:10:4:10:7',
    '2164:Main.java:8:6:8:11'
  ]);
});

test('runSorald correctly repairs existing violations', async () => {
  // Test that buildbreaker can ratchet from HEAD~. The only reason we use
  // HEAD~ is that it's very easy to setup the test.

  // arrange
  const workdir = await helpers.createTempdir();
  const repo = await git.init(workdir);

  // create a commit with a two violations of rule 2164 (math on float) and one
  // of 1854 (dead store)
  const className = 'Main';
  const filePath = path.join(workdir, `${className}.java`);
  const statements = `float a = 2;
  float b = 2; // 1854: dead store
  b = 3;
  float c = a / b; // 2164: math on float
  float d = a / b; // 2164: math on float
  System.out.println(c);
  System.out.println(d);`;
  const initialClassContent = wrapInClassInMainMethod(className, statements);
  helpers.createFile(filePath, initialClassContent);
  await repo.add(filePath);
  await repo.commit('Initial commit');

  // act
  const soraldJarUrl =
    'https://github.com/SpoonLabs/sorald/releases/download/sorald-0.1.0/sorald-0.1.0-jar-with-dependencies.jar';
  const repairs = main.runSorald(workdir, soraldJarUrl);

  await expect(repairs).resolves.toHaveLength(3);
});
