import {exec} from '@actions/exec';
import {PathLike} from 'fs';

import {execWithStdoutCapture} from './process-utils';

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

  async diff(): Promise<string> {
    return this.gitExec(['diff', '-U0']);
  }

  /**
   * Execute the given command with Git and return the stdout output.
   */
  private async gitExec(args: string[]): Promise<string> {
    try {
      return execWithStdoutCapture('git', args, this.targetDirectory);
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
