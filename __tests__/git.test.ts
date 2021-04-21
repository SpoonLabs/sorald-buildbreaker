import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import {PathLike} from 'fs';
import * as git from '../src/git';

async function createTempdir(): Promise<string> {
  return fs.promises.mkdtemp(path.join(os.tmpdir(), 'sorald-buildbreaker-test-'))
}

test('init initializes directory with Git repo', async () => {
  const tmpdir = await createTempdir();

  await git.init(tmpdir);
  
  await expect(fs.promises.access(path.join(tmpdir, ".git")))
    .resolves.toBeUndefined();
});
