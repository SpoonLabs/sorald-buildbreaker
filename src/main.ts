import * as fs from 'fs';
import * as path from 'path';
import * as core from '@actions/core';
import {PathLike} from 'fs';
import got from 'got';
import {promisify} from 'util';
import * as stream from 'stream';

import * as sorald from './sorald';
import * as ranges from './ranges';

import * as git from './git';
import {ClosedRange} from './ranges';

const pipeline = promisify(stream.pipeline);

async function download(url: string, dst: PathLike): Promise<void> {
  return pipeline(got.stream(url), fs.createWriteStream(dst));
}

/**
 * Run sorald and attempt to enact repairs.
 *
 * @param source - Path to the source directory
 * @param soraldJarUrl - URL to download the Sorald JAR from
 * @param ratchetFrom - Commit-ish to ratchet from
 * @returns Fulfills to violation specifiers for repaired violations
 */
export async function runSorald(
  source: PathLike,
  soraldJarUrl: string,
  ratchetFrom?: string
): Promise<string[]> {
  const jarDstPath = 'sorald.jar';
  const repo = new git.Repo(source);

  core.info(`Downloading Sorald jar to ${jarDstPath}`);
  await download(soraldJarUrl, jarDstPath);

  core.info(`Mining rule violations at ${source}`);
  const keyToSpecs: Map<number, string[]> = await sorald.mine(
    jarDstPath,
    source,
    'stats.json'
  );

  const changedLines =
    ratchetFrom === undefined
      ? undefined
      : await (async () => {
          const diff = await repo.diff(ratchetFrom);
          const worktreeRoot = await repo.getWorktreeRoot();
          return git.parseChangedLines(diff, worktreeRoot);
        })();

  let allRepairs: string[] = [];
  if (keyToSpecs.size > 0) {
    core.info('Found rule violations');
    core.info('Attempting repairs');
    for (const [ruleKey, unfilteredSpecs] of keyToSpecs.entries()) {
      const violationSpecs =
        changedLines === undefined
          ? unfilteredSpecs
          : filterViolationSpecsByRatchet(
              unfilteredSpecs,
              changedLines,
              source
            );

      core.info(`Repairing violations of rule ${ruleKey}: ${violationSpecs}`);
      const statsFile = path.join(source.toString(), `${ruleKey}.json`);
      const repairs = await sorald.repair(
        jarDstPath,
        source,
        statsFile,
        violationSpecs
      );
      await repo.restore();
      allRepairs = allRepairs.concat(repairs);
    }
  } else {
    core.info('No violations found');
  }
  return allRepairs;
}

/**
 * Filter out any violation specifiers that aren't present in the changed lines
 * of code.
 */
function filterViolationSpecsByRatchet(
  violationSpecs: string[],
  changedLines: Map<PathLike, ClosedRange[]> | undefined,
  source: PathLike
): string[] {
  if (changedLines === undefined) {
    return violationSpecs;
  }

  return violationSpecs.filter(spec => {
    const filePath = path.join(source.toString(), sorald.parseFilePath(spec));
    const lineRange = sorald.parseAffectedLines(spec);
    const changedLinesInFile = changedLines.get(filePath);
    return (
      changedLinesInFile !== undefined &&
      ranges.overlapsAny(lineRange, changedLinesInFile)
    );
  });
}

async function run(): Promise<void> {
  try {
    const source: PathLike = core.getInput('source');
    const soraldJarUrl: string = core.getInput('sorald-jar-url');
    const ratchetFrom: string = core.getInput('ratchet-from');
    const repairedViolations: string[] = await runSorald(
      source,
      soraldJarUrl,
      ratchetFrom ? ratchetFrom : undefined
    );

    if (repairedViolations.length > 0) {
      core.setFailed(
        `Found repairable violations ${repairedViolations.join(' ')}`
      );
    } else {
      core.info('No repairable violations found');
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
