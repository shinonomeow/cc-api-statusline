import { homedir } from 'node:os';
import { join } from 'node:path';

/** Returns the cc-api-statusline config directory path. */
export function getConfigDir(): string {
  return join(homedir(), '.claude', 'cc-api-statusline');
}
