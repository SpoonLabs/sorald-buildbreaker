import * as fs from 'fs';
import {PathLike} from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as stream from 'stream';
import * as util from 'util';

import got from 'got';

const pipeline = util.promisify(stream.pipeline);

export const RESOURCES_DIR = path.join(__dirname, '../__tests__/data');

export const SORALD_JAR_URL =
  'https://github.com/SpoonLabs/sorald/releases/download/sorald-0.1.0/sorald-0.1.0-jar-with-dependencies.jar';

export const SORALD_TEST_JAR_PATH = path.join(__dirname, '../sorald.jar');

export async function createTempdir(): Promise<string> {
  return fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'sorald-buildbreaker-test-')
  );
}

export async function createFile(
  filepath: fs.PathLike,
  content: string
): Promise<void> {
  const file = await fs.promises.open(filepath, 'w');
  await file.write(content);
  await file.close();
}

/**
 * Get a the path to test resource.
 *
 * @param resourceName - Name of the test resource file
 * @returns Absolute path to the test resource
 */
export function getResourcePath(resourceName: PathLike): PathLike {
  return path.join(RESOURCES_DIR, resourceName.toString());
}

/**
 * Downloads the given resource if it's not already present.
 *
 * @param url - A url to fetch a resource from
 * @param destinaion - Destination to download resource to
 */
export async function downloadIfNotPresent(
  url: string,
  destination: PathLike
): Promise<void> {
  try {
    await fs.promises.access(destination);
  } catch {
    await pipeline(got.stream(url), fs.createWriteStream(destination));
  }
}
