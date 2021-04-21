import {exec} from '@actions/exec';
import {PathLike} from 'fs';

export class Repo {
  private targetDirectory: PathLike

  constructor(targetDirectory: PathLike) {
    this.targetDirectory = targetDirectory;
  }

  async restore(): Promise<void> {
    try {
      await exec('git', ['restore', '.'], {cwd: this.targetDirectory.toString()});
    } catch (e) {
      throw new Error(e.stderr.toString());
    }
  }
}

export async function init(repoRoot: PathLike): Promise<Repo> {
  try {
    await exec('git', ['init'], {cwd: repoRoot.toString()});
  } catch (e) {
    throw new Error(e.stderr.toString());
  }
  return new Repo(repoRoot)
}

