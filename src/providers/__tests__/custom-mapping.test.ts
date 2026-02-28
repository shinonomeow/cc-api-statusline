/**
 * Tests for custom provider response mapping
 */

/* eslint-disable @typescript-eslint/no-deprecated */
import { describe, it, expect } from 'vitest';
import {
  resolveJsonPath,
  extractNumber,
  extractString,
  extractQuotaWindow,
  extractTokenStatsPeriod,
  mapResponseToUsage,
} from '../custom-mapping.js';
import type { CustomProviderConfig } from '../../types/index.js';

describe('custom-mapping', () => {
  describe('resolveJsonPath', () => {
    const data = {
      user: {
        name: 'Alice',
        nested: {
          value: 42,
        },
      },
      items: [
        { id: 1, name: 'first' },
        { id: 2, name: 'second' },
      ],
    };

    it('should resolve simple path', () => {
      expect(resolveJsonPath(data, '$.user.name')).toBe('Alice');
    });

    it('should resolve nested path', () => {
      expect(resolveJsonPath(data, '$.user.nested.value')).toBe(42);
    });

    it('should resolve array index', () => {
      expect(resolveJsonPath(data, '$.items[0].name')).toBe('first');
      expect(resolveJsonPath(data, '$.items[1].id')).toBe(2);
    });

    it('should return null for missing path', () => {
      expect(resolveJsonPath(data, '$.missing.field')).toBeNull();
    });

    it('should treat non-$. path as literal', () => {
      expect(resolveJsonPath(data, 'literal')).toBe('literal');
    });
  });

  describe('extractNumber', () => {
    it('should extract number value', () => {
      const data = { value: 42 };
      expect(extractNumber(data, '$.value')).toBe(42);
    });

    it('should parse string number', () => {
      const data = { value: '3.14' };
      expect(extractNumber(data, '$.value')).toBe(3.14);
    });

    it('should return null for non-number', () => {
      const data = { value: 'abc' };
      expect(extractNumber(data, '$.value')).toBeNull();
    });

    it('should return null for missing field', () => {
      const data = {};
      expect(extractNumber(data, '$.missing')).toBeNull();
    });
  });

  describe('extractString', () => {
    it('should extract string value', () => {
      const data = { name: 'test' };
      expect(extractString(data, '$.name')).toBe('test');
    });

    it('should convert number to string', () => {
      const data = { value: 42 };
      expect(extractString(data, '$.value')).toBe('42');
    });

    it('should return default for missing field', () => {
      const data = {};
      expect(extractString(data, '$.missing', 'default')).toBe('default');
    });
  });

  describe('extractQuotaWindow', () => {
    it('should extract valid quota window', () => {
      const data = {
        daily: {
          used: 10,
          limit: 50,
          resetsAt: '2024-03-15T00:00:00Z',
        },
      };
      const mapping = {
        'daily.used': '$.daily.used',
        'daily.limit': '$.daily.limit',
        'daily.resetsAt': '$.daily.resetsAt',
      };

      const result = extractQuotaWindow(data, mapping, 'daily');

      expect(result).toEqual({
        used: 10,
        limit: 50,
        remaining: 40,
        resetsAt: '2024-03-15T00:00:00Z',
      });
    });

    it('should return null when used is missing', () => {
      const data = {};
      const mapping = {};

      expect(extractQuotaWindow(data, mapping, 'daily')).toBeNull();
    });

    it('should treat 0 limit as null (unlimited)', () => {
      const data = { daily: { used: 10, limit: 0 } };
      const mapping = {
        'daily.used': '$.daily.used',
        'daily.limit': '$.daily.limit',
      };

      const result = extractQuotaWindow(data, mapping, 'daily');

      expect(result?.limit).toBeNull();
      expect(result?.remaining).toBeNull();
    });
  });

  describe('extractTokenStatsPeriod', () => {
    it('should extract token stats', () => {
      const data = {
        today: {
          requests: 100,
          inputTokens: 1000,
          outputTokens: 500,
          cost: 0.05,
        },
      };
      const mapping = {
        'tokenStats.today.requests': '$.today.requests',
        'tokenStats.today.inputTokens': '$.today.inputTokens',
        'tokenStats.today.outputTokens': '$.today.outputTokens',
        'tokenStats.today.cost': '$.today.cost',
      };

      const result = extractTokenStatsPeriod(data, mapping, 'tokenStats.today');

      expect(result).toEqual({
        requests: 100,
        inputTokens: 1000,
        outputTokens: 500,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 0,
        cost: 0.05,
      });
    });

    it('should return null when requests missing', () => {
      const data = {};
      const mapping = {};

      expect(extractTokenStatsPeriod(data, mapping, 'tokenStats.today')).toBeNull();
    });
  });

  describe('mapResponseToUsage', () => {
    const providerConfig: CustomProviderConfig = {
      id: 'test-provider',
      displayName: 'Test Provider',
      endpoint: '/api/usage',
      method: 'GET',
      auth: { type: 'header', header: 'Authorization', prefix: 'Bearer ' },
      urlPatterns: [],
      responseMapping: {
        billingMode: '$.billingMode',
        planName: '$.plan',
      },
    };

    it('should map complete response', () => {
      const responseData = {
        billingMode: 'subscription',
        plan: 'Pro Plan',
        daily: {
          used: 10,
          limit: 50,
          resetsAt: '2024-03-15T00:00:00Z',
        },
      };

      const mapping = {
        billingMode: '$.billingMode',
        planName: '$.plan',
        'daily.used': '$.daily.used',
        'daily.limit': '$.daily.limit',
        'daily.resetsAt': '$.daily.resetsAt',
      };

      const result = mapResponseToUsage(responseData, mapping, providerConfig);

      expect(result.provider).toBe('test-provider');
      expect(result.billingMode).toBe('subscription');
      expect(result.planName).toBe('Pro Plan');
      expect(result.daily).toEqual({
        used: 10,
        limit: 50,
        remaining: 40,
        resetsAt: '2024-03-15T00:00:00Z',
      });
    });

    it('should use displayName fallback for plan name', () => {
      const responseData = { billingMode: 'subscription' };
      const mapping = { billingMode: '$.billingMode' };

      const result = mapResponseToUsage(responseData, mapping, providerConfig);

      expect(result.planName).toBe('Test Provider');
    });

    it('should compute soonest reset from multiple windows', () => {
      const responseData = {
        billingMode: 'subscription',
        daily: { used: 10, limit: 50, resetsAt: '2024-03-15T00:00:00Z' },
        weekly: { used: 20, limit: 100, resetsAt: '2024-03-18T00:00:00Z' },
      };

      const mapping = {
        billingMode: '$.billingMode',
        'daily.used': '$.daily.used',
        'daily.limit': '$.daily.limit',
        'daily.resetsAt': '$.daily.resetsAt',
        'weekly.used': '$.weekly.used',
        'weekly.limit': '$.weekly.limit',
        'weekly.resetsAt': '$.weekly.resetsAt',
      };

      const result = mapResponseToUsage(responseData, mapping, providerConfig);

      expect(result.resetsAt).toBe('2024-03-15T00:00:00Z');
    });
  });
});
