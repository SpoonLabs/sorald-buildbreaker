import * as fs from 'fs';
import * as path from 'path';

import * as git from '../src/git';
import * as helpers from '../src/test-helpers';
import {execWithStdoutCap} from '../src/process-utils';

const TEST_DIFF = `
diff --git a/__tests__/git.test.ts b/__tests__/git.test.ts
index d11d1bf..addc186 100644
--- a/__tests__/git.test.ts
+++ b/__tests__/git.test.ts
@@ -164,0 +165,29 @@ test('diff returns contextless diff', async () => {
+  [ ... DIFF TRUNCATED ... ]
+  await expect(diff).resolves.toContain(
diff --git a/dist/index.js b/dist/index.js
index ce99dd9..24279c3 100644
Binary files a/dist/index.js and b/dist/index.js differ
diff --git a/dist/index.js.map b/dist/index.js.map
index 05c7322..bb93572 100644
Binary files a/dist/index.js.map and b/dist/index.js.map differ
diff --git a/src/git.ts b/src/git.ts
index ec952c3..4db9502 100644
--- a/src/git.ts
+++ b/src/git.ts
@@ -47,0 +48 @@ export class Repo {
+   * @param additionalArgs - Additional arguments
@@ -50,2 +51,2 @@ export class Repo {
-  async diff(): Promise<string> {
-    return this.gitExec(['diff', '-U0']);
+  async diff(...additionalArgs: string[]): Promise<string> {
+    return this.gitExec(['diff', '-U0'].concat(additionalArgs));`;

test('getWorktreeRoot returns correct directory when target is subdir', async () => {
  // arrange
  const tmpdir = await helpers.createTempdir();
  await git.init(tmpdir);
  const subdir = path.join(tmpdir, 'someSubDir');
  await fs.promises.mkdir(subdir);

  // act
  const repo = new git.Repo(subdir);
  const worktreeRoot = await repo.getWorktreeRoot();

  // assert
  expect(worktreeRoot).toBe(tmpdir);
});

test('getWorktreeRoot returns correct directory when target is root', async () => {
  // arrange
  const tmpdir = await helpers.createTempdir();
  await git.init(tmpdir);

  // act
  const repo = new git.Repo(tmpdir);
  const worktreeRoot = repo.getWorktreeRoot();

  // assert
  expect(worktreeRoot).resolves.toBe(tmpdir);
});

test('init initializes directory with Git repo', async () => {
  const tmpdir = await helpers.createTempdir();
  await git.init(tmpdir);

  await expect(
    fs.promises.access(path.join(tmpdir, '.git'))
  ).resolves.toBeUndefined();
});

test('add empty file', async () => {
  // arrange
  const tmpdir = await helpers.createTempdir();
  const filename = 'file.txt';
  await helpers.createFile(path.join(tmpdir, filename), '');
  const repo = await git.init(tmpdir);

  // act
  await repo.add(filename);

  // assert
  const stdout = await execWithStdoutCap('git', ['status'], tmpdir);
  expect(stdout).toContain('Changes to be committed:');
  expect(stdout).toContain(filename);
});

test('commit empty file', async () => {
  // arrange
  const tmpdir = await helpers.createTempdir();
  const filename = 'file.txt';
  await helpers.createFile(path.join(tmpdir, filename), '');
  const repo = await git.init(tmpdir);
  await repo.add(filename);

  // act
  const commitMessage = `Add ${filename}`;
  await repo.commit(commitMessage);

  // assert
  const stdout = await execWithStdoutCap(
    'git',
    ['show', 'HEAD', '--stat'],
    tmpdir
  );
  expect(stdout).toContain(commitMessage);
  expect(stdout).toContain(filename);
});

test('restore rolls back change', async () => {
  // arrange
  const tmpdir = await helpers.createTempdir();
  const filename = 'file.txt';
  const filepath = path.join(tmpdir, filename);
  await helpers.createFile(filepath, '');

  const repo = await git.init(tmpdir);
  await repo.add(filename);
  await repo.commit('Initial commit');
  await (await fs.promises.open(filepath, 'w')).write('some data');

  await expect(
    execWithStdoutCap('git', ['status', '--porcelain'], tmpdir)
  ).resolves.toContain(`M ${filename}`);

  // act
  await repo.restore();

  // assert
  await expect(
    execWithStdoutCap('git', ['status', '--porcelain'], tmpdir)
  ).resolves.toBe('');
});

test('diff returns contextless diff', async () => {
  // arrange
  const tmpdir = await helpers.createTempdir();
  const filename = 'file.txt';
  const filepath = path.join(tmpdir, filename);
  const initialContent = `Hello, there!
`; // note that this trailing newline is important for git to consider the edit as a pure addition
  await helpers.createFile(filepath, initialContent);

  const repo = await git.init(tmpdir);
  await repo.add(filename);
  await repo.commit('Initial commit');

  const addedContent = 'what is up?';
  const changedContent = `${initialContent}${addedContent}`;
  await helpers.createFile(filepath, changedContent);

  // act
  const diff = repo.diff();

  // assert

  /**
   * The full diff should look something like this:
   *
   * diff --git a/file.txt b/file.txt
   * index 68e27d8..1dde809 100644
   * --- a/file.txt
   * +++ b/file.txt
   * @@ -1 +1,2 @@
   *  Hello, there!
   * +what is up?
   * \\ No newline at end of file
   *
   * But this includes the context of the initial content ("Hello, there!")
   * inside the actual hunk, which causes the hunk header to include lines we
   * don't care about. A contextless diff should only include the changed
   * lines in the hunk (although a context line is added to the header).
   */

  await expect(diff).resolves.toContain(`
--- a/file.txt
+++ b/file.txt
@@ -1,0 +2 @@ ${initialContent}+${addedContent}`);
});

test(`diff can handle HEAD~ as commitish argument`, async () => {
  // arrange
  const tmpdir = await helpers.createTempdir();
  const filename = 'file.txt';
  const filepath = path.join(tmpdir, filename);
  const initialContent = `Hello, there!
`; // note that this trailing newline is important for git to consider the edit as a pure addition
  await helpers.createFile(filepath, initialContent);

  const repo = await git.init(tmpdir);
  await repo.add(filename);
  await repo.commit('Initial commit');

  const addedContent = 'what is up?';
  const changedContent = `${initialContent}${addedContent}`;
  await helpers.createFile(filepath, changedContent);
  await repo.add(filename);
  await repo.commit('Change some stuff');

  // act
  const diff = repo.diff('HEAD~');

  // assert
  await expect(diff).resolves.toContain(`
--- a/file.txt
+++ b/file.txt
@@ -1,0 +2 @@ ${initialContent}+${addedContent}`);
});

test(`parseChangedLines correctly parses line ranges from two files`, async () => {
  // arrange
  const worktreeRoot = '/some/bogus/worktree';
  const expectedRanges = new Map([
    [
      path.join(worktreeRoot, '__tests__/git.test.ts'),
      [{start: 165, end: 165 + 29}]
    ],
    [
      path.join(worktreeRoot, 'src/git.ts'),
      [
        {start: 48, end: 48},
        {start: 51, end: 51 + 2}
      ]
    ]
  ]);

  // act
  const actualRanges = git.parseChangedLines(TEST_DIFF, worktreeRoot);

  // assert
  expect(actualRanges).toEqual(expectedRanges);
});

test(`parseDiffHunks correctly parses diff hunks from two files`, async () => {
  // arrange
  const expectedHunks = [
    {
      leftRange: undefined,
      leftFile: '__tests__/git.test.ts',
      rightRange: {start: 165, end: 165 + 29},
      rightFile: '__tests__/git.test.ts',
      additions: [
        '  [ ... DIFF TRUNCATED ... ]',
        '  await expect(diff).resolves.toContain('
      ],
      deletions: []
    },
    {
      leftRange: undefined,
      leftFile: 'src/git.ts',
      rightRange: {start: 48, end: 48},
      rightFile: 'src/git.ts',
      additions: ['   * @param additionalArgs - Additional arguments'],
      deletions: []
    },
    {
      leftRange: {start: 50, end: 52},
      leftFile: 'src/git.ts',
      rightRange: {start: 51, end: 53},
      rightFile: 'src/git.ts',
      additions: [
        '  async diff(...additionalArgs: string[]): Promise<string> {',
        "    return this.gitExec(['diff', '-U0'].concat(additionalArgs));"
      ],
      deletions: [
        '  async diff(): Promise<string> {',
        "    return this.gitExec(['diff', '-U0']);"
      ]
    }
  ];

  // act
  const actualHunks = git.parseDiffHunks(TEST_DIFF);

  // assert
  expect(actualHunks).toEqual(expectedHunks);
});
