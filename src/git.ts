import {exec} from '@actions/exec';
import {PathLike} from 'fs';

export class Repo {
  private targetDirectory: PathLike;

  constructor(targetDirectory: PathLike) {
    this.targetDirectory = targetDirectory;
  }

  async restore(): Promise<void> {
    this.gitExec(['restore', '.']);
  }

  async add(fileOrDirectory: PathLike): Promise<void> {
    await this.gitExec(['add', fileOrDirectory.toString()]);
  }

  async commit(message: string): Promise<void> {
    await this.gitExec(['commit', '-m', message]);
  }

  private async gitExec(args: string[]): Promise<void> {
    try {
      await exec('git', args, {
        cwd: this.targetDirectory.toString()
      });
    } catch (e) {
      // perform error handling
      throw e;
    }
  }
}

export async function init(repoRoot: PathLike): Promise<Repo> {
  try {
    await exec('git', ['init'], {cwd: repoRoot.toString()});
  } catch (e) {
    throw new Error(e.stderr.toString());
  }
  return new Repo(repoRoot);
}
