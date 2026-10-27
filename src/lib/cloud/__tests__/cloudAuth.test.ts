import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  findUserByEmail,
  registerUser,
  verifyUserLogin,
  validateSessionToken,
  revokeSession,
  updateUserProfile,
  saveUserSync,
  getUserSync,
  submitSongForGlobalPublishing,
  listSubmissions,
  getSubmissionById,
  reviewSongSubmission,
  getApprovedGlobalSongs,
} from '../cloudDb.ts';
import type { SongRecord } from '../../../types/song.ts';

const SAMPLE_SONG: SongRecord = {
  id: 'test_song_001',
  slug: 'sa-iyong-presensya-test',
  title: 'Sa Iyong Presensya',
  artist: 'Elena Reyes',
  attribution: 'Elena Reyes',
  originalKey: 'G',
  language: { code: 'fil', label: 'Filipino / Tagalog' },
  category: { id: 'filipino-worship', label: 'Filipino Worship' },
  sourceType: 'custom',
  contentStatus: 'authorized',
  rightsAcknowledged: true,
  sections: [
    {
      id: 'sec_1',
      type: 'verse',
      label: 'Verse 1',
      lines: [
        {
          segments: [
            { chord: 'G', text: 'Sa bawat umaga ' },
            { chord: 'D', text: 'biyaya Mo ay tapat' },
          ],
        },
      ],
    },
  ],
};

describe('Cloud Auth, Sync & Global Song Curation Engine', () => {
  it('1. verifies seeded admin credentials and role', () => {
    const admin = findUserByEmail('admin@worshipy.app');
    assert.ok(admin, 'Admin user should be seeded');
    assert.equal(admin.role, 'admin');
    assert.equal(admin.email, 'admin@worshipy.app');

    const authRes = verifyUserLogin('admin@worshipy.app', 'admin123456');
    assert.ok(authRes.token.startsWith('wsess_'));
    assert.equal(authRes.profile.role, 'admin');

    const validated = validateSessionToken(authRes.token);
    assert.ok(validated);
    assert.equal(validated.id, admin.id);
  });

  it('2. verifies seeded worship leader credentials', () => {
    const leader = findUserByEmail('worshipleader@church.com');
    assert.ok(leader, 'Leader user should be seeded');
    assert.equal(leader.role, 'user');

    const authRes = verifyUserLogin('worshipleader@church.com', 'password123');
    assert.ok(authRes.token);
    assert.equal(authRes.profile.displayName, 'David Worship');

    // Reject bad password
    assert.throws(() => {
      verifyUserLogin('worshipleader@church.com', 'wrongpassword');
    }, /Invalid email or password/);
  });

  it('3. registers a new user and rejects duplicates or short passwords', () => {
    const uniqueEmail = `musician_${Date.now()}@church.ph`;

    // Reject short password
    assert.throws(() => {
      registerUser({
        email: uniqueEmail,
        password: '123',
        displayName: 'Test Musician',
      });
    }, /Password must be at least 6 characters/);

    // Register successfully
    const regRes = registerUser({
      email: uniqueEmail,
      password: 'mypassword123',
      displayName: 'Joy Santos',
      churchName: 'Faith Fellowship',
      instrument: 'Keys & Synth',
    });

    assert.equal(regRes.profile.email, uniqueEmail);
    assert.equal(regRes.profile.displayName, 'Joy Santos');
    assert.equal(regRes.profile.role, 'user');
    assert.ok(regRes.token.startsWith('wsess_'));

    // Reject duplicate email registration
    assert.throws(() => {
      registerUser({
        email: uniqueEmail,
        password: 'mypassword123',
        displayName: 'Duplicate User',
      });
    }, /already exists/);
  });

  it('4. manages user profile and cloud storage updates', () => {
    const admin = findUserByEmail('admin@worshipy.app');
    assert.ok(admin);

    const updated = updateUserProfile(admin.id, {
      displayName: 'Senior Admin & Overseer',
      cloudStorage: {
        provider: 'gdrive',
        folderUrl: 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz',
        folderName: 'Worship Chords & Stems',
        connectedAt: new Date().toISOString(),
      },
    });

    assert.equal(updated.displayName, 'Senior Admin & Overseer');
    assert.equal(updated.cloudStorage?.provider, 'gdrive');
    assert.equal(updated.cloudStorage?.folderName, 'Worship Chords & Stems');
  });

  it('5. handles session revocation and invalidation', () => {
    const authRes = verifyUserLogin('admin@worshipy.app', 'admin123456');
    assert.ok(authRes.token);

    const validBefore = validateSessionToken(authRes.token);
    assert.ok(validBefore);

    revokeSession(authRes.token);
    const validAfter = validateSessionToken(authRes.token);
    assert.equal(validAfter, null);
  });

  it('6. saves and retrieves cross-device cloud sync data', () => {
    const leader = findUserByEmail('worshipleader@church.com');
    assert.ok(leader);

    const syncPayload = {
      customSongs: [SAMPLE_SONG],
      setlists: [{ id: 'set_1', name: 'Sunday Morning' }],
      favorites: [SAMPLE_SONG.id],
      lastSyncedAt: new Date().toISOString(),
    };

    saveUserSync(leader.id, syncPayload);

    const retrieved = getUserSync(leader.id);
    assert.ok(retrieved);
    assert.equal(retrieved.customSongs.length, 1);
    assert.equal(retrieved.customSongs[0].title, 'Sa Iyong Presensya');
    assert.equal(retrieved.setlists.length, 1);
    assert.equal(retrieved.favorites[0], SAMPLE_SONG.id);
  });

  it('7. allows user to submit a song for global publishing and enforces curation rules', () => {
    const leader = findUserByEmail('worshipleader@church.com');
    const admin = findUserByEmail('admin@worshipy.app');
    assert.ok(leader);
    assert.ok(admin);

    // Submit song
    const submission = submitSongForGlobalPublishing({
      userId: leader.id,
      song: SAMPLE_SONG,
      submissionNotes: 'Original arrangement used at Sunday Youth Fellowship.',
    });

    assert.ok(submission.id.startsWith('sub_'));
    assert.equal(submission.status, 'pending');
    assert.equal(submission.song.title, 'Sa Iyong Presensya');
    assert.equal(submission.submittedBy.userId, leader.id);

    // Verify submission is listed
    const userSubmissions = listSubmissions({ userId: leader.id });
    assert.ok(userSubmissions.some((s) => s.id === submission.id));

    const retrievedSub = getSubmissionById(submission.id);
    assert.ok(retrievedSub);
    assert.equal(retrievedSub.status, 'pending');

    // Non-admin user cannot approve submission
    assert.throws(() => {
      reviewSongSubmission({
        submissionId: submission.id,
        adminUserId: leader.id, // Not admin!
        status: 'approved',
      });
    }, /Unauthorized: Admin privileges required/);

    // Admin approves submission
    const approvedSub = reviewSongSubmission({
      submissionId: submission.id,
      adminUserId: admin.id,
      status: 'approved',
      adminNotes: 'Excellent arrangement and verified chord notation. Approved!',
    });

    assert.equal(approvedSub.status, 'approved');
    assert.equal(approvedSub.reviewedBy?.userId, admin.id);

    // Approved song is now published in the global catalog
    const globalSongs = getApprovedGlobalSongs();
    const globalMatch = globalSongs.find((s) => s.title === SAMPLE_SONG.title);
    assert.ok(globalMatch, 'Approved song should appear in global catalog');
    assert.equal(globalMatch.sourceType, 'catalog');
    assert.ok(globalMatch.attribution?.includes(leader.displayName));

    // Admin can reject or request revision
    const rejectedSub = reviewSongSubmission({
      submissionId: submission.id,
      adminUserId: admin.id,
      status: 'rejected',
      adminNotes: 'Please correct typo in Chorus chord line before resubmitting.',
    });

    assert.equal(rejectedSub.status, 'rejected');
    const globalSongsAfterReject = getApprovedGlobalSongs();
    assert.equal(
      globalSongsAfterReject.some((s) => s.title === SAMPLE_SONG.title),
      false,
      'Rejected song must be removed from global catalog'
    );
  });
});
