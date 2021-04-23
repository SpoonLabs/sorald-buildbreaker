import {exec} from '@actions/exec';
import {PathLike} from 'fs';

/**
 * Run actions/exec.exec and return the output from stdout.
 *
 * @param cmd - Command to execute
 * @param args - Arguments for the command
 * @param cwd - Working directory to execute the command in
 * @returns Promise with the output from stdout
 */
export async function execWithStdoutCap(
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
