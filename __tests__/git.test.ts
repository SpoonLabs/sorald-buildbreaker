import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

import {exec} from '@actions/exec';

import * as git from '../src/git';
import {FileHandle} from 'fs/promises';

async function createTempdir(): Promise<string> {
  return fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'sorald-buildbreaker-test-')
  );
}

async function createFile(
  path: fs.PathLike,
  content: string
): Promise<FileHandle> {
  const file = await fs.promises.open(path, 'w');
  await file.write(content);
  return file;
}

async function execWithStdoutCap(
  cmd: string,
  args: string[],
  cwd: string
): Promise<string> {
  let out = '';
  const options = {
    listeners: {
      stdout: (data: Buffer) => {
        out += data.toString();
      }
    },
    cwd: cwd
  };
  await exec(cmd, args, options);
  return out;
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
  createFile(path.join(tmpdir, filename), '');
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
  const tmpdir = await createTempdir();
  const filename = 'file.txt';
  createFile(path.join(tmpdir, filename), '');
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
