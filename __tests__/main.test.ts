import * as path from 'path';

import * as main from '../src/main';
import * as git from '../src/git';

import * as helpers from '../src/test-helpers';

function wrapInClassInMainMethod(
  className: string,
  statements: string
): string {
  return `public class ${className} {
  public static void main(String[] args) {
    ${statements}
  }
}
`;
}

/*
import * as process from 'process'
import * as cp from 'child_process'
import * as path from 'path'

// shows how the runner will run a javascript action with env / stdout protocol
test('test runs', () => {
  process.env['INPUT_MILLISECONDS'] = '500'
  const np = process.execPath
  const ip = path.join(__dirname, '..', 'lib', 'main.js')
  const options: cp.ExecFileSyncOptions = {
    env: process.env
  }
  console.log(cp.execFileSync(np, [ip], options).toString())
})
*/

jest.setTimeout(20 * 1000);
test('runSorald correctly repairs existing violations', async () => {
  // Test that buildbreaker can ratchet from HEAD~. The only reason we use
  // HEAD~ is that it's very easy to setup the test.

  // arrange
  const workdir = await helpers.createTempdir();
  const repo = await git.init(workdir);

  // create a commit with a two violations of rule 2164 (math on float) and one
  // of 1854 (dead store)
  const className = 'Main';
  const filePath = path.join(workdir, `${className}.java`);
  const statements = `float a = 2;
  float b = 2; // 1854: dead store
  b = 3;
  float c = a / b; // 2164: math on float
  float d = a / b; // 2164: math on float
  System.out.println(c);
  System.out.println(d);`;
  const initialClassContent = wrapInClassInMainMethod(className, statements);
  helpers.createFile(filePath, initialClassContent);
  await repo.add(filePath);
  await repo.commit('Initial commit');

  // act
  const soraldJarUrl =
    'https://github.com/SpoonLabs/sorald/releases/download/sorald-0.1.0/sorald-0.1.0-jar-with-dependencies.jar';
  const repairs = main.runSorald(workdir, soraldJarUrl);

  await expect(repairs).resolves.toHaveLength(3);
});
