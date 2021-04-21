import * as fs from 'fs';
import * as core from '@actions/core';
import {PathLike} from 'fs';
import got from 'got';
import {promisify} from 'util';
import * as stream from 'stream';

import * as sorald from './sorald';

import * as git from './git';

const pipeline = promisify(stream.pipeline);

async function download(url: string, dst: PathLike): Promise<void> {
  return pipeline(got.stream(url), fs.createWriteStream(dst));
}

async function runSorald(
  source: PathLike,
  soraldJarUrl: string
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

  if (keyToSpecs.size > 0) {
    core.info('Found rule violations');

    core.info('Attempting repairs');
    const performedRepairs = Array.from(keyToSpecs.entries()).flatMap(
      async function (subArray) {
        const [ruleKey, violationSpecs] = subArray;
        core.info(`Repairing violations of rule ${ruleKey}: ${violationSpecs}`);
        const statsFile = `${ruleKey}.json`;
        const repairs = await sorald.repair(
          jarDstPath,
          source,
          statsFile,
          violationSpecs
        );
        repo.restore();
        return repairs;
      }
    );
    return (await Promise.all(performedRepairs)).flatMap(e => e);
  } else {
    core.info('No violations found');
    return [];
  }
}

async function run(): Promise<void> {
  try {
    const source: PathLike = core.getInput('source');
    const soraldJarUrl: string = core.getInput('sorald-jar-url');
    const repairedViolations: string[] = await runSorald(source, soraldJarUrl);

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
