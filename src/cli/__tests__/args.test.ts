/**
 * CLI Argument Parsing Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseArgs } from '../args.js';

describe('parseArgs', () => {
  let originalArgv: string[];

  beforeEach(() => {
    originalArgv = process.argv;
    process.argv = ['node', 'cc-api-statusline'];
    delete process.env['CC_API_STATUSLINE_EMBEDDED'];
  });

  afterEach(() => {
    process.argv = originalArgv;
    delete process.env['CC_API_STATUSLINE_EMBEDDED'];
  });

  describe('embedded flag', () => {
    it('returns embedded=false when neither flag nor env var is set', () => {
      expect(parseArgs().embedded).toBe(false);
    });

    it('returns embedded=true when --embedded flag is passed', () => {
      process.argv = ['node', 'cc-api-statusline', '--embedded'];
      expect(parseArgs().embedded).toBe(true);
    });

    it('returns embedded=true when CC_API_STATUSLINE_EMBEDDED=1', () => {
      process.env['CC_API_STATUSLINE_EMBEDDED'] = '1';
      expect(parseArgs().embedded).toBe(true);
    });

    it('returns embedded=true when CC_API_STATUSLINE_EMBEDDED=true', () => {
      process.env['CC_API_STATUSLINE_EMBEDDED'] = 'true';
      expect(parseArgs().embedded).toBe(true);
    });

    it('ignores CC_API_STATUSLINE_EMBEDDED when set to other values', () => {
      process.env['CC_API_STATUSLINE_EMBEDDED'] = 'yes';
      expect(parseArgs().embedded).toBe(false);
    });
  });
});
