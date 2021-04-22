import {exec} from '@actions/exec';
import {PathLike} from 'fs';

import {execWithStdoutCap} from './process-utils';

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

  /**
   * Perform a contextless diff of the entire repo.
   *
   * @returns promise with the output on stdout.
   */
  async diff(): Promise<string> {
    return this.gitExec(['diff', '-U0']);
  }

  /**
   * Execute the given command with Git and return the stdout output.
   */
  private async gitExec(args: string[]): Promise<string> {
    try {
      return execWithStdoutCap('git', args, this.targetDirectory);
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
