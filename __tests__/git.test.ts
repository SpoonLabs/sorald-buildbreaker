import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

import * as git from '../src/git';
import {execWithStdoutCapture} from '../src/process-utils';

async function createTempdir(): Promise<string> {
  return fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'sorald-buildbreaker-test-')
  );
}

async function writeToFile(path: fs.PathLike, content: string): Promise<void> {
  const file = await fs.promises.open(path, 'w');
  await file.write(content);
  await file.close();
}

test('init initializes directory with Git repo', async () => {
  const tmpdir = await createTempdir();
  await git.init(tmpdir);

  await expect(
    fs.promises.access(path.join(tmpdir, '.git'))
  ).resolves.toBeUndefined();
});

test('add empty file', async () => {
  // arrange
  const tmpdir = await createTempdir();
  const filename = 'file.txt';
  await writeToFile(path.join(tmpdir, filename), '');
  const repo = await git.init(tmpdir);

  // act
  await repo.add(filename);

  // assert
  const stdout = await execWithStdoutCapture('git', ['status'], tmpdir);
  expect(stdout).toContain('Changes to be committed:');
  expect(stdout).toContain(filename);
});

test('commit empty file', async () => {
  // arrange
  const tmpdir = await createTempdir();
  const filename = 'file.txt';
  await writeToFile(path.join(tmpdir, filename), '');
  const repo = await git.init(tmpdir);
  await repo.add(filename);

  // act
  const commitMessage = `Add ${filename}`;
  await repo.commit(commitMessage);

  // assert
  const stdout = await execWithStdoutCapture(
    'git',
    ['show', 'HEAD', '--stat'],
    tmpdir
  );
  expect(stdout).toContain(commitMessage);
  expect(stdout).toContain(filename);
});

test('restore rolls back change', async () => {
  // arrange
  const tmpdir = await createTempdir();
  const filename = 'file.txt';
  const filepath = path.join(tmpdir, filename);
  await writeToFile(filepath, '');

  const repo = await git.init(tmpdir);
  await repo.add(filename);
  await repo.commit('Initial commit');

  const file = await fs.promises.open(filepath, 'w');
  await file.write('some data');
  await file.close();

  await expect(
    execWithStdoutCapture('git', ['status', '--porcelain'], tmpdir)
  ).resolves.toContain(`M ${filename}`);

  // act
  await repo.restore();

  // assert
  await expect(
    execWithStdoutCapture('git', ['status', '--porcelain'], tmpdir)
  ).resolves.toBe('');
});

test('diff returns contextless diff', async () => {
  // arrange
  const tmpdir = await createTempdir();
  const filename = 'file.txt';
  const filepath = path.join(tmpdir, filename);
  const initialContent = `Hello, there!
`; // note that this trailing newline is important for git to consider the edit as a pure addition
  await writeToFile(filepath, initialContent);

  const repo = await git.init(tmpdir);
  await repo.add(filename);
  await repo.commit('Initial commit');

  const addedContent = 'what is up?';
  const changedContent = `${initialContent}${addedContent}`;
  await writeToFile(filepath, changedContent);

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
