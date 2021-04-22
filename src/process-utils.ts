import {exec} from '@actions/exec';
import {PathLike} from 'fs';

/**
 * Run actions/exec.exec and return the output from stdout.
 */
export async function execWithStdoutCapture(
  cmd: string,
  args: string[],
  cwd: PathLike
): Promise<string> {
  let out = '';
  const options = {
    listeners: {
      stdout: (data: Buffer) => {
        out += data.toString();
      }
    },
    cwd: cwd.toString()
  };
  await exec(cmd, args, options);
  return out;
}
