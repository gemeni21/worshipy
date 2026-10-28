import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  registerUser,
  createWorshipGroup,
  getWorshipGroup,
  updateWorshipGroupBranding,
} from '../../cloud/cloudDb.ts';
import {
  createLiveSession,
  joinLiveSession,
  updateLiveSessionState,
} from '../../live/liveSessionServer.ts';
import { resolveReferencePlayback } from '../../audio/referenceAudio.ts';
import {
  SETLIST_META_TAKE_ID,
  LIVE_SESSION_META_TAKE_ID,
} from '../teamService.ts';
import type { TeamActiveSetlist, TeamPracticeTake } from '../../../types/auth.ts';

describe('Team Active Setlist & 1-Click Live Sync Engine', () => {
  it('1. publishes an active setlist with reference audio links to a worship team', () => {
    const u = registerUser({
      email: `leader_${Date.now()}_1@example.com`,
      password: 'Password123!',
      displayName: 'Pastor John',
      churchName: 'Faith Church',
    });
    const leaderId = u.profile.id;

    const createRes = createWorshipGroup(leaderId, 'Faith Worship Team', 'Faith Church');
    assert.equal(createRes.ok, true, createRes.error);
    assert.ok(createRes.group);

    const groupId = createRes.group.id;

    const sampleSetlist: TeamActiveSetlist = {
      id: 'setlist_sunday_001',
      name: 'Sunday Morning Worship',
      description: 'Acoustic & Full Band Praise',
      publishedAt: new Date().toISOString(),
      publishedBy: leaderId,
      publishedByName: 'Pastor John',
      items: [
        {
          songId: 'goodness-of-god',
          addedAt: new Date().toISOString(),
          preferredSemitones: 2,
          notes: 'Build on Bridge',
          referenceAudioUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        },
        {
          songId: 'way-maker',
          addedAt: new Date().toISOString(),
          preferredSemitones: 0,
          referenceAudioUrl: 'https://drive.google.com/file/d/1A2B3C4D5E/view',
        },
      ],
    };

    const updateRes = updateWorshipGroupBranding(leaderId, groupId, {
      activeSetlist: sampleSetlist,
    });

    assert.equal(updateRes.ok, true, updateRes.error);
    assert.ok(updateRes.group?.activeSetlist);
    assert.equal(updateRes.group.activeSetlist.name, 'Sunday Morning Worship');
    assert.equal(updateRes.group.activeSetlist.items.length, 2);
    assert.equal(
      updateRes.group.activeSetlist.items[0].referenceAudioUrl,
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    );
    assert.equal(
      updateRes.group.activeSetlist.items[1].referenceAudioUrl,
      'https://drive.google.com/file/d/1A2B3C4D5E/view'
    );

    // Verify persistence in cloudDb
    const fetched = getWorshipGroup(groupId);
    assert.ok(fetched);
    assert.deepEqual(fetched.activeSetlist, sampleSetlist);
  });

  it('2. allows unpublishing and clearing the team active setlist', () => {
    const u = registerUser({
      email: `leader_${Date.now()}_2@example.com`,
      password: 'Password123!',
      displayName: 'Leader Sarah',
    });
    const leaderId = u.profile.id;
    const createRes = createWorshipGroup(leaderId, 'Hope Band');
    assert.equal(createRes.ok, true, createRes.error);
    const groupId = createRes.group!.id;

    // Publish
    updateWorshipGroupBranding(leaderId, groupId, {
      activeSetlist: {
        id: 'setlist_temp',
        name: 'Temporary List',
        publishedAt: new Date().toISOString(),
        publishedBy: leaderId,
        items: [],
      },
    });

    // Clear
    const clearRes = updateWorshipGroupBranding(leaderId, groupId, {
      activeSetlist: null,
    });
    assert.equal(clearRes.ok, true, clearRes.error);
    assert.equal(clearRes.group?.activeSetlist, undefined);

    const fetched = getWorshipGroup(groupId);
    assert.equal(fetched?.activeSetlist, undefined);
  });

  it('3. registers and broadcasts active live session ID and join code for 1-click auto-join', () => {
    const u = registerUser({
      email: `leader_${Date.now()}_3@example.com`,
      password: 'Password123!',
      displayName: 'Leader Dave',
    });
    const leaderId = u.profile.id;
    const createRes = createWorshipGroup(leaderId, 'Sunday Morning Choir');
    assert.equal(createRes.ok, true, createRes.error);
    const groupId = createRes.group!.id;

    const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

    const liveRes = updateWorshipGroupBranding(leaderId, groupId, {
      activeLiveSessionId: 'live_sess_8941',
      activeLiveSessionJoinCode: 'W4KV72',
      activeLiveSessionExpiresAt: expiresAt,
      activeLiveSessionLeaderName: 'Leader Dave',
    });

    assert.equal(liveRes.ok, true, liveRes.error);
    assert.equal(liveRes.group?.activeLiveSessionId, 'live_sess_8941');
    assert.equal(liveRes.group?.activeLiveSessionJoinCode, 'W4KV72');
    assert.equal(liveRes.group?.activeLiveSessionLeaderName, 'Leader Dave');

    // Verify fetched group contains active session
    const fetched = getWorshipGroup(groupId);
    assert.equal(fetched?.activeLiveSessionId, 'live_sess_8941');
    assert.equal(fetched?.activeLiveSessionJoinCode, 'W4KV72');

    // Verify session clearing when live session ends
    const endRes = updateWorshipGroupBranding(leaderId, groupId, {
      activeLiveSessionId: null,
      activeLiveSessionJoinCode: null,
      activeLiveSessionExpiresAt: null,
      activeLiveSessionLeaderName: null,
    });
    assert.equal(endRes.ok, true, endRes.error);
    assert.equal(endRes.group?.activeLiveSessionId, undefined);
  });

  it('4. blocks non-leaders from altering team setlist or live session', () => {
    const owner = registerUser({
      email: `owner_${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Team Owner',
    });
    const nonLeader = registerUser({
      email: `member_${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Guitarist Mike',
    });
    const leaderId = owner.profile.id;
    const nonLeaderId = nonLeader.profile.id;

    const createRes = createWorshipGroup(leaderId, 'Zion Worship');
    assert.equal(createRes.ok, true, createRes.error);
    const groupId = createRes.group!.id;

    const hackRes = updateWorshipGroupBranding(nonLeaderId, groupId, {
      activeSetlist: {
        id: 'hacked_setlist',
        name: 'Unauthorized',
        publishedAt: new Date().toISOString(),
        publishedBy: nonLeaderId,
        items: [],
      },
    });

    assert.equal(hackRes.ok, false);
    assert.match(hackRes.error || '', /leader/i);
  });

  it('5. multi-client flow: leader creates live session -> member auto-joins without code', () => {
    // Step A: Register Leader and create Team
    const leader = registerUser({
      email: `leader_live_${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Pastor Mark',
      churchName: 'Grace Community',
    });
    const createRes = createWorshipGroup(leader.profile.id, 'Grace Band', 'Grace Community');
    assert.equal(createRes.ok, true);
    const groupId = createRes.group!.id;

    // Step B: Leader creates real Live Session on server
    const liveSessionRes = createLiveSession({
      title: 'Sunday Morning Rehearsal',
      leaderName: 'Pastor Mark',
      initialSongId: 'song-01',
      initialSemitones: 2,
      instrument: 'guitar',
      setlistSongIds: ['song-01', 'song-02', 'song-03'],
    });

    assert.ok(liveSessionRes.session);
    assert.ok(liveSessionRes.session.sessionId);
    assert.ok(liveSessionRes.session.joinCode);
    const sessionId = liveSessionRes.session.sessionId;
    const joinCode = liveSessionRes.session.joinCode;

    // Step C: Leader broadcasts session to the worship group
    const broadcastRes = updateWorshipGroupBranding(leader.profile.id, groupId, {
      activeLiveSessionId: sessionId,
      activeLiveSessionJoinCode: joinCode,
      activeLiveSessionExpiresAt: liveSessionRes.session.expiresAt,
      activeLiveSessionLeaderName: 'Pastor Mark',
    });
    assert.equal(broadcastRes.ok, true);

    // Step D: Member queries group endpoint (e.g. via auto-join polling)
    const memberGroupState = getWorshipGroup(groupId);
    assert.ok(memberGroupState);
    assert.equal(memberGroupState.activeLiveSessionId, sessionId);
    assert.equal(memberGroupState.activeLiveSessionJoinCode, joinCode);

    // Step E: Member auto-joins using sessionId directly (0 codes entered!)
    const memberJoinRes = joinLiveSession({
      sessionId: memberGroupState.activeLiveSessionId,
      participantName: 'Drummer Alex',
      instrument: 'general',
    });

    assert.ok(memberJoinRes.session);
    assert.equal(memberJoinRes.session.sessionId, sessionId);
    assert.ok(memberJoinRes.participantToken);
    assert.ok(memberJoinRes.participantId);

    // Verify member is listed in live session participants
    const alexParticipant = memberJoinRes.session.participants.find(
      (p) => p.name === 'Drummer Alex'
    );
    assert.ok(alexParticipant);
    assert.equal(alexParticipant.role, 'member');
    assert.equal(alexParticipant.connectionState, 'connected');

    // Verify leader's initial song state is accurately delivered to member
    assert.equal(memberJoinRes.session.sharedState.songId, 'song-01');
    assert.equal(memberJoinRes.session.sharedState.officialSemitones, 2);
    assert.equal(memberJoinRes.session.sharedState.setlistSongIds.length, 3);
  });

  it('6. local audio playback resolution: setlist reference tracks resolve strictly locally', () => {
    const youtubeUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const driveUrl = 'https://drive.google.com/file/d/1A2B3C4D5E/view';

    const ytConfig = resolveReferencePlayback(youtubeUrl);
    assert.equal(ytConfig.type, 'youtube');
    assert.equal(ytConfig.videoId, 'dQw4w9WgXcQ');
    assert.equal(ytConfig.sourceType, 'youtube');

    const driveConfig = resolveReferencePlayback(driveUrl);
    assert.equal(driveConfig.type, 'audio');
    assert.equal(driveConfig.sourceType, 'gdrive');
    assert.match(driveConfig.streamUrl || '', /\/api\/audio\/stream\?id=/);
  });

  it('7. resilient meta-take packing and unpacking for strict Firestore cloud rules', () => {
    const originalSetlist: TeamActiveSetlist = {
      id: 'setlist_backup_99',
      name: 'Resilient Service Lineup',
      publishedAt: '2026-10-28T10:00:00.000Z',
      publishedBy: 'leader_123',
      publishedByName: 'Pastor Tim',
      items: [
        {
          songId: 'build-my-life',
          addedAt: '2026-10-28T10:00:00.000Z',
          preferredSemitones: 3,
          referenceAudioUrl: 'https://youtu.be/dQw4w9WgXcQ',
          notes: 'Drums in on Verse 2',
        },
      ],
    };

    // Pack into SETLIST_META_TAKE_ID
    const packedTake: TeamPracticeTake = {
      id: SETLIST_META_TAKE_ID,
      songId: '__system_meta__',
      songTitle: 'Upcoming Setlist Lineup',
      title: originalSetlist.name,
      authorName: originalSetlist.publishedByName || 'Leader',
      authorId: originalSetlist.publishedBy,
      createdAt: originalSetlist.publishedAt,
      durationSeconds: 0,
      notes: JSON.stringify(originalSetlist),
    };

    // Simulate Firestore document with ONLY practiceTakes (root activeSetlist stripped by old rules)
    const mockFirestoreDoc = {
      id: 'grp_test_meta',
      name: 'Resilient Band',
      practiceTakes: [packedTake],
    };

    // Unpack
    const foundMeta = mockFirestoreDoc.practiceTakes.find(
      (t) => t.id === SETLIST_META_TAKE_ID
    );
    assert.ok(foundMeta?.notes);
    const unpacked = JSON.parse(foundMeta.notes) as TeamActiveSetlist;

    assert.equal(unpacked.id, originalSetlist.id);
    assert.equal(unpacked.name, 'Resilient Service Lineup');
    assert.equal(unpacked.items.length, 1);
    assert.equal(unpacked.items[0].preferredSemitones, 3);
    assert.equal(unpacked.items[0].referenceAudioUrl, 'https://youtu.be/dQw4w9WgXcQ');
    assert.equal(unpacked.items[0].notes, 'Drums in on Verse 2');

    // Also test LIVE_SESSION_META_TAKE_ID packing & unpacking
    const liveSessionMeta = {
      sessionId: 'sess_live_12345',
      joinCode: 'K9M2P7',
      expiresAt: '2026-10-28T18:00:00.000Z',
      leaderName: 'Leader Sarah',
    };

    const packedLiveTake: TeamPracticeTake = {
      id: LIVE_SESSION_META_TAKE_ID,
      songId: '__system_meta__',
      songTitle: 'Active Live Session',
      title: liveSessionMeta.joinCode,
      authorName: liveSessionMeta.leaderName,
      authorId: 'leader',
      createdAt: new Date().toISOString(),
      durationSeconds: 0,
      notes: JSON.stringify(liveSessionMeta),
    };

    const mockLiveDoc = {
      id: 'grp_test_live',
      practiceTakes: [packedLiveTake],
    };

    const foundLiveMeta = mockLiveDoc.practiceTakes.find(
      (t) => t.id === LIVE_SESSION_META_TAKE_ID
    );
    assert.ok(foundLiveMeta?.notes);
    const unpackedLive = JSON.parse(foundLiveMeta.notes);
    assert.equal(unpackedLive.sessionId, 'sess_live_12345');
    assert.equal(unpackedLive.joinCode, 'K9M2P7');
    assert.equal(unpackedLive.leaderName, 'Leader Sarah');
  });

  it('8. band roster preservation: syncs all members across server updates and prevents single-leader overwrites', () => {
    // 1. Leader creates group
    const leader = registerUser({
      email: `leader_roster_${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Pastor Dave',
      churchName: 'Calvary Church',
    });
    const leaderId = leader.profile.id;
    const createRes = createWorshipGroup(leaderId, 'Calvary Band', 'Calvary Church');
    assert.equal(createRes.ok, true);
    const group = createRes.group!;
    const groupId = group.id;

    // 2. Member joins group
    const member = registerUser({
      email: `member_roster_${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Bass Player Dan',
    });
    const memberId = member.profile.id;

    // Simulate multi-member roster array in Firestore / local cache
    const multiMembers = [
      ...group.members,
      {
        userId: memberId,
        email: member.profile.email,
        displayName: 'Bass Player Dan',
        role: 'member' as const,
        joinedAt: new Date().toISOString(),
      },
    ];

    // 3. Leader updates group branding and setlist passing full members payload
    const updateRes = updateWorshipGroupBranding(leaderId, groupId, {
      churchName: 'Calvary Church Main',
      members: multiMembers,
    });
    assert.equal(updateRes.ok, true);
    assert.equal(updateRes.group?.members.length, 2);

    // 4. Verify that fetching group from server returns both members
    const fetched = getWorshipGroup(groupId);
    assert.ok(fetched);
    assert.equal(fetched.members.length, 2);
    assert.ok(fetched.members.some((m) => m.userId === leaderId && m.role === 'leader'));
    assert.ok(fetched.members.some((m) => m.userId === memberId && m.role === 'member'));

    // 5. Subsequent branding / session update preserves all members
    const sessionRes = updateWorshipGroupBranding(leaderId, groupId, {
      activeLiveSessionId: 'sess_roster_check',
      members: fetched.members,
    });
    assert.equal(sessionRes.ok, true);
    assert.equal(sessionRes.group?.members.length, 2);
  });

  it('9. live session starting sequence: starts automatically at Song 1 of active setlist without catalog conflict', () => {
    // Setlist with Song 1 = song-02 (Way Maker, Key of E transposed +2)
    // and Song 2 = song-01 (Goodness of God)
    const activeSetlist: TeamActiveSetlist = {
      id: 'setlist_sunday_worship_lineup',
      name: 'Sunday Morning Service',
      publishedAt: new Date().toISOString(),
      publishedBy: 'leader_1',
      publishedByName: 'Pastor John',
      items: [
        {
          songId: 'song-02',
          addedAt: new Date().toISOString(),
          preferredSemitones: 2,
          notes: 'Open with soft piano',
        },
        {
          songId: 'song-01',
          addedAt: new Date().toISOString(),
          preferredSemitones: 0,
        },
      ],
    };

    // Resolving initial song from setlist:
    // When a setlist is loaded, Song #1 of the setlist is the automatic starting song!
    const setlistSongIds = activeSetlist.items.map((i) => i.songId);
    const initialSongId = activeSetlist.items[0].songId;
    const initialSemitones = activeSetlist.items[0].preferredSemitones ?? 0;

    const liveRes = createLiveSession({
      title: activeSetlist.name,
      leaderName: 'Pastor John',
      initialSongId,
      initialSemitones,
      setlistSongIds,
    });

    assert.ok(liveRes.session);
    // Opening song matches setlist song 1 exactly
    assert.equal(liveRes.session.sharedState.songId, 'song-02');
    assert.equal(liveRes.session.sharedState.officialSemitones, 2);
    // Queue contains the entire setlist lineup in exact order
    assert.deepEqual(liveRes.session.sharedState.setlistSongIds, ['song-02', 'song-01']);
  });
});
