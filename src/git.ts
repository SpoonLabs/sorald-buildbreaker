import {exec} from '@actions/exec';
import {PathLike} from 'fs';

import {execWithStdoutCap} from './process-utils';

/**
 * Wrapper class for acting on a Git repository with the Git binary.
 */
export class Repo {
  private targetDirectory: PathLike;

  /**
   * @param targetDirectory - Any directory within the worktree of the Git
   *    repository to work with
   */
  constructor(targetDirectory: PathLike) {
    this.targetDirectory = targetDirectory;
  }

  /**
   * Restore all modified files in the current.
   */
  async restore(): Promise<void> {
    this.gitExec(['restore', '.']);
  }

  /**
   * Add a file.
   *
   * @param fileOrDirectory - The file to add
   */
  async add(fileOrDirectory: PathLike): Promise<void> {
    await this.gitExec(['add', fileOrDirectory.toString()]);
  }

  /**
   * Commit the staging area.
   *
   * @param message - The commit message
   */
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

/**
 * Initialize a directory as a Git repository.
 *
 * @param repoRoot - A directory to form the root of the repository's worktree
 * @returns Promise with the initialized repository
 */
export async function init(repoRoot: PathLike): Promise<Repo> {
  try {
    await exec('git', ['init'], {cwd: repoRoot.toString()});
  } catch (e) {
    throw new Error(e.stderr.toString());
  }
  return new Repo(repoRoot);
}
