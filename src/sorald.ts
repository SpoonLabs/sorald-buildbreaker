import {exec} from '@actions/exec';
import * as fs from 'fs';
import {PathLike} from 'fs';
import * as path from 'path';
import {Range} from './ranges';

interface WarningLocation {
  violationSpecifier: string;
}

interface MinedRuleData {
  ruleKey: number;
  warningLocations: WarningLocation[];
}

interface MinedData {
  minedRules: MinedRuleData[];
}

interface RuleRepairData {
  ruleKey: number;
  performedRepairsLocations: WarningLocation[];
  nbViolationsBefore: number;
  nbViolationsAfter: number;
}

interface RepairData {
  repairs: RuleRepairData[];
}

/**
 * Mine a directory with Sorald.
 *
 * @param soraldJar - Path to the Sorald jarfile
 * @param source - Path to the root directory of the project to analyze
 * @param statsFile - Path to output statistics to
 * @returns Fulfills with a mapping (ruleKey, array of rule violation specifiers) upon success
 */
export async function mine(
  soraldJar: PathLike,
  source: PathLike,
  statsFile: PathLike
): Promise<Map<number, string[]>> {
  try {
    await exec('java', [
      '-jar',
      soraldJar.toString(),
      'mine',
      '--source',
      source.toString(),
      '--stats-output-file',
      statsFile.toString(),
      '--handled-rules'
    ]);
  } catch (e) {
    throw new Error(e.stderr.toString());
  }

  const miningData: MinedData = JSON.parse(
    (await fs.promises.readFile(statsFile)).toString()
  );
  const keyToSpecs: Map<number, string[]> = new Map(
    miningData.minedRules.map(data => [
      data.ruleKey,
      data.warningLocations.map(loc => loc.violationSpecifier)
    ])
  );

  return keyToSpecs;
}

/**
 * Repair violations in a project.
 *
 * @param soraldJar - Path to the Sorald jarfile
 * @param source - Path to the root directory of the project to analyze
 * @param statsFile - Path to output statistics to
 * @returns Fulfills with an array of repaired rule violations upon success
 */
export async function repair(
  soraldJar: PathLike,
  source: PathLike,
  statsFile: PathLike,
  violationSpecs: string[]
): Promise<string[]> {
  try {
    await exec('java', [
      '-jar',
      soraldJar.toString(),
      'repair',
      '--source',
      source.toString(),
      '--stats-output-file',
      statsFile.toString(),
      '--violation-specs',
      violationSpecs.join(',')
    ]);
  } catch (e) {
    throw new Error(e.stderr.toString());
  }

  const repairData: RepairData = JSON.parse(
    (await fs.promises.readFile(statsFile)).toString()
  );
  return parseRepairedViolations(repairData);
}

function parseRepairedViolations(repairData: RepairData): string[] {
  const ruleRepairs = repairData.repairs;

  if (!ruleRepairs) {
    return [];
  } else {
    const ruleRepairData = ruleRepairs[0];
    const numSuccessfulRepairs =
      ruleRepairData.nbViolationsBefore - ruleRepairData.nbViolationsAfter;
    if (numSuccessfulRepairs > 0) {
      return ruleRepairData.performedRepairsLocations.map(
        loc => loc.violationSpecifier
      );
    } else {
      return [];
    }
  }
}

/**
 * Parse the lines of a rule violation.
 *
 * @param violationSpec - A violation specifier
 * @returns The line range that the violation spans
 */
export function parseAffectedLines(violationSpec: string): Range {
  const startLineIdx = 2;
  const endLineIdx = startLineIdx + 2;
  const parts = violationSpec.split(path.delimiter);
  return {
    start: Number(parts[startLineIdx]),
    end: Number(parts[endLineIdx]) + 1
  };
}

/**
 * Parse the relative filepath from the rule violation.
 *
 * @param violationSpec - A violation specifier
 * @returns Relative filepath to file containing the violation
 */
export function parseFilePath(violationSpec: string): string {
  return violationSpec.split(path.delimiter)[1];
}
