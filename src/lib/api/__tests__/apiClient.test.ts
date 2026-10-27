import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { apiUrl, getCloudHubUrl } from '../apiClient.ts';

describe('API Client Cloud Hub URL Routing', () => {
  it('1. returns relative path by default when no cloud hub URL is set', () => {
    const url = apiUrl('/api/live/sessions');
    assert.equal(url, '/api/live/sessions');
  });

  it('2. prepends cloud hub base URL with leading and trailing slash handling', () => {
    process.env.NEXT_PUBLIC_CLOUD_HUB_URL = 'https://worshipy.vercel.app/';
    assert.equal(getCloudHubUrl(), 'https://worshipy.vercel.app');
    assert.equal(
      apiUrl('/api/live/sessions'),
      'https://worshipy.vercel.app/api/live/sessions'
    );
    assert.equal(
      apiUrl('api/auth/login'),
      'https://worshipy.vercel.app/api/auth/login'
    );
    delete process.env.NEXT_PUBLIC_CLOUD_HUB_URL;
  });
});
