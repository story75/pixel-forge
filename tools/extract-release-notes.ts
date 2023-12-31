import { join } from 'node:path';

const [_bun, _file, version] = Bun.argv;

if (!version) {
  throw new Error('Version is required');
}

const file = Bun.file(join(import.meta.dir, '../RELEASE_NOTES.md'));
const content = await file.text();

const fromPosition = content.indexOf(`## ${version}`);
if (fromPosition === -1) {
  throw new Error(`Version ${version} not found in RELEASE_NOTES.md`);
}

const toPosition = content
  .substring(fromPosition + 1)
  .search(/## \d+\.\d+\.\d+/);
const releaseNotes = content.substring(
  fromPosition,
  toPosition === -1 ? undefined : fromPosition + 1 + toPosition,
);

// eslint-disable-next-line no-console
console.log(releaseNotes.trim());
