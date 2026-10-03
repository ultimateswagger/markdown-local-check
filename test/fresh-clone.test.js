import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkDirectory } from '../src/checker.js';

function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true });
}

async function write(root, name, content = '') {
  await mkdir(path.dirname(path.join(root, name)), { recursive: true });
  await writeFile(path.join(root, name), content);
}

function commit(root) {
  git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Test fixture');
}

async function repository(t, files, createCommit = true) {
  const root = await mkdtemp(path.join(tmpdir(), 'markdown-clone-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  git(root, 'init', '--quiet');
  for (const [name, content] of Object.entries(files)) await write(root, name, content);
  if (createCommit) {
    git(root, 'add', '--all');
    commit(root);
  }
  return root;
}

test('finds untracked and ignored targets that pass an ordinary link check', async t => {
  const root = await repository(t, {
    'README.md': '[guide](docs/local.md)\n![image](assets/preview.png)\n[tracked](docs/guide.md)',
    'docs/guide.md': '# Guide', '.gitignore': 'assets/\n',
  });
  await write(root, 'docs/local.md');
  await write(root, 'assets/preview.png');
  assert.deepEqual((await checkDirectory(root)).issues, []);
  const result = await checkDirectory(root, { freshClone: true });
  assert.equal(result.checked, 3);
  assert.match(result.commit, /^[a-f\d]{40,64}$/);
  assert.deepEqual(result.issues.map(x => [x.line, x.reason]), [
    [1, 'target exists locally but is not in the latest commit'],
    [2, 'target exists locally but is ignored by Git'],
  ]);
});

test('staged files need a commit before another developer receives them', async t => {
  const root = await repository(t, { 'README.md': '[guide](guide.md)' });
  await write(root, 'guide.md');
  git(root, 'add', '--', 'guide.md');
  assert.equal((await checkDirectory(root, { freshClone: true })).issues[0].reason, 'file is staged but not in the latest commit');
  commit(root);
  assert.deepEqual((await checkDirectory(root, { freshClone: true })).issues, []);
});

test('distinguishes directories with committed contents from empty local directories', async t => {
  const root = await repository(t, { 'README.md': '[docs](docs/)\n[empty](empty/)', 'docs/guide.md': '' });
  await mkdir(path.join(root, 'empty'));
  const result = await checkDirectory(root, { freshClone: true });
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].target, 'empty/');
  assert.equal(result.issues[0].reason, 'directory has no committed files');
});

test('works from a repository subfolder and handles filenames with spaces', async t => {
  const root = await repository(t, { 'docs/README.md': '[guide](../guide%20one.md)', 'guide one.md': '' });
  const result = await checkDirectory(path.join(root, 'docs'), { freshClone: true });
  assert.equal(result.files, 1);
  assert.equal(result.checked, 1);
  assert.deepEqual(result.issues, []);
});

test('reports existing files outside the repository', async t => {
  const root = await repository(t, { 'README.md': '# Hello' });
  const parent = await mkdtemp(path.join(tmpdir(), 'markdown-outside-test-'));
  t.after(() => rm(parent, { recursive: true, force: true }));
  await write(parent, 'outside.md');
  const relative = path.relative(root, path.join(parent, 'outside.md')).split(path.sep).join('/');
  await write(root, 'README.md', `[outside](<${relative}>)`);
  assert.equal((await checkDirectory(root, { freshClone: true })).issues[0].reason, 'target is outside the repository');
});

test('leaves untracked scratch Markdown out of fresh-clone checking', async t => {
  const root = await repository(t, { 'README.md': '# Hello' });
  await write(root, 'scratch.md', '[missing](missing.md)');
  const result = await checkDirectory(root, { freshClone: true });
  assert.equal(result.files, 1);
  assert.deepEqual(result.issues, []);
});

test('CLI explains missing Git history and returns exit code 2', async t => {
  const root = await repository(t, { 'README.md': '# Hello' }, false);
  const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
  const result = spawnSync(process.execPath, [cli, root, '--fresh-clone'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /at least one commit/);
});

test('CLI JSON includes the checked commit and identifies ignored targets', async t => {
  const root = await repository(t, { 'README.md': '[local](local.txt)', '.gitignore': 'local.txt\n' });
  await write(root, 'local.txt');
  const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
  const result = spawnSync(process.execPath, [cli, root, '--fresh-clone', '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.commit, git(root, 'rev-parse', 'HEAD').trim());
  assert.equal(report.issues[0].reason, 'target exists locally but is ignored by Git');
});
