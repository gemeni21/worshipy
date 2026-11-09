import os from 'node:os';
import path from 'node:path';
const testDataDir = path.join(os.tmpdir(), `worshipy-test-global-song-${process.pid}-${Date.now()}`);
process.env.WORSHIPY_USER_DATA = testDataDir;
process.env.WORSHIPY_TEST_PERSIST_PATH = path.join(testDataDir, 'cloud-store.json');

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  registerUser,
  findUserById,
  findUserByEmail,
  submitSongForGlobalPublishing,
  listSubmissions,
  getSubmissionById,
  reviewSongSubmission,
  getApprovedGlobalSongs,
  removeSongGlobally,
  restoreSongGlobally,
  validateSessionToken,
  PRIMARY_ADMIN_EMAIL,
  getAdminNotifications,
  ensureDataStore,
} from '../../cloud/cloudDb.ts';

import {
  buildCustomSongRecord,
  createCustomSongId,
  createCustomSongSlug,
} from '../../chordpro/chordPro.ts';

import { validateSongRecord } from '../../validation/songValidator.ts';
import { mergeCatalogAndCustomSongs, getSongBySlug } from '../../catalog/songCatalog.ts';
import type { SongRecord } from '../../../types/song.ts';

describe('Creating song and requesting it to push globally', () => {
  const leaderData = {
    email: `leader_${Date.now()}@bethel.church`,
    password: 'Password123!',
    displayName: 'Worship Leader Sarah',
    churchName: 'Bethel Christian Fellowship',
  };

  const adminEmail = 'admin@worshipy.app';

  it('1. builds custom song and validates structure', () => {
    const customSong = buildCustomSongRecord({
      title: 'Tapat Kailanman',
      artist: 'Musikatha',
      originalKey: 'D',
      languageCode: 'fil',
      categoryId: 'filipino-worship',
      rightsAcknowledged: true,
      sections: [
        {
          id: 'sec-1',
          type: 'verse',
          label: 'Verse 1',
          lines: [
            {
              id: 'line-1-1',
              isInstrumental: false,
              segments: [
                { chord: 'D', text: 'Panginoon ' },
                { chord: 'G', text: 'Ikaw ang tanging ' },
                { chord: 'A', text: 'pag-asa' },
              ],
            },
          ],
        },
      ],
    });

    assert.ok(customSong.id.startsWith('custom-song-'));
    assert.ok(customSong.slug.startsWith('tapat-kailanman'));
    assert.equal(customSong.sourceType, 'custom');
    
    const validation = validateSongRecord(customSong);
    assert.equal(validation.valid, true, `Validation errors: ${validation.errors.join(', ')}`);
  });

  it('2. leader submits custom song for global publishing and receives pending status', () => {
    const reg = registerUser(leaderData);
    assert.ok(reg.profile.id);

    const customSong = buildCustomSongRecord({
      title: 'Diyos ng Himala',
      artist: 'Victory Worship',
      originalKey: 'G',
      rightsAcknowledged: true,
      sections: [
        {
          id: 'sec-1',
          type: 'verse',
          label: 'Verse 1',
          lines: [
            {
              id: 'line-1',
              isInstrumental: false,
              segments: [
                { chord: 'G', text: 'Buhay ay ' },
                { chord: 'C', text: 'Iyong binago' },
              ],
            },
          ],
        },
      ],
    });

    const sub = submitSongForGlobalPublishing({
      userId: reg.profile.id,
      song: customSong,
      submissionNotes: 'Transcribed from original live acoustic version',
    });

    assert.ok(sub.id.startsWith('sub_'));
    assert.equal(sub.status, 'pending');
    assert.equal(sub.song.title, 'Diyos ng Himala');
    assert.equal(sub.submittedBy.userId, reg.profile.id);
    assert.equal(sub.submittedBy.displayName, 'Worship Leader Sarah');
    assert.equal(sub.submittedBy.churchName, 'Bethel Christian Fellowship');
    assert.equal(sub.submissionNotes, 'Transcribed from original live acoustic version');

    // Submitter can list their own submissions
    const leaderSubs = listSubmissions({ userId: reg.profile.id });
    assert.equal(leaderSubs.length, 1);
    assert.equal(leaderSubs[0].id, sub.id);

    // Admin email notification dispatched
    const notifs = getAdminNotifications();
    assert.ok(notifs.some(n => n.subject.includes('Diyos ng Himala')));
  });

  it('3. admin approves custom song and it publishes to global catalog', () => {
    let admin = findUserByEmail('admin@worshipy.app');
    if (!admin) {
      const reg = registerUser({
        email: `admin_${Date.now()}@worshipy.app`,
        password: 'AdminPassword123!',
        displayName: 'Global Curator',
        role: 'admin',
      });
      admin = reg.profile;
    }

    const leader = registerUser({
      email: `curation_leader_${Date.now()}@church.org`,
      password: 'Password123!',
      displayName: 'Pastor Dave',
      churchName: 'Grace Community',
    });

    const song = buildCustomSongRecord({
      title: 'Hesus Sa Aking Buhay',
      artist: 'Musikatha',
      originalKey: 'G',
      rightsAcknowledged: true,
      sections: [
        {
          id: 'sec-1',
          type: 'verse',
          label: 'Verse 1',
          lines: [
            {
              id: 'l-1',
              segments: [{ chord: 'G', text: 'Sadyang kay buti ng ating Panginoon' }],
            },
          ],
        },
      ],
    });

    const sub = submitSongForGlobalPublishing({
      userId: leader.profile.id,
      song,
      submissionNotes: 'Official church arrangement',
    });

    // Admin reviews and approves
    const reviewed = reviewSongSubmission({
      submissionId: sub.id,
      adminUserId: admin.id,
      status: 'approved',
      adminNotes: 'Accurate chords and reverent formatting. Approved for global use.',
    });

    assert.equal(reviewed.status, 'approved');
    assert.equal(reviewed.adminNotes, 'Accurate chords and reverent formatting. Approved for global use.');

    // Song is now in approvedGlobalSongs
    const globals = getApprovedGlobalSongs();
    const published = globals.find(g => g.title === 'Hesus Sa Aking Buhay');
    assert.ok(published, 'Hesus Sa Aking Buhay must be published in global catalog');
    assert.equal(published.sourceType, 'catalog');
    assert.ok(published.attribution?.includes('Pastor Dave'));
    assert.ok(published.attribution?.includes('Grace Community'));
  });

  it('4. admin requests revision, leader modifies song, and resubmits cleanly', () => {
    const admin = registerUser({
      email: `admin_${Date.now()}@worshipy.app`,
      password: 'Password123!',
      displayName: 'Admin Reviewer',
      role: 'admin',
    });

    const leader = registerUser({
      email: `revision_leader_${Date.now()}@church.org`,
      password: 'Password123!',
      displayName: 'Minister Mark',
    });

    const initialSong = buildCustomSongRecord({
      title: 'Walang Hanggang Sasambahin',
      originalKey: 'E',
      rightsAcknowledged: true,
      sections: [
        {
          id: 'sec-1',
          type: 'verse',
          label: 'Verse 1',
          lines: [{ id: 'l1', segments: [{ chord: 'E', text: 'Aawit sa Yo' }] }],
        },
      ],
    });

    // 1. Initial submission
    const sub1 = submitSongForGlobalPublishing({
      userId: leader.profile.id,
      song: initialSong,
    });
    assert.equal(sub1.status, 'pending');

    // 2. Admin rejects with revision request note
    const reviewed1 = reviewSongSubmission({
      submissionId: sub1.id,
      adminUserId: admin.profile.id,
      status: 'rejected',
      adminNotes: 'Please add the Chorus section before global release.',
    });
    assert.equal(reviewed1.status, 'rejected');

    // 3. Leader edits song (adds Chorus) using existing song id
    const revisedSong = buildCustomSongRecord({
      existingSong: initialSong,
      title: 'Walang Hanggang Sasambahin',
      originalKey: 'E',
      rightsAcknowledged: true,
      sections: [
        ...initialSong.sections,
        {
          id: 'sec-chorus',
          type: 'chorus',
          label: 'Chorus',
          lines: [{ id: 'c1', segments: [{ chord: 'A', text: 'Sasambahin magpakailanman' }] }],
        },
      ],
    });
    assert.equal(revisedSong.id, initialSong.id, 'Song ID should remain stable on edit');
    assert.equal(revisedSong.sections.length, 2);

    // 4. Leader resubmits
    const sub2 = submitSongForGlobalPublishing({
      userId: leader.profile.id,
      song: revisedSong,
      submissionNotes: 'Added Chorus as requested.',
    });
    assert.equal(sub2.status, 'pending');

    // 5. Admin approves resubmission
    const reviewed2 = reviewSongSubmission({
      submissionId: sub2.id,
      adminUserId: admin.profile.id,
      status: 'approved',
      adminNotes: 'Looks great now. Approved!',
    });
    assert.equal(reviewed2.status, 'approved');

    // Published global song now has both sections
    const globals = getApprovedGlobalSongs();
    const published = globals.find(g => g.id === `global_${revisedSong.id}`);
    assert.ok(published);
    assert.equal(published.sections.length, 2);
  });

  it('5. leader submits arrangement of an existing catalog song to push globally', () => {
    const admin = findUserById('user_admin_gray') || findUserById('user_admin_001')!;
    assert.ok(admin, 'Admin must exist in store');

    const leader = registerUser({
      email: `leader_arrange_${Date.now()}@church.org`,
      password: 'Password123!',
      displayName: 'Arranger Leo',
      churchName: 'Faith Church',
    });

    // Base catalog song
    const baseCatalog = getSongBySlug('way-maker');
    assert.ok(baseCatalog, 'Catalog song way-maker must exist');

    // Leader modified arrangement (e.g. customized acoustic chords)
    const modifiedSong: SongRecord = {
      ...baseCatalog,
      title: `${baseCatalog.title} (Acoustic Rehearsal Arrangement)`,
      slug: `${baseCatalog.slug}-acoustic-rehearsal`,
      updatedAt: new Date().toISOString(),
    };

    const sub = submitSongForGlobalPublishing({
      userId: leader.profile.id,
      song: modifiedSong,
      submissionNotes: 'Global Publish Permission Request from Leader (Faith Church)',
    });

    assert.equal(sub.status, 'pending');

    // Admin approves
    const approved = reviewSongSubmission({
      submissionId: sub.id,
      adminUserId: admin.id,
      status: 'approved',
    });
    assert.equal(approved.status, 'approved');

    // Check that it is accessible in the global approved catalog
    const globals = getApprovedGlobalSongs();
    const found = globals.find(g => g.title.includes('Acoustic Rehearsal Arrangement'));
    assert.ok(found, 'Arranged catalog song should be approved and present in global catalog');
  });

  it('6. handles duplicate rapid submissions without crashing', () => {
    const leader = registerUser({
      email: `rapid_leader_${Date.now()}@church.org`,
      password: 'Password123!',
      displayName: 'Rapid Leader',
    });

    const song = buildCustomSongRecord({
      title: 'Tanging Pag-asa',
      originalKey: 'A',
      rightsAcknowledged: true,
      sections: [
        {
          id: 's1',
          type: 'verse',
          label: 'Verse',
          lines: [{ id: 'l1', segments: [{ chord: 'A', text: 'Tanging Pag-asa' }] }],
        },
      ],
    });

    // Rapid double submission (e.g. double click)
    const sub1 = submitSongForGlobalPublishing({ userId: leader.profile.id, song });
    const sub2 = submitSongForGlobalPublishing({ userId: leader.profile.id, song });

    assert.ok(sub1.id);
    assert.ok(sub2.id);
    assert.equal(sub1.id, sub2.id, 'Rapid duplicate submissions cleanly update existing pending submission');

    const subs = listSubmissions({ userId: leader.profile.id });
    assert.ok(subs.length >= 1);
  });

  it('7. tests slug collision when an arrangement of an existing catalog song is approved', () => {
    // When a leader arranges a catalog song (e.g. way-maker), the slug is 'way-maker'.
    // If the admin approves it, publishedSong has id 'global_way-maker' and slug 'way-maker'.
    const baseCatalog = getSongBySlug('way-maker')!;
    const admin = findUserById('user_admin_gray') || findUserById('user_admin_001')!;
    assert.ok(admin, 'Admin must exist in store');
    const leader = registerUser({
      email: `leader_slug_${Date.now()}@church.org`,
      password: 'Password123!',
      displayName: 'Leader Slug',
    });

    // Submitting arrangement preserving the original slug
    const arrangementSong: SongRecord = {
      ...baseCatalog,
      updatedAt: new Date().toISOString(),
    };

    const sub = submitSongForGlobalPublishing({
      userId: leader.profile.id,
      song: arrangementSong,
      submissionNotes: 'Leader arrangement with church chords',
    });

    const approved = reviewSongSubmission({
      submissionId: sub.id,
      adminUserId: admin.id,
      status: 'approved',
    });

    assert.equal(approved.status, 'approved');
    assert.equal(approved.song.slug, 'way-maker');

    // Now simulate AppContext.tsx logic:
    // const combinedCatalog = [...catalogSongs];
    // for (const gSong of globalApprovedSongs) {
    //   if (!combinedCatalog.some((c) => c.id === gSong.id || c.slug === gSong.slug)) {
    //     combinedCatalog.push(gSong);
    //   }
    // }
    const globals = getApprovedGlobalSongs();
    const gSong = globals.find(g => g.id === `global_${arrangementSong.id}`)!;
    assert.ok(gSong, 'Global song should exist in approvedGlobalSongs');

    const combinedCatalog = [baseCatalog];
    const willBeAdded = !combinedCatalog.some((c) => c.id === gSong.id || c.slug === gSong.slug);
    
    // Inconsistency demonstrated: willBeAdded is FALSE because c.slug === gSong.slug ('way-maker')!
    // The approved global arrangement is dropped and never reaches the user!
    assert.equal(willBeAdded, false, 'Demonstrates inconsistency: approved global arrangement is dropped due to slug collision');
  });

  it('8. tests duplication when a custom song is approved globally and merged with local customSongs', () => {
    // When a user creates a custom song and it is approved globally,
    // the user still has the local copy in customSongs.
    const customSong = buildCustomSongRecord({
      title: 'Bayan ng Diyos',
      originalKey: 'G',
      rightsAcknowledged: true,
      sections: [
        {
          id: 's1',
          type: 'verse',
          label: 'Verse',
          lines: [{ id: 'l1', segments: [{ chord: 'G', text: 'Tayo ay bayan ng Diyos' }] }],
        },
      ],
    });

    const publishedGlobalSong: SongRecord = {
      ...customSong,
      id: `global_${customSong.id}`,
      slug: customSong.slug,
      sourceType: 'catalog',
    };

    // Client merges catalog (which now has publishedGlobalSong) and user's local customSongs
    const merged = mergeCatalogAndCustomSongs([customSong], [publishedGlobalSong]);

    // Local custom song is cleanly deduplicated against the approved global copy
    assert.equal(merged.length, 1, 'Local custom song is cleanly deduplicated against approved global copy');
    assert.equal(merged[0].id, publishedGlobalSong.id);
  });

  it('9. tests resubmission status lookup in my-songs', () => {
    // When a user submits, is rejected, and resubmits, listSubmissions returns both.
    const leader = registerUser({
      email: `resub_leader_${Date.now()}@church.org`,
      password: 'Password123!',
      displayName: 'Resub Leader',
    });
    const admin = registerUser({
      email: `resub_admin_${Date.now()}@worshipy.app`,
      password: 'Password123!',
      displayName: 'Resub Admin',
      role: 'admin',
    });

    const song = buildCustomSongRecord({
      title: 'Pag-ibig Mo',
      originalKey: 'D',
      rightsAcknowledged: true,
      sections: [{ id: 's1', type: 'verse', label: 'Verse', lines: [{ id: 'l1', segments: [{ chord: 'D', text: 'Pag-ibig Mo' }] }] }],
    });

    const sub1 = submitSongForGlobalPublishing({ userId: leader.profile.id, song });
    reviewSongSubmission({ submissionId: sub1.id, adminUserId: admin.profile.id, status: 'rejected', adminNotes: 'Add tempo' });

    // User resubmits
    const sub2 = submitSongForGlobalPublishing({ userId: leader.profile.id, song });

    const leaderSubmissions = listSubmissions({ userId: leader.profile.id });
    // In-place update prevents duplicate submissions for the same song
    assert.equal(leaderSubmissions.length, 1);
    assert.equal(sub2.id, sub1.id);

    // In my-songs/page.tsx:
    // const existingSubmission = submissions.find(
    //   (sub) => sub.songId === song.id || sub.song?.id === song.id || sub.song?.slug === song.slug
    // );
    const found = leaderSubmissions.find(
      (sub) => sub.songId === song.id || sub.song?.id === song.id || sub.song?.slug === song.slug
    );

    assert.equal(found?.id, sub2.id);
    assert.equal(found?.status, 'pending');
    assert.equal(getSubmissionById(sub1.id)?.status, 'pending');
  });

  it('10. tests submission with empty sections or invalid metadata', () => {
    const leader = registerUser({
      email: `malformed_leader_${Date.now()}@church.org`,
      password: 'Password123!',
      displayName: 'Malformed Leader',
    });

    // Malformed song: no sections at all
    const malformedSong = {
      id: 'custom-malformed-1',
      title: 'Empty Song',
      slug: 'empty-song',
      originalKey: 'C',
      sourceType: 'custom' as const,
      sections: [] as any[],
    } as SongRecord;

    // submitSongForGlobalPublishing accepts it because it does not run validateSongRecord
    const sub = submitSongForGlobalPublishing({
      userId: leader.profile.id,
      song: malformedSong,
    });

    assert.ok(sub.id);
    assert.equal(sub.song.sections.length, 0);

    // validateSongRecord catches it
    const validation = validateSongRecord(malformedSong);
    assert.equal(validation.valid, false);
    assert.ok(validation.errors.some(e => e.includes('sections')));
  });

  it('11. allows admin to delete a song globally from song lists and marks it as removed', () => {
    const admin = registerUser({
      email: `admin_delete_tester_${Date.now()}@worshipy.app`,
      password: 'Password123!',
      displayName: 'Admin Tester',
      role: 'admin',
    });

    const user = registerUser({
      email: `song_creator_${Date.now()}@church.org`,
      password: 'Password123!',
      displayName: 'Song Creator',
    });

    const song = buildCustomSongRecord({
      title: 'Tanging Sandigan',
      originalKey: 'G',
      rightsAcknowledged: true,
      sections: [
        {
          id: 'v1',
          type: 'verse',
          label: 'Verse',
          lines: [{ id: 'l1', segments: [{ chord: 'G', text: 'Tanging Sandigan' }] }],
        },
      ],
    });

    // 1. User submits song and admin approves
    const sub = submitSongForGlobalPublishing({ userId: user.profile.id, song });
    reviewSongSubmission({
      submissionId: sub.id,
      adminUserId: admin.profile.id,
      status: 'approved',
    });

    assert.ok(getApprovedGlobalSongs().some(s => s.title === 'Tanging Sandigan'));

    // 2. Admin deletes song from song list
    const removeRes = removeSongGlobally({
      adminUserId: admin.profile.id,
      songIdOrSlug: song.id,
      reason: 'Copyright notice or duplicate entry',
    });

    assert.equal(removeRes.success, true);
    assert.equal(removeRes.removedRecord.title, 'Tanging Sandigan');

    // 3. Song is no longer in approved global catalog
    assert.ok(!getApprovedGlobalSongs().some(s => s.id === song.id || s.title === 'Tanging Sandigan'));

    // 4. Submission status is now 'removed'
    const updatedSub = getSubmissionById(sub.id);
    assert.equal(updatedSub?.status, 'removed');
    assert.equal(updatedSub?.adminNotes, 'Copyright notice or duplicate entry');
  });

  it('12. prevents non-admin users from deleting a song globally', () => {
    const regularUser = registerUser({
      email: `regular_user_${Date.now()}@church.org`,
      password: 'Password123!',
      displayName: 'Regular User',
    });

    assert.throws(() => {
      removeSongGlobally({
        adminUserId: regularUser.profile.id,
        songIdOrSlug: 'some-song-id',
      });
    }, /Unauthorized: Admin privileges required/);
  });

  it('13. declining a duplicate submission does NOT remove the approved song from global catalog', () => {
    let admin = findUserByEmail('admin@worshipy.app') || findUserByEmail(PRIMARY_ADMIN_EMAIL);
    if (!admin) {
      const reg = registerUser({
        email: `admin_${Date.now()}@worshipy.app`,
        password: 'AdminPassword123!',
        displayName: 'Global Curator',
      });
      admin = findUserById(reg.profile.id);
    }
    assert.ok(admin);

    const leader = registerUser({
      email: `duplicate_tester_${Date.now()}@church.org`,
      password: 'Password123!',
      displayName: 'Duplicate Tester',
    });

    const song = buildCustomSongRecord({
      title: 'Tanging Ikaw Lamang',
      artist: 'Worship Team',
      originalKey: 'G',
      languageCode: 'fil',
      categoryId: 'filipino-worship',
      rightsAcknowledged: true,
      sections: [{ id: 's1', type: 'verse', label: 'Verse', lines: [{ id: 'l1', segments: [{ chord: 'G', text: 'Tanging Ikaw' }] }] }],
    });

    // Simulate legacy duplicate submissions directly in store
    const store = ensureDataStore();
    store.submissions['sub_test_dup_1'] = {
      id: 'sub_test_dup_1',
      songId: song.id,
      song,
      submittedBy: { userId: leader.profile.id, email: leader.profile.email, displayName: leader.profile.displayName },
      status: 'pending',
      submittedAt: new Date().toISOString(),
    };
    store.submissions['sub_test_dup_2'] = {
      id: 'sub_test_dup_2',
      songId: song.id,
      song,
      submittedBy: { userId: leader.profile.id, email: leader.profile.email, displayName: leader.profile.displayName },
      status: 'pending',
      submittedAt: new Date().toISOString(),
    };

    // Admin approves sub1
    reviewSongSubmission({
      submissionId: 'sub_test_dup_1',
      adminUserId: admin.id,
      status: 'approved',
    });

    // Song is now approved globally
    assert.ok(getApprovedGlobalSongs().some(s => s.title === 'Tanging Ikaw Lamang'));

    // Admin declines sub2 (the duplicate request)
    reviewSongSubmission({
      submissionId: 'sub_test_dup_2',
      adminUserId: admin.id,
      status: 'rejected',
      adminNotes: 'Duplicate submission declined',
    });

    // CRITICAL: The approved song MUST STILL be in global catalog because sub1 is approved!
    assert.ok(
      getApprovedGlobalSongs().some(s => s.title === 'Tanging Ikaw Lamang'),
      'Approved song must not be removed when declining a duplicate submission'
    );
  });

  it('14. verifies gemeni21@gmail.com is strictly a leader, never an admin, and cannot approve songs', () => {
    let gemeni = findUserByEmail('gemeni21@gmail.com');
    if (!gemeni) {
      const reg = registerUser({
        email: 'gemeni21@gmail.com',
        password: 'Password123!',
        displayName: 'Gemeni Leader',
      });
      gemeni = reg.profile;
    }

    assert.equal(gemeni.role, 'user');
    assert.notEqual(gemeni.role, 'admin');

    const song = buildCustomSongRecord({
      title: 'Harap ng Trono Mo',
      artist: 'Church',
      originalKey: 'C',
      languageCode: 'fil',
      categoryId: 'filipino-worship',
      rightsAcknowledged: true,
      sections: [{ id: 's1', type: 'verse', label: 'Verse', lines: [{ id: 'l1', segments: [{ chord: 'C', text: 'Banal Ka' }] }] }],
    });

    const sub = submitSongForGlobalPublishing({ userId: gemeni.id, song });

    // gemeni21 cannot approve song submissions
    assert.throws(() => {
      reviewSongSubmission({
        submissionId: sub.id,
        adminUserId: gemeni.id,
        status: 'approved',
      });
    }, /Unauthorized: Admin privileges required to review submissions/);
  });

  it('15. verifies mark3d21@gmail.com is strictly a leader/user, never an admin, and cannot approve songs', () => {
    let mark = findUserByEmail('mark3d21@gmail.com');
    if (!mark) {
      const reg = registerUser({
        email: 'mark3d21@gmail.com',
        password: 'Password123!',
        displayName: 'Mark Leader',
      });
      mark = reg.profile;
    }

    assert.equal(mark.role, 'user');
    assert.notEqual(mark.role, 'admin');

    const song = buildCustomSongRecord({
      title: 'Dakilang Katapatan',
      artist: 'Church',
      originalKey: 'D',
      languageCode: 'fil',
      categoryId: 'filipino-worship',
      rightsAcknowledged: true,
      sections: [{ id: 's1', type: 'verse', label: 'Verse', lines: [{ id: 'l1', segments: [{ chord: 'D', text: 'Salamat Panginoon' }] }] }],
    });

    const sub = submitSongForGlobalPublishing({ userId: mark.id, song });

    // mark3d21 cannot approve song submissions
    assert.throws(() => {
      reviewSongSubmission({
        submissionId: sub.id,
        adminUserId: mark.id,
        status: 'approved',
      });
    }, /Unauthorized: Admin privileges required to review submissions/);
  });
});
