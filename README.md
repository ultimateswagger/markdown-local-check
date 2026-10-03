# Markdown Local Check

A small offline tool for finding broken local file links and missing images in Markdown documentation. It prints the file and line for each problem and exits with a failure code, so you can catch mistakes before merging documentation changes.

Requires Node.js 22 or newer. No dependencies, accounts, or network requests are needed.

## Quick start

Download or clone this repository, open a terminal in its folder, then run:

```sh
node src/cli.js /path/to/your/project
```

To check this repository itself:

```sh
npm test
npm run check
```

Example output for a missing image:

```text
docs/setup.md:12: target does not exist: images/setup.png
Scanned 3 Markdown files; checked 8 local links; found 1 problems.
```

Use `node src/cli.js /path/to/project --json` for structured output. Exit codes are `0` for no problems, `1` for broken targets, and `2` for usage or filesystem errors.

## What it checks

- Inline links and images: `[guide](docs/guide.md)` and `![diagram](images/diagram.png)`.
- Full, collapsed, and shortcut reference links.
- Relative paths, percent-encoded spaces, and paths wrapped in angle brackets.
- Paths starting with `/`, resolved from the directory you pass to the tool.
- File existence after removing query strings and fragments.

Code fences and inline code are ignored. `.git`, `node_modules`, and `.cache` folders are skipped, as are symbolic links during traversal. External URLs and anchor-only links are skipped.

## Limits

This is a focused file-existence checker, not a complete CommonMark parser. It does not validate heading anchors, remote URLs, HTML links, MDX, multiline link labels, escaped or nested link labels, indented code blocks, or site-specific routing. A directory target counts as existing; the tool does not require an index file. Git-ignore rules are not applied. Some complex Markdown may be missed or misclassified. Use links to actual source files when checking documentation for static sites.

## GitHub checks

The included [workflow](.github/workflows/ci.yml) runs tests and checks this repository on pushes and pull requests. To use the tool in another repository, check it out alongside your code and run `node /path/to/markdown-local-check/src/cli.js /path/to/your/repository`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports with small Markdown examples are especially helpful. This is an initial release; no adoption or download claims are made.

Licensed under the [MIT License](LICENSE).
