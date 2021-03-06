import * as path from 'path';

import * as action from '../src/action';
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
  const repairs = action.runSorald(workdir, 'HEAD~');

  await expect(repairs).resolves.toEqual([
    '1854:Main.java:10:4:10:7',
    '2164:Main.java:8:6:8:11'
  ]);
});

test('runSorald can ratchet from HEAD~ with relative source path', async () => {
  // Test that buildbreaker can ratchet from HEAD~ with a relative path to the
  // source. The only reason we use HEAD~ is that it's very easy to setup the
  // test.

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
  const relativeSourcePath = path.relative('.', workdir.toString());
  const repairs = action.runSorald(relativeSourcePath, 'HEAD~');

  await expect(repairs).resolves.toEqual([
    '1854:Main.java:10:4:10:7',
    '2164:Main.java:8:6:8:11'
  ]);
});
test('runSorald with ratchet does nothing when there are no violations in changed code', async () => {
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

  // create a new commit with no violations
  const secondCommitMethodBody = `${baseMethodBody}
  b = c;
  System.out.println(b);`;
  const secondCommitClassContent = wrapInClassInMainMethod(
    className,
    secondCommitMethodBody
  );
  await helpers.createFile(filePath, secondCommitClassContent);
  await repo.add(filePath);
  await repo.commit('Update file');

  const repairs = action.runSorald(workdir, 'HEAD~');

  await expect(repairs).resolves.toHaveLength(0);
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
  const repairs = action.runSorald(workdir);

  await expect(repairs).resolves.toHaveLength(3);
});
