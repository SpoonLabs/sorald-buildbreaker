import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

import {exec} from '@actions/exec';

import * as git from '../src/git';

async function createTempdir(): Promise<string> {
  return fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'sorald-buildbreaker-test-')
  );
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
  const expectedFilePath = path.join(tmpdir, 'file.txt');
  await fs.promises.open(expectedFilePath, 'w');
  const repo = await git.init(tmpdir);

  // act
  await repo.add(filename);

  // assert
  let out = '';
  const options = {
    listeners: {
      stdout: (data: Buffer) => {
        out += data.toString();
      }
    },
    cwd: tmpdir
  };
  await exec('git', ['status'], options);
  expect(out).toContain('Changes to be committed:');
  expect(out).toContain(filename);
});
