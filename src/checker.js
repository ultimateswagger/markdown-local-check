import { stat, readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { readRepository, repositoryPath, cloneProblem } from './git.js';

const excluded = new Set(['.git', 'node_modules', '.cache']);

// Blank code while preserving offsets and newlines for accurate diagnostics.
function withoutCode(text) {
  let fence;
  return text.split('\n').map(line => {
    const match = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {
      if (match && match[1][0] === fence[0] && match[1].length >= fence.length &&
          /^ {0,3}(?:`+|~+)\s*$/.test(line)) fence = undefined;
      return ' '.repeat(line.length);
    }
    if (match) {
      fence = match[1];
      return ' '.repeat(line.length);
    }
    return line.replace(/(`+)([^`]|(?!\1)`)*?\1/g, value => ' '.repeat(value.length));
  }).join('\n');
}

const normalizeLabel = label => label.trim().replace(/\s+/g, ' ').toLowerCase();
const unescapeMarkdown = value => value.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g, '$1');

function destination(text, start) {
  let cursor = start;
  while (/\s/.test(text[cursor] ?? '') && cursor < text.length) cursor++;
  if (text[cursor] === '<') {
    const end = text.indexOf('>', cursor + 1);
    return end < 0 ? null : { value: text.slice(cursor + 1, end), end: end + 1 };
  }
  const begin = cursor;
  let depth = 0;
  while (cursor < text.length) {
    const char = text[cursor];
    if (char === '\\' && cursor + 1 < text.length) { cursor += 2; continue; }
    if (char === '(') depth++;
    if (char === ')') {
      if (depth === 0) break;
      depth--;
    }
    if (/\s/.test(char)) break;
    cursor++;
  }
  return { value: text.slice(begin, cursor), end: cursor };
}

export function extractLinks(markdown) {
  const text = withoutCode(markdown);
  const definitions = new Map();
  for (const match of text.matchAll(/^ {0,3}\[([^\]\n]+)\]:[ \t]*(.*)$/gm)) {
    const target = destination(match[2], 0);
    const label = normalizeLabel(match[1]);
    if (target && !definitions.has(label)) definitions.set(label, target.value);
  }
  const links = [];
  let consumedUntil = 0;
  for (const match of text.matchAll(/(?<!\\)\[([^\]\n]*)\]/g)) {
    if (match.index < consumedUntil) continue;
    const next = match.index + match[0].length;
    let value;
    if (text[next] === '(') {
      const target = destination(text, next + 1);
      if (!target) continue;
      // After the destination, allow an optional quoted Markdown title.
      const suffix = text.slice(target.end).match(/^\s*(?:"[^"\n]*"|'[^'\n]*'|\([^\n)]*\))?\s*\)/);
      if (!suffix) continue;
      value = target.value;
      consumedUntil = target.end + suffix[0].length;
    } else if (text[next] === '[') {
      const reference = text.slice(next).match(/^\[([^\]\n]*)\]/);
      if (!reference) continue;
      value = definitions.get(normalizeLabel(reference[1] || match[1]));
      consumedUntil = next + reference[0].length;
    } else if (text[next] !== ':') {
      value = definitions.get(normalizeLabel(match[1]));
    }
    if (value !== undefined) {
      links.push({ target: unescapeMarkdown(value), line: text.slice(0, match.index).split('\n').length });
    }
  }
  return links;
}

export async function checkFile(file, root, repository) {
  const links = extractLinks(await readFile(file, 'utf8'));
  const issues = [];
  let checked = 0;
  for (const { target, line } of links) {
    // Anchor-only links, URLs, mailto, data URLs and protocol-relative URLs are out of scope.
    if (!target || target.startsWith('#') || target.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(target)) continue;
    const rawPath = target.split(/[?#]/, 1)[0];
    if (!rawPath) continue;
    checked++;
    let localPath;
    try { localPath = decodeURIComponent(rawPath); }
    catch {
      issues.push({ file, line, target, reason: 'invalid URL encoding' });
      continue;
    }
    const absolute = localPath.startsWith('/')
      ? path.resolve(root, `.${localPath}`)
      : path.resolve(path.dirname(file), localPath);
    let info;
    try { info = await stat(absolute); }
    catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
      issues.push({ file, line, target, reason: 'target does not exist' });
      continue;
    }
    if (repository) {
      const reason = await cloneProblem(repository, absolute, info.isDirectory());
      if (reason) issues.push({ file, line, target, reason });
    }
  }
  return { checked, issues };
}

async function markdownFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory() && !excluded.has(entry.name)) files.push(...await markdownFiles(fullPath));
    else if (entry.isFile() && /\.md$/i.test(entry.name)) files.push(fullPath);
    // Symbolic links are skipped to avoid traversal loops.
  }
  return files.sort();
}

export async function checkDirectory(directory, { freshClone = false } = {}) {
  const root = await realpath(path.resolve(directory));
  const repository = freshClone ? await readRepository(root) : null;
  let files = await markdownFiles(root);
  if (repository) {
    files = files.filter(file => {
      const mode = repository.committed.get(repositoryPath(repository, file));
      return mode === '100644' || mode === '100755';
    });
  }
  let checked = 0;
  const issues = [];
  for (const file of files) {
    const result = await checkFile(file, root, repository);
    checked += result.checked;
    issues.push(...result.issues.map(issue => ({ ...issue, file: path.relative(root, issue.file).split(path.sep).join('/') })));
  }
  const result = { files: files.length, checked, issues };
  if (repository) result.commit = repository.commit;
  return result;
}
