import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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
