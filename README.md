# Markdown Local Check

A small offline tool for finding broken local file links and missing images in Markdown documentation. It prints the file and line for each problem and exits with a failure code, so you can catch mistakes before merging documentation changes.

It can also catch a less obvious problem: a linked file exists on your computer, but it was never committed, so the next person who clones the repository will not receive it.

Requires Node.js 22 or newer. No extra packages, accounts, or network requests are needed. Fresh-clone checks also require Git.

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

## Will these links work in a fresh clone?

Run this from the tool's folder, passing the Git repository you want to check:

```sh
node src/cli.js /path/to/your/project --fresh-clone
```

This mode needs Git and at least one commit. It checks Markdown files included in the latest local commit (`HEAD`), reading their current contents from disk. Linked files must both exist locally and be included in that commit. Paths beginning with `/` still use the directory you pass as their root.

For example, a README links to a local screenshot, but `.gitignore` excludes the screenshots folder. The ordinary check passes because the image exists. Fresh-clone checking reports:

```text
README.md:12: target exists locally but is ignored by Git: screenshots/setup.png
```

Other reports distinguish files that have not been committed, files staged for the next commit, empty directories, and targets outside the repository. A directory is available only if it contains committed files; Git does not store empty directories. Symbolic links and submodules, including targets inside them, are reported as needing a separate check or checkout.

For this repository, use `npm run check:clone`. Combine `--fresh-clone` with `--json` to include the checked commit hash in structured output.

This checks documentation file availability, not whether the application builds or runs. It does not verify that your latest local commit was pushed, run installation commands, or inspect ignored files' contents. Untracked Markdown documents are skipped in this mode. Commit intended documentation changes before using it as a final release check.

## What it checks

- Inline links and images: `[guide](docs/guide.md)` and `![diagram](images/diagram.png)`.
- Full, collapsed, and shortcut reference links.
- Relative paths, percent-encoded spaces, and paths wrapped in angle brackets.
- Paths starting with `/`, resolved from the directory you pass to the tool.
- File existence after removing query strings and fragments.

Code fences and inline code are ignored. `.git`, `node_modules`, and `.cache` folders are skipped, as are symbolic links during traversal. External URLs and anchor-only links are skipped.

## Limits

This is a focused file-existence checker, not a complete CommonMark parser. It does not validate heading anchors, remote URLs, HTML links, MDX, multiline link labels, escaped or nested link labels, indented code blocks, or site-specific routing. In ordinary mode, a directory target counts as existing; the tool does not require an index file or check Git tracking. Some complex Markdown may be missed or misclassified. Use links to actual source files when checking documentation for static sites.

## GitHub checks

The included [workflow](.github/workflows/ci.yml) runs tests and checks this repository on pushes and pull requests. To use the tool in another repository, check it out alongside your code and run `node /path/to/markdown-local-check/src/cli.js /path/to/your/repository`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports with small Markdown examples are especially helpful.

Licensed under the [MIT License](LICENSE).
