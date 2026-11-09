import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  sanitizeSubmissionForFirestore,
} from '../submissionsService.ts';
import type { SongSubmission } from '@/types/auth';

describe('Cloud Submissions Service Unit Tests', () => {
  it('1. sanitizeSubmissionForFirestore strips undefined and forbidden keys', () => {
    const rawSubmission: Partial<SongSubmission> & { illegalField?: string } = {
      id: 'sub_test_123',
      songId: 'song_456',
      status: 'pending',
      submittedAt: '2026-11-09T00:00:00.000Z',
      submissionNotes: 'Added passing chords in Chorus',
      illegalField: 'should_be_stripped',
      adminNotes: undefined,
    };

    const sanitized = sanitizeSubmissionForFirestore(rawSubmission as SongSubmission);

    assert.strictEqual(sanitized.id, 'sub_test_123');
    assert.strictEqual(sanitized.songId, 'song_456');
    assert.strictEqual(sanitized.status, 'pending');
    assert.strictEqual(sanitized.submissionNotes, 'Added passing chords in Chorus');
    assert.strictEqual('illegalField' in sanitized, false, 'Forbidden fields must be removed');
    assert.strictEqual('adminNotes' in sanitized, false, 'Undefined properties must not exist on the object');
  });

  it('2. sanitizeSubmissionForFirestore retains valid nested song and submittedBy maps', () => {
    const rawSubmission: Partial<SongSubmission> = {
      id: 'sub_test_789',
      songId: 'song_789',
      song: {
        id: 'song_789',
        slug: 'test-song',
        title: 'Test Song',
        artist: 'Test Artist',
        originalKey: 'G',
        sections: [],
        language: { code: 'en', label: 'English' },
        category: { id: 'contemporary-worship', label: 'Contemporary' },
        contentStatus: 'original',
      },
      submittedBy: {
        userId: 'leader_1',
        email: 'leader@church.com',
        displayName: 'Worship Leader',
        churchName: 'Bethel Church',
      },
      status: 'pending',
      submittedAt: new Date().toISOString(),
    };

    const sanitized = sanitizeSubmissionForFirestore(rawSubmission as SongSubmission);

    assert.strictEqual(sanitized.id, 'sub_test_789');
    assert.deepStrictEqual((sanitized.song as any).title, 'Test Song');
    assert.deepStrictEqual((sanitized.submittedBy as any).displayName, 'Worship Leader');
    assert.strictEqual(sanitized.status, 'pending');
  });
});
