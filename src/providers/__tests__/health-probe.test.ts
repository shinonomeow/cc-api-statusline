/**
 * Health Probe Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractOrigin, probeHealth } from '../health-probe.js';
import * as http from '../http.js';

describe('extractOrigin', () => {
  it('should extract origin from URL with path', () => {
    expect(extractOrigin('https://v2.vexke.com/api')).toBe('https://v2.vexke.com');
  });

  it('should extract origin from URL with deep path', () => {
    expect(extractOrigin('https://api.example.com/v1/claude/stats')).toBe('https://api.example.com');
  });

  it('should handle URL without path', () => {
    expect(extractOrigin('https://example.com')).toBe('https://example.com');
  });

  it('should handle URL with port', () => {
    expect(extractOrigin('https://localhost:3000/api')).toBe('https://localhost:3000');
  });

  it('should handle HTTP URLs', () => {
    expect(extractOrigin('http://localhost:8080/health')).toBe('http://localhost:8080');
  });

  it('should return original URL on parse error', () => {
    expect(extractOrigin('not-a-url')).toBe('not-a-url');
    expect(extractOrigin('')).toBe('');
  });
});

describe('probeHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should detect claude-relay-service from service field', async () => {
    const mockResponse = {
      status: 'healthy',
      service: 'claude-relay-service',
      version: '1.0.0',
    };

    vi.spyOn(http, 'secureFetch').mockResolvedValue(JSON.stringify(mockResponse));

    const result = await probeHealth('https://v2.vexke.com/api', 1500);
    expect(result).toBe('claude-relay-service');
    expect(http.secureFetch).toHaveBeenCalledWith(
      'https://v2.vexke.com/health',
      expect.objectContaining({
        method: 'GET',
        headers: { Accept: 'application/json' },
      }),
      1500
    );
  });

  it('should detect sub2api from status: ok pattern', async () => {
    const mockResponse = {
      status: 'ok',
    };

    vi.spyOn(http, 'secureFetch').mockResolvedValue(JSON.stringify(mockResponse));

    const result = await probeHealth('https://api.sub2api.com', 1500);
    expect(result).toBe('sub2api');
  });

  it('should return null on timeout', async () => {
    vi.spyOn(http, 'secureFetch').mockRejectedValue(new http.TimeoutError());

    const result = await probeHealth('https://example.com', 500);
    expect(result).toBeNull();
  });

  it('should return null on network error', async () => {
    vi.spyOn(http, 'secureFetch').mockRejectedValue(new Error('Network error'));

    const result = await probeHealth('https://example.com', 1500);
    expect(result).toBeNull();
  });

  it('should return null on HTTP error', async () => {
    vi.spyOn(http, 'secureFetch').mockRejectedValue(new http.HttpError('404 Not Found', 404));

    const result = await probeHealth('https://example.com', 1500);
    expect(result).toBeNull();
  });

  it('should return null on invalid JSON', async () => {
    vi.spyOn(http, 'secureFetch').mockResolvedValue('not valid json');

    const result = await probeHealth('https://example.com', 1500);
    expect(result).toBeNull();
  });

  it('should return null on unrecognized health response pattern', async () => {
    const mockResponse = {
      status: 'operational',
      message: 'All systems go',
    };

    vi.spyOn(http, 'secureFetch').mockResolvedValue(JSON.stringify(mockResponse));

    const result = await probeHealth('https://example.com', 1500);
    expect(result).toBeNull();
  });

  it('should use custom timeout', async () => {
    const mockResponse = { status: 'ok' };
    vi.spyOn(http, 'secureFetch').mockResolvedValue(JSON.stringify(mockResponse));

    await probeHealth('https://example.com', 3000);
    expect(http.secureFetch).toHaveBeenCalledWith(
      'https://example.com/health',
      expect.anything(),
      3000
    );
  });

  it('should strip path from base URL before probing', async () => {
    const mockResponse = { status: 'ok' };
    vi.spyOn(http, 'secureFetch').mockResolvedValue(JSON.stringify(mockResponse));

    await probeHealth('https://v2.vexke.com/api/v1', 1500);
    expect(http.secureFetch).toHaveBeenCalledWith(
      'https://v2.vexke.com/health',
      expect.anything(),
      1500
    );
  });
});
