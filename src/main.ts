import * as fs from 'fs';
import * as path from 'path';
import * as core from '@actions/core';
import {PathLike} from 'fs';
import got from 'got';
import {promisify} from 'util';
import * as stream from 'stream';
import * as github from '@actions/github';
import * as Webhooks from '@octokit/webhooks';

import * as sorald from './sorald';
import * as ranges from './ranges';

import * as git from './git';
import {Hunk} from './git';
import {Range} from './ranges';

const JAR_DST_PATH = 'sorald.jar';

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
  const sourceAbsPath = path.resolve(source.toString());
  const repo = new git.Repo(sourceAbsPath);

  core.info(`Downloading Sorald jar to ${JAR_DST_PATH}`);
  await download(soraldJarUrl, JAR_DST_PATH);

  core.info(`Mining rule violations at ${sourceAbsPath}`);
  const unfilteredKeyToSpecs: Map<number, string[]> = await sorald.mine(
    JAR_DST_PATH,
    sourceAbsPath,
    'stats.json'
  );
  const keyToSpecs = await filterKeyToSpecsByRatchet(
    unfilteredKeyToSpecs,
    sourceAbsPath,
    repo,
    ratchetFrom
  );

  let allRepairs: string[] = [];
  if (keyToSpecs.size > 0) {
    core.info('Found rule violations');
    core.info('Attempting repairs');
    for (const [ruleKey, violationSpecs] of keyToSpecs.entries()) {
      core.info(`Repairing violations of rule ${ruleKey}: ${violationSpecs}`);
      const statsFile = path.join(sourceAbsPath, `${ruleKey}.json`);
      const repairs = await sorald.repair(
        JAR_DST_PATH,
        sourceAbsPath,
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
 * Filter the violation specs such that only those present in changed code are
 * retained, and return a new map where only keys with at least one violation
 * spec is present after filtering.
 *
 * If ratchetFrom is undefined, just return a copy of the keyToSpecs map.
 */
async function filterKeyToSpecsByRatchet(
  keyToSpecs: Map<number, string[]>,
  source: PathLike,
  repo: git.Repo,
  ratchetFrom: string | undefined
): Promise<Map<number, string[]>> {
  if (ratchetFrom === undefined) {
    return new Map(keyToSpecs);
  }

  const filteredKeyToSpecs: Map<number, string[]> = new Map();

  const diff = await repo.diff(ratchetFrom);
  const worktreeRoot = await repo.getWorktreeRoot();
  const changedLines = git.parseChangedLines(diff, worktreeRoot);

  for (const [ruleKey, unfilteredSpecs] of keyToSpecs.entries()) {
    const filteredSpecs =
      changedLines === undefined
        ? unfilteredSpecs
        : filterViolationSpecsByRatchet(unfilteredSpecs, changedLines, source);

    if (filteredSpecs.length > 0) {
      filteredKeyToSpecs.set(ruleKey, filteredSpecs);
    }
  }

  return filteredKeyToSpecs;
}

/**
 * Filter out any violation specifiers that aren't present in the changed lines
 * of code.
 */
function filterViolationSpecsByRatchet(
  violationSpecs: string[],
  changedLines: Map<PathLike, Range[]> | undefined,
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

async function generatePatchSuggestions(
  soraldJar: PathLike,
  source: PathLike,
  violationSpecs: string[]
): Promise<PatchSuggestion[]> {
  const repo = new git.Repo(source);
  const commitSha = await repo.getHeadCommitSha();
  const throwawayStatsFile = '__sorald_throwaway_stats_file.json';

  let allSuggestions: PatchSuggestion[] = [];
  for (const spec of violationSpecs) {
    await sorald.repair(soraldJar, source, throwawayStatsFile, [spec]);
    const diff = await repo.diff();
    const hunks = git.parseDiffHunks(diff);
    const suggestions = hunks.map(hunk =>
      generatePatchSuggestion(hunk, spec, commitSha)
    );
    allSuggestions = allSuggestions.concat(suggestions);
  }
  return allSuggestions;
}

interface PatchSuggestion {
  linesToReplace: Range;
  file: PathLike;
  suggestion: string;
  violationSpec: string;
  commitSha: string;
}

function generatePatchSuggestion(
  hunk: Hunk,
  spec: string,
  sha: string
): PatchSuggestion {
  return {
    linesToReplace: hunk.leftRange,
    file: hunk.leftFile,
    suggestion: `To fix violation '${spec}', Sorald suggests the following:
\`\`\`suggestion
$(hunk.additions.join('\n'))
\`\`\``,
    violationSpec: spec,
    commitSha: sha
  };
}

async function postPatchSuggestion(ps: PatchSuggestion): Promise<void> {
  const octokit = github.getOctokit(core.getInput('token'));
  core.info(github.context.sha);
  await octokit.rest.pulls.createReviewComment({
    ...github.context.repo,
    commit_id: ps.commitSha,
    pull_number: github.context.payload.number,
    body: ps.suggestion,
    path: ps.file.toString(),
    start_line: ps.linesToReplace.start,
    line: ps.linesToReplace.end,
    start_side: 'RIGHT'
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

    const patchSuggestions = await generatePatchSuggestions(
      JAR_DST_PATH,
      source,
      repairedViolations
    );
    for (const ps of patchSuggestions) {
      await postPatchSuggestion(ps);
    }

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
