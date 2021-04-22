import {exec} from '@actions/exec';
import {PathLike} from 'fs';

/**
 * Run actions/exec.exec and return the output from stdout.
 *
 * @param cmd command to execute.
 * @param args arguments for the command.
 * @param cwd working directory to execute the command in.
 * @returns promise with the output from stdout.
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
