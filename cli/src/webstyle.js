#!/usr/bin/env node
// The webstyle command (F41). Exit codes: 0 success, 1 usage or missing browser, 2 page failed to
// load, 3 too little to read, 4 internal error.

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { HELP, UsageError, parseCommand } from './args.js';
import { CliError, EXIT, runExtract, writeOutput } from './extract.js';
import { exportSnapshots, importSnapshots } from '../../src/io/index.js';
import { diffDesigns } from '../../src/diff/index.js';
import { exportDiffMd } from '../../src/diff/diff-md.js';
import { mapTokens } from '../../src/mapping/index.js';
import { exportMappingMd } from '../../src/mapping/mapping-md.js';
import pkg from '../package.json' with { type: 'json' };

const out = (text) => process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
const err = (text) => process.stderr.write(`${text}\n`);

async function readSnapshot(path) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    throw new CliError(EXIT.USAGE, `Couldn't read ${path}: ${error.message}`);
  }
  try {
    const { snapshots } = importSnapshots(text);
    if (!snapshots.length) throw new Error('no snapshots');
    return snapshots[0];
  } catch (error) {
    throw new CliError(EXIT.USAGE, `${path} isn't a valid WebStyle snapshot: ${error.message}`);
  }
}

async function writeOrPrint(path, text) {
  if (!path) return out(text);
  await mkdir(dirname(resolve(path)), { recursive: true });
  await writeFile(path, text);
  err(`Wrote ${path}`);
}

export async function main(argv) {
  const parsed = parseCommand(argv);
  if (parsed.command === 'help') return out(HELP);
  if (parsed.command === 'version') return out(pkg.version);

  if (parsed.command === 'extract') {
    const { urls, options } = parsed;
    const results = await runExtract(urls, options, {
      version: pkg.version,
      log: options.json ? () => {} : err,
      warn: err,
    });
    if (options.json) return out(exportSnapshots(results.map((r) => r.record)));
    for (const result of results) {
      const host = result.record.hostname || 'local';
      // With several separate snapshots each gets its own folder inside --out.
      const dir = options.out
        ? results.length > 1
          ? join(options.out, host)
          : options.out
        : join('webstyle-output', host);
      await writeOutput(dir, result);
      err(`Wrote ${result.files.length + 1} files to ${dir}`);
    }
    return;
  }
  if (parsed.command === 'diff') {
    const [a, b] = await Promise.all([readSnapshot(parsed.a), readSnapshot(parsed.b)]);
    const [first, second] = a.capturedAt <= b.capturedAt ? [a, b] : [b, a];
    return writeOrPrint(parsed.out, exportDiffMd(diffDesigns(first.edited, second.edited)));
  }
  if (parsed.command === 'map') {
    const snapshot = await readSnapshot(parsed.snapshot);
    let text;
    try {
      text = await readFile(parsed.tokens, 'utf8');
    } catch (error) {
      throw new CliError(EXIT.USAGE, `Couldn't read ${parsed.tokens}: ${error.message}`);
    }
    let mapping;
    try {
      mapping = mapTokens(snapshot.edited, text, parsed.tokens.split(/[\\/]/).pop());
    } catch (error) {
      throw new CliError(EXIT.USAGE, error.message);
    }
    return writeOrPrint(parsed.out, exportMappingMd(snapshot.edited, mapping));
  }
}

const invokedDirectly = process.argv[1] && /webstyle(\.js)?$/.test(process.argv[1]);
if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    () => process.exit(EXIT.OK),
    (error) => {
      if (error instanceof UsageError) {
        err(`webstyle: ${error.message}\nRun webstyle --help for usage.`);
        process.exit(EXIT.USAGE);
      }
      if (error instanceof CliError) {
        err(`webstyle: ${error.message}`);
        process.exit(error.exit);
      }
      err(`webstyle: internal error: ${error?.stack ?? error}`);
      process.exit(EXIT.INTERNAL);
    },
  );
}
