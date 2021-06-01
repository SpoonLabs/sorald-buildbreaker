import * as fs from 'fs';
import {PathLike} from 'fs';
import * as path from 'path';
import * as github from '@actions/github';
import got from 'got';

import * as sorald from './sorald';
import {Range} from './ranges';
import * as git from './git';
import {Hunk, Repo} from './git';

/**
 * A patch suggestion meant to be posted to GitHub usuing the pull request
 * review comment API.
 */
export interface PatchSuggestion {
  linesToReplace: Range;
  file: PathLike;
  suggestion: string;
  violationSpec: string;
}

/**
 * Generate patch suggestions by repairing the specified rule violations.
 *
 * @param soraldJar - Path to a Sorald jar file to generate repairs with
 * @param source - Path to a directory somewhere in a Git repository worktree
 * @param violationSpecs - Specifiers for violations to repair
 * @returns Fulfills to an array of patch suggestions
 */
export async function generatePatchSuggestions(
  soraldJar: PathLike,
  source: PathLike,
  violationSpecs: string[]
): Promise<PatchSuggestion[]> {
  const repo = new Repo(source);
  const worktreeRoot = await repo.getWorktreeRoot();
  const throwawayStatsFile = '__sorald_throwaway_stats_file.json';

  const allSuggestions: PatchSuggestion[] = [];
  for (const spec of violationSpecs) {
    await sorald.repair(soraldJar, source, throwawayStatsFile, [spec]);
    const diff = await repo.diff();
    const hunks = git.parseDiffHunks(diff);
    for (const hunk of hunks) {
      const suggestion = await generatePatchSuggestion(
        hunk,
        spec,
        path.join(worktreeRoot.toString(), hunk.leftFile.toString())
      );
      allSuggestions.push(suggestion);
    }
    await repo.restore();
  }
  return allSuggestions;
}

async function generatePatchSuggestion(
  hunk: Hunk,
  spec: string,
  localFile: PathLike
): Promise<PatchSuggestion> {
  const suggestionAdditions = hunk.additions.join('\n');
  const suggestion =
    hunk.leftRange.start === hunk.leftRange.end
      ? `${await readLine(
          localFile,
          hunk.leftRange.start
        )}\n${suggestionAdditions}`
      : suggestionAdditions;
  return {
    linesToReplace: hunk.leftRange,
    file: hunk.leftFile,
    suggestion: `\`\`\`suggestion
${suggestion}
\`\`\``,
    violationSpec: spec
  };
}

async function readLine(filepath: PathLike, line: number): Promise<string> {
  const content = await fs.promises.readFile(filepath, {encoding: 'utf8'});
  return content.toString().split('\n')[line - 1];
}

/**
 * Post a pach suggestion to the current pull request, assuming the GitHub
 * context is in fact a pull request.
 *
 * @param ps - A patch suggestion to post
 * @param token - Token to authenticate with the GitHub API
 */
export async function postPatchSuggestion(
  ps: PatchSuggestion,
  token: string
): Promise<void> {
  const octokit = github.getOctokit(token);
  const pull_request = github.context.payload.pull_request;

  if (pull_request !== undefined) {
    const startLine = ps.linesToReplace.start;
    const endLine = ps.linesToReplace.end - 1;

    const lineArgs =
      endLine <= startLine
        ? {line: startLine}
        : {start_line: startLine, line: endLine};

    await octokit.rest.pulls.createReviewComment({
      ...github.context.repo,
      ...lineArgs,
      commit_id: pull_request.head.sha,
      pull_number: pull_request.number,
      body: await generateSuggestionMessage(ps),
      path: ps.file.toString(),
      start_side: 'RIGHT'
    });
  }
}

/**
 * Generate a full, human-friendly suggestion message based on a patch suggestion.
 *
 * @param ps - A patch suggestion
 * @returns Fulfills to a suggestion message
 */
export async function generateSuggestionMessage(
  ps: PatchSuggestion
): Promise<string> {
  const [ruleKey] = ps.violationSpec.split(':');
  const sonarVersion = '6.9.0.23563';
  const sonarRuleMetadataUrl = `https://raw.githubusercontent.com/SonarSource/sonar-java/${sonarVersion}/java-checks/src/main/resources/org/sonar/l10n/java/rules/java/S${ruleKey}_java.json`;
  const ruleInfoPage = `https://rules.sonarsource.com/java/RSPEC-${ruleKey}`;

  const ruleMetadata = await httpGetJson(sonarRuleMetadataUrl);
  return `This code change violates SonarSource rule [${ruleKey}: ${ruleMetadata.title}](${ruleInfoPage}). Sorald suggests the following fix:

${ps.suggestion}

See [Sorald's documentation for details on the repair](https://github.com/SpoonLabs/sorald/blob/master/docs/HANDLED_RULES.md).

Violation specifier: ${ps.violationSpec}
`;
}

async function httpGetJson(url: string): Promise<RuleMetadata> {
  const response: RuleMetadata = await got(url, {
    responseType: 'json'
  }).json();
  return response;
}

interface RuleMetadata {
  title: string;
  type: string;
  sqKey: string;
}
