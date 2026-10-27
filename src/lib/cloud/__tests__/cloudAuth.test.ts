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
  removeSongGlobally,
  restoreSongGlobally,
  getRemovedGlobalSongs,
  getRemovedGlobalSongIds,
  getAdminNotifications,
  PRIMARY_ADMIN_EMAIL,
  PRIMARY_ADMIN_PASSWORD,
} from '../cloudDb.ts';
import type { SongRecord } from '../../../types/song.ts';

const SAMPLE_SONG: SongRecord = {
  id: 'test_song_001',
  slug: 'sa-iyong-presensya-test',
  title: 'Sa Iyong Presensya (Unit Test)',
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

    // Verify primary custom admin gray2187@gmail.com
    const grayAdmin = findUserByEmail(PRIMARY_ADMIN_EMAIL);
    assert.ok(grayAdmin, 'Primary admin gray2187@gmail.com should be seeded');
    assert.equal(grayAdmin.role, 'admin');
    assert.equal(grayAdmin.email, 'gray2187@gmail.com');

    const grayAuthRes = verifyUserLogin(PRIMARY_ADMIN_EMAIL, PRIMARY_ADMIN_PASSWORD);
    assert.ok(grayAuthRes.token.startsWith('wsess_'));
    assert.equal(grayAuthRes.profile.role, 'admin');

    const grayValidated = validateSessionToken(grayAuthRes.token);
    assert.ok(grayValidated);
    assert.equal(grayValidated.id, grayAdmin.id);
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
    assert.equal(retrieved.customSongs[0].title, 'Sa Iyong Presensya (Unit Test)');
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
    assert.equal(submission.song.title, 'Sa Iyong Presensya (Unit Test)');
    assert.equal(submission.submittedBy.userId, leader.id);

    // Verify submission is listed
    const userSubmissions = listSubmissions({ userId: leader.id });
    assert.ok(userSubmissions.some((s) => s.id === submission.id));

    const retrievedSub = getSubmissionById(submission.id);
    assert.ok(retrievedSub);
    assert.equal(retrievedSub.status, 'pending');

    // Verify email notification was dispatched to primary admin gray2187@gmail.com
    const notifs = getAdminNotifications();
    const matchNotif = notifs.find((n) => n.to === PRIMARY_ADMIN_EMAIL && n.subject.includes(SAMPLE_SONG.title));
    assert.ok(matchNotif, 'Email notification should be dispatched to primary admin on song submission');
    assert.equal(matchNotif.to, 'gray2187@gmail.com');

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

  it('8. strictly restricts global song removal to administrators and supports global restoration', () => {
    const leader = findUserByEmail('worshipleader@church.com');
    const admin = findUserByEmail('admin@worshipy.app');
    assert.ok(leader);
    assert.ok(admin);

    const songToCurate: SongRecord = {
      ...SAMPLE_SONG,
      id: 'song_curate_999',
      slug: 'song-curate-999',
      title: 'Tunay Na Diyos (True God)',
    };

    // 1. Leader submits song
    const sub = submitSongForGlobalPublishing({
      userId: leader.id,
      song: songToCurate,
      submissionNotes: 'Ready for Sunday worship catalog.',
    });

    // 2. Admin approves song -> now in global catalog
    reviewSongSubmission({
      submissionId: sub.id,
      adminUserId: admin.id,
      status: 'approved',
    });

    let globalSongs = getApprovedGlobalSongs();
    assert.ok(
      globalSongs.some((s) => s.title === 'Tunay Na Diyos (True God)'),
      'Song should be live in global catalog'
    );

    // 3. Regular non-admin user CANNOT remove song globally (throws 403 / unauthorized)
    assert.throws(() => {
      removeSongGlobally({
        adminUserId: leader.id, // Regular user!
        songIdOrSlug: 'song_curate_999',
        reason: 'Attempted unauthorized removal',
      });
    }, /Unauthorized: Admin privileges required/);

    // 4. Admin successfully removes song globally
    const removeRes = removeSongGlobally({
      adminUserId: admin.id,
      songIdOrSlug: 'song_curate_999',
      reason: 'Inappropriate tempo and unlicensed chord arrangement',
    });

    assert.equal(removeRes.success, true);
    assert.equal(removeRes.removedRecord.id, 'song_curate_999');
    assert.equal(removeRes.removedRecord.removedBy.userId, admin.id);

    // Verify song immediately removed from approved global catalog
    globalSongs = getApprovedGlobalSongs();
    assert.equal(
      globalSongs.some((s) => s.title === 'Tunay Na Diyos (True God)'),
      false,
      'Removed song must no longer be in getApprovedGlobalSongs'
    );

    // Verify tracked in removed songs list
    const removedList = getRemovedGlobalSongs();
    assert.ok(removedList.some((r) => r.id === 'song_curate_999' || r.slug === 'song-curate-999'));

    const removedIds = getRemovedGlobalSongIds();
    assert.ok(removedIds.includes('song_curate_999'));

    // Verify submission status updated to 'removed' with admin reason
    const updatedSub = getSubmissionById(sub.id);
    assert.ok(updatedSub);
    assert.equal(updatedSub.status, 'removed');
    assert.equal(updatedSub.adminNotes, 'Inappropriate tempo and unlicensed chord arrangement');

    // 5. Regular non-admin CANNOT restore song globally
    assert.throws(() => {
      restoreSongGlobally({
        adminUserId: leader.id,
        songIdOrSlug: 'song_curate_999',
      });
    }, /Unauthorized: Admin privileges required/);

    // 6. Admin restores song globally
    const restoreRes = restoreSongGlobally({
      adminUserId: admin.id,
      songIdOrSlug: 'song_curate_999',
    });
    assert.equal(restoreRes.success, true);

    // Verify song is back in getApprovedGlobalSongs
    globalSongs = getApprovedGlobalSongs();
    assert.ok(
      globalSongs.some((s) => s.title === 'Tunay Na Diyos (True God)'),
      'Restored song should be back in getApprovedGlobalSongs'
    );

    // Verify removed from removedGlobalSongs tracking
    const removedIdsAfterRestore = getRemovedGlobalSongIds();
    assert.equal(removedIdsAfterRestore.includes('song_curate_999'), false);
  });
});
