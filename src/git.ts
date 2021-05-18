import * as os from 'os';
import * as path from 'path';
import {exec} from '@actions/exec';
import {PathLike} from 'fs';
import {ClosedRange} from './ranges';

import {execWithStdoutCap} from './process-utils';

const HUNK_HEADER_REGEX = '^@@ .*?\\+(\\d+),?(\\d+)? @@';

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
  const fileToRanges: Map<PathLike, ClosedRange[]> = new Map();

  for (const hunk of parseDiffHunks(diff)) {
    const absPath = path.join(
      worktreeRoot.toString(),
      hunk.rightFile.toString()
    );
    let currentRanges = fileToRanges.get(absPath);
    if (currentRanges === undefined) {
      currentRanges = [];
    }
    currentRanges.push(hunk.rightRange);
    fileToRanges.set(absPath, currentRanges);
  }

  return fileToRanges;
}

export interface Hunk {
  rightRange: ClosedRange;
  additions: string[];
  deletions: string[];
  rightFile: PathLike;
}

/**
 * Parse diff hunks from a raw diff.
 */
export function parseDiffHunks(diff: string): Hunk[] {
  const filePathPrefix = '+++ b/';
  const addedPrefix = '+';
  const deletedPrefix = '-';
  const hunkHeaderSep = '@@';

  let currentHunk: Hunk | undefined;
  let currentFile: string | undefined;
  const hunks: Hunk[] = [];
  for (const line of diff.split(os.EOL)) {
    if (line.startsWith(filePathPrefix)) {
      currentFile = line.substr(filePathPrefix.length);
    } else if (line.startsWith(hunkHeaderSep) && currentFile !== undefined) {
      const hunk = {
        rightRange: parseRangeFromHunkHeader(line),
        additions: [],
        deletions: [],
        rightFile: currentFile
      };
      hunks.push(hunk);
      currentHunk = hunk;
    }

    if (currentHunk === undefined) {
      continue;
    } else if (line.startsWith(addedPrefix)) {
      currentHunk.additions.push(line.substr(addedPrefix.length));
    } else if (line.startsWith(deletedPrefix)) {
      currentHunk.deletions.push(line.substr(deletedPrefix.length));
    } else {
      currentHunk = undefined;
    }
  }

  return hunks;
}

function parseRangeFromHunkHeader(hunkHeader: string): ClosedRange {
  const matches = hunkHeader.match(HUNK_HEADER_REGEX);
  if (matches !== null) {
    const startLine = Number(matches[1]);
    const numLines = matches[2];
    const endLine =
      Number(startLine) + (numLines === undefined ? 0 : Number(numLines));
    return {start: startLine, end: endLine};
  } else {
    throw Error(`bad hunk header: ${hunkHeader}`);
  }
}
