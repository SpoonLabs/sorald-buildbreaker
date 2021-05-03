import * as os from 'os';
import * as path from 'path';
import {exec} from '@actions/exec';
import {PathLike} from 'fs';
import {ClosedRange} from './ranges';

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
   * @param additionalArgs - Additional arguments
   * @returns Fulfills with the output from stdout upon success
   */
  async diff(...additionalArgs: string[]): Promise<string> {
    return this.gitExec(['diff', '-U0'].concat(additionalArgs));
  }

  /**
   * Determine the worktree root of this repository.
   *
   * @returns Fulfills with the worktree root
   */
  async getWorktreeRoot(): Promise<PathLike> {
    return (await this.gitExec(['rev-parse', '--show-toplevel'])).trimEnd();
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
 * @returns Fulfills with an initialized repository upon success
 */
export async function init(repoRoot: PathLike): Promise<Repo> {
  try {
    await exec('git', ['init'], {cwd: repoRoot.toString()});
  } catch (e) {
    throw new Error(e.stderr.toString());
  }
  return new Repo(repoRoot);
}

/**
 * Parse the changed lines from a context-less diff (i.e. a diff computed with
 * -U0).
 *
 *  @param diff - A context-less diff
 *  @param worktreeRoot - Absolute path to the root of the repository worktree
 *  in which the diff was computed
 *  @returns A mapping (filepath, array of disjoint line ranges)
 */
export function parseChangedLines(
  diff: string,
  worktreeRoot: PathLike
): Map<PathLike, ClosedRange[]> {
  let currentFile: string | null = null;
  let currentRanges: ClosedRange[] = [];
  const fileToRanges: Map<PathLike, ClosedRange[]> = new Map();
  const filePathPrefix = '+++ b/';
  const chunkHeaderSep = '@@';
  for (const line of diff.split(os.EOL)) {
    if (line.startsWith(filePathPrefix)) {
      // marks start of a new file
      currentFile = path.join(
        worktreeRoot.toString(),
        line.substr(filePathPrefix.length)
      );
      currentRanges = [];
      fileToRanges.set(currentFile, currentRanges);
    } else if (line.startsWith(chunkHeaderSep)) {
      const matches = line.match('^@@ .*?\\+(\\d+),?(\\d+)? @@');
      if (matches !== null) {
        const startLine = Number(matches[1]);
        const numLines = matches[2];
        const endLine =
          Number(startLine) + (numLines === undefined ? 0 : Number(numLines));
        currentRanges.push({start: startLine, end: endLine});
      }
    }
  }
  return fileToRanges;
}
