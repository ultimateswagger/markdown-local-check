# Contributing

Thanks for taking a look. Small, well-tested improvements are welcome.

For a bug report, include the Markdown snippet, the expected result, actual output, your Node.js version, and your operating system. Remove private paths before sharing output.

For a pull request:

1. Describe the problem and expected behavior.
2. Add a regression test using a temporary fixture in `test/checker.test.js`.
3. Run `npm test` and `npm run check`.
4. Update the README if supported syntax or command behavior changes.

Useful next improvements include heading-anchor validation, configurable exclusions, and better CommonMark handling. Please discuss larger changes in an issue first.
