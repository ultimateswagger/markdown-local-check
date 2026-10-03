#!/usr/bin/env node
import { checkDirectory } from './checker.js';

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: node src/cli.js [directory] [--json] [--fresh-clone]\n\nCheck .md files for missing local links and images.\n--fresh-clone also checks whether targets are in the latest Git commit.\nExit codes: 0 clean, 1 link problems, 2 usage or filesystem error.');
} else {
  const positional = args.filter(arg => !arg.startsWith('--'));
  if (positional.length > 1 || args.some(arg => arg.startsWith('--') && !['--json', '--fresh-clone'].includes(arg))) {
    console.error('Invalid arguments. Use --help for usage.');
    process.exitCode = 2;
  } else {
    try {
      const result = await checkDirectory(positional[0] ?? '.', { freshClone: args.includes('--fresh-clone') });
      if (args.includes('--json')) console.log(JSON.stringify(result, null, 2));
      else {
        if (result.commit) console.log(`Checking files against Git commit ${result.commit.slice(0, 12)}.`);
        for (const issue of result.issues) console.log(`${issue.file}:${issue.line}: ${issue.reason}: ${issue.target}`);
        console.log(`Scanned ${result.files} Markdown files; checked ${result.checked} local links; found ${result.issues.length} problems.`);
      }
      process.exitCode = result.issues.length ? 1 : 0;
    } catch (error) {
      console.error(`Could not check documents: ${error.message}`);
      process.exitCode = 2;
    }
  }
}
