import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { realpath } from 'node:fs/promises';
import path from 'node:path';

const execFileAsync = promisify(execFile);

async function git(directory, args) {
  const { stdout } = await execFileAsync('git', ['-C', directory, ...args], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  return stdout;
}

export async function readRepository(directory) {
  let root;
  let commit;
  try {
    root = await realpath((await git(directory, ['rev-parse', '--show-toplevel'])).trim());
    commit = (await git(directory, ['rev-parse', '--verify', 'HEAD'])).trim();
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('Fresh-clone checks need Git installed.');
    throw new Error('Fresh-clone checks need a Git repository with at least one commit.');
  }

  const committed = new Map();
  const tree = await git(root, ['ls-tree', '-r', '-z', '--full-tree', commit]);
  for (const entry of tree.split('\0')) {
    if (!entry) continue;
    const tab = entry.indexOf('\t');
    const [mode] = entry.slice(0, tab).split(' ');
    committed.set(entry.slice(tab + 1), mode);
  }
  const staged = new Set((await git(root, ['ls-files', '--cached', '-z'])).split('\0').filter(Boolean));
  return { root, commit, committed, staged };
}

export function repositoryPath(repository, absolute) {
  const relative = path.relative(repository.root, absolute);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
  return relative.split(path.sep).join('/');
}

export async function cloneProblem(repository, absolute, isDirectory) {
  const relative = repositoryPath(repository, absolute);
  if (relative === null) return 'target is outside the repository';

  const mode = repository.committed.get(relative);
  if (mode === '120000') return 'symbolic link needs a separate target check';
  if (mode === '160000') return 'submodule needs a separate checkout';
  if (mode) return null;

  // Git stores files, not directories. A directory survives only if it has committed contents.
  const prefix = relative ? `${relative}/` : '';
  if (isDirectory && [...repository.committed.keys()].some(file => file.startsWith(prefix))) return null;
  if (repository.staged.has(relative)) return 'file is staged but not in the latest commit';

  try {
    await git(repository.root, ['check-ignore', '--no-index', '--', relative]);
    return 'target exists locally but is ignored by Git';
  } catch (error) {
    if (error.code !== 1) throw error;
  }
  return isDirectory
    ? 'directory has no committed files'
    : 'target exists locally but is not in the latest commit';
}
