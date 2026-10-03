import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extractLinks, checkDirectory } from '../src/checker.js';

async function fixture(t, files) {
  const root = await mkdtemp(path.join(tmpdir(), 'markdown-local-check-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    const fullPath = path.join(root, name);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content);
  }
  return root;
}

test('reports missing links and images with accurate source lines', async t => {
  const root = await fixture(t, { 'README.md': '[good](guide.md)\n[bad](missing.md)\n![image](missing.png)', 'guide.md': '# Guide' });
  const result = await checkDirectory(root);
  assert.equal(result.checked, 3);
  assert.deepEqual(result.issues.map(x => [x.file, x.line, x.target]), [['README.md', 2, 'missing.md'], ['README.md', 3, 'missing.png']]);
});

test('resolves nested relative links, root links, queries and encoded spaces', async t => {
  const root = await fixture(t, { 'docs/start.md': '[a](../guide%20one.md#intro) [b](/assets/photo.png?v=1)', 'guide one.md': '', 'assets/photo.png': '' });
  const result = await checkDirectory(root);
  assert.equal(result.checked, 2);
  assert.deepEqual(result.issues, []);
});

test('ignores fenced code and inline code while retaining line numbers', () => {
  const text = '```md\n[example](no.md)\n```\n`[example](no.md)`\n[real](yes.md)\n~~~\n![no](no.png)\n~~~';
  assert.deepEqual(extractLinks(text), [{ target: 'yes.md', line: 5 }]);
});

test('handles explicit, collapsed and shortcut reference links', () => {
  assert.deepEqual(extractLinks('[one][Ref]\n[Ref][]\n[Ref]\n\n[ref]: docs/guide.md "Title"').map(x => x.target), ['docs/guide.md', 'docs/guide.md', 'docs/guide.md']);
});

test('supports balanced parentheses, escaped parentheses, angle paths and titles', () => {
  assert.deepEqual(extractLinks('[a](guide(v2).md) [b](guide\\(v1\\).md) [c](<guide one.md> "Title")').map(x => x.target), ['guide(v2).md', 'guide(v1).md', 'guide one.md']);
});

test('skips external links and fragment-only links', async t => {
  const root = await fixture(t, { 'README.md': '[web](https://example.com) [email](mailto:test@example.com) [fragment](#intro) [cdn](//example.com/image.png)' });
  const result = await checkDirectory(root);
  assert.equal(result.checked, 0);
  assert.deepEqual(result.issues, []);
});

test('invalid encoding is a diagnostic and dependency folders are skipped', async t => {
  const root = await fixture(t, { 'README.md': '[bad](%ZZ.md)', 'node_modules/a/README.md': '[bad](missing.md)', '.git/README.md': '[bad](missing.md)' });
  const result = await checkDirectory(root);
  assert.equal(result.files, 1);
  assert.equal(result.issues[0].reason, 'invalid URL encoding');
});

test('CLI returns documented exit codes and parseable JSON', async t => {
  const root = await fixture(t, { 'README.md': '[missing](no.md)' });
  const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
  const broken = spawnSync(process.execPath, [cli, root, '--json'], { encoding: 'utf8' });
  assert.equal(broken.status, 1);
  assert.equal(JSON.parse(broken.stdout).issues.length, 1);
  await writeFile(path.join(root, 'no.md'), '');
  assert.equal(spawnSync(process.execPath, [cli, root]).status, 0);
  assert.equal(spawnSync(process.execPath, [cli, path.join(root, 'absent')]).status, 2);
  assert.equal(spawnSync(process.execPath, [cli, '--unknown']).status, 2);
});
