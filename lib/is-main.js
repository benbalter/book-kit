// True when the module at `metaUrl` is the script node was asked to run, as
// opposed to being imported (by another command or a test).
//
// Commands used to compare process.argv[1] with fileURLToPath(import.meta.url)
// directly. Node reports import.meta.url as the real path, but argv[1] as the
// path it was given, so through a symlinked node_modules (npm link, pnpm, a
// worktree sharing another checkout's install) the two differ and the command
// silently did nothing. Compare real paths instead.

import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function isMain(metaUrl) {
  const script = process.argv[1];
  if (!script) return false;
  try {
    return realpathSync(script) === realpathSync(fileURLToPath(metaUrl));
  } catch {
    return false;
  }
}
