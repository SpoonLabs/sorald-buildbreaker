import * as path from 'path';
import * as fs from 'fs';
import {PathLike} from 'fs';

import * as core from '@actions/core';
import * as github from '@actions/github';
import * as artifact from '@actions/artifact';

import * as sorald from './sorald';
import * as ranges from './ranges';

import * as git from './git';
import {Range} from './ranges';

import * as suggestions from './suggestions';

export const SORALD_JAR = path.join(
  __dirname,
  '../sorald-0.3.0-jar-with-dependencies.jar'
);

const COMMENTS_JSON_FILENAME = 'review-comments.json';

/**
 * Run sorald and attempt to enact repairs.
 *
 * @param source - Path to the source directory
 * @param ratchetFrom - Commit-ish to ratchet from
 * @returns Fulfills to violation specifiers for repaired violations
 */
export async function runSorald(
  source: PathLike,
  ratchetFrom?: string
): Promise<string[]> {
  const sourceAbsPath = path.resolve(source.toString());
  const repo = new git.Repo(sourceAbsPath);

  core.info(`Mining rule violations at ${sourceAbsPath}`);
  const unfilteredKeyToSpecs: Map<number, string[]> = await sorald.mine(
    SORALD_JAR,
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
        SORALD_JAR,
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

/**
 * Run the sorald-buildbreaker action.
 */
export async function run(): Promise<void> {
  try {
    const source: PathLike = core.getInput('source');
    const ratchetFrom: string = core.getInput('ratchet-from');
    const repairedViolations: string[] = await runSorald(
      source,
      ratchetFrom ? ratchetFrom : undefined
    );

    if (shouldPostReviewComments()) {
      await postReviewComments(source, repairedViolations);
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

function shouldPostReviewComments(): boolean {
  return (
    github.context.eventName === 'pull_request' &&
    Boolean(core.getInput('post-review-comments'))
  );
}

async function postReviewComments(
  source: PathLike,
  repairedViolations: string[]
): Promise<void> {
  const patchSuggestions = await suggestions.generatePatchSuggestions(
    SORALD_JAR,
    source,
    repairedViolations
  );
  const commentsJSON = await suggestions.toCommentsJSON(patchSuggestions);
  await uploadAsArtifact(commentsJSON, COMMENTS_JSON_FILENAME);
}

async function uploadAsArtifact(
  content: string,
  filename: string
): Promise<void> {
  // TODO create file in temporary directory
  await fs.promises.writeFile(filename, content);

  const artifactClient = artifact.create();
  const artifactName = filename;
  const rootDirectory = '.';
  const files = [filename];
  const options = {continueOnError: false};

  await artifactClient.uploadArtifact(
    artifactName,
    files,
    rootDirectory,
    options
  );
}
