import os from 'node:os';
import path from 'node:path';
process.env.WORSHIPY_TEST_PERSIST_PATH = path.join(os.tmpdir(), `worshipy-test-team-${process.pid}-${Date.now()}.json`);

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  registerUser,
  createWorshipGroup,
  getWorshipGroup,
  updateWorshipGroupBranding,
  suggestSetlistForGroup,
  reviewSetlistSuggestion,
  deleteSetlistSuggestion,
  joinWorshipGroupByCode,
} from '../../cloud/cloudDb.ts';
import {
  createLiveSession,
  joinLiveSession,
  updateLiveSessionState,
  clearAllLiveSessionsForTest,
  endLiveSession,
  getLiveSessionSnapshot,
  findActiveSessionByGroupId,
  getActiveSessionInfo,
} from '../../live/liveSessionServer.ts';
import { resolveReferencePlayback } from '../../audio/referenceAudio.ts';
import {
  SETLIST_META_TAKE_ID,
  LIVE_SESSION_META_TAKE_ID,
  sanitizeActiveSetlistForFirestore,
  mergeSuggestedSetlists,
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
    assert.ok(!clearRes.group?.activeSetlist);

    const fetched = getWorshipGroup(groupId);
    assert.ok(!fetched?.activeSetlist);
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

  it('10. auto-join resilience: reloads session from disk on memory cache miss and joins seamlessly', () => {
    // 1. Leader creates a live session which gets written to disk
    const liveRes = createLiveSession({
      title: 'Sunday Live Worship',
      leaderName: 'Mark Edison Talingting',
      initialSongId: 'song-01',
    });
    assert.ok(liveRes.session);
    const sessionId = liveRes.session.sessionId;
    const joinCode = liveRes.session.joinCode;

    // 2. Simulate worker restart or multi-process worker isolation where memory cache is cleared
    clearAllLiveSessionsForTest();

    // 3. Member auto-joins by sessionId (0-code band member flow)
    const memberJoin = joinLiveSession({
      sessionId,
      participantName: 'Guitarist Alex',
      instrument: 'guitar',
    });

    assert.ok(memberJoin.session);
    assert.equal(memberJoin.session.sessionId, sessionId);
    assert.ok(memberJoin.participantId);
    assert.ok(memberJoin.participantToken);

    // Verify participant is registered in session
    const alex = memberJoin.session.participants.find((p) => p.name === 'Guitarist Alex');
    assert.ok(alex);
    assert.equal(alex.instrument, 'guitar');

    // 4. Test another worker cache miss joining by joinCode
    clearAllLiveSessionsForTest();
    const guestJoin = joinLiveSession({
      joinCode,
      participantName: 'Bassist Ben',
      instrument: 'bass',
    });
    assert.ok(guestJoin.session);
    assert.equal(guestJoin.session.sessionId, sessionId);
    const ben = guestJoin.session.participants.find((p) => p.name === 'Bassist Ben');
    assert.ok(ben);
    assert.equal(ben.instrument, 'bass');
  });

  it('11. leader live sync reclaim: leader retains primary leadership without duplication when returning from other pages', () => {
    // 1. Leader starts a session
    const createRes = createLiveSession({
      title: 'Sunday Service',
      leaderName: 'Pastor John',
      initialSongId: 'goodness-of-god',
      initialSemitones: 0,
    });
    assert.ok(createRes.session);
    const sessionId = createRes.session.sessionId;
    const originalLeaderId = createRes.participantId;
    assert.equal(createRes.session.leaderId, originalLeaderId);

    // 2. A band member joins
    const memberJoin = joinLiveSession({
      sessionId,
      participantName: 'Drummer Dave',
      instrument: 'general',
    });
    assert.equal(memberJoin.session.participants.length, 2);

    // 3. Leader navigates to Home then returns to /live. Re-joins session with leader reclaim
    const leaderReclaim = joinLiveSession({
      sessionId,
      participantName: 'Pastor John',
      isLeader: true,
    });

    // Verify leader reclaimed their original leader participantId rather than creating a duplicate member
    assert.equal(leaderReclaim.participantId, originalLeaderId);
    assert.equal(leaderReclaim.session.leaderId, originalLeaderId);
    // Participant count must still be 2 (Pastor John + Drummer Dave), NOT 3
    assert.equal(leaderReclaim.session.participants.length, 2);

    const leaderRecord = leaderReclaim.session.participants.find((p) => p.id === originalLeaderId);
    assert.ok(leaderRecord);
    assert.equal(leaderRecord.role, 'leader');
    assert.equal(leaderRecord.connectionState, 'connected');

    // 4. Verify leader can authoritatively update musical state after reclaiming
    const updated = updateLiveSessionState(sessionId, leaderReclaim.participantToken, {
      songId: 'way-maker',
      officialSemitones: 2,
    });
    // 'way-maker' slug maps to canonical ID 'song-02'
    assert.equal(updated.sharedState.songId, 'song-02');
    assert.equal(updated.sharedState.officialSemitones, 2);
  });

  it('12. active setlist preservation: setlist persists across live sync start/stop and is only removed by manual clear', async () => {
    const leader = registerUser({
      email: `leader_${Date.now()}_setlist@example.com`,
      password: 'Password123!',
      displayName: 'Leader David',
    });
    const groupRes = createWorshipGroup(leader.profile.id, 'Praise Team', 'Grace Church');
    assert.ok(groupRes.group);
    const groupId = groupRes.group.id;

    // 1. Publish active setlist
    const setlistPayload: TeamActiveSetlist = {
      id: 'setlist_sunday_praise',
      name: 'Sunday Morning Lineup',
      publishedAt: new Date().toISOString(),
      publishedBy: leader.profile.id,
      publishedByName: 'Leader David',
      items: [
        { songId: 'goodness-of-god', addedAt: new Date().toISOString() },
        { songId: 'way-maker', addedAt: new Date().toISOString() },
      ],
    };

    const update1 = updateWorshipGroupBranding(leader.profile.id, groupId, {
      activeSetlist: setlistPayload,
    });
    assert.ok(update1.ok);
    assert.ok(update1.group?.activeSetlist);
    assert.equal(update1.group.activeSetlist.name, 'Sunday Morning Lineup');

    // 2. Leader starts live sync — setlist MUST NOT be removed or flickered away
    const liveUpdate = updateWorshipGroupBranding(leader.profile.id, groupId, {
      activeLiveSessionId: 'live_sess_123',
      activeLiveSessionJoinCode: '7K9M2P',
      activeLiveSessionExpiresAt: new Date(Date.now() + 3600000).toISOString(),
      activeLiveSessionLeaderName: 'Leader David',
      // Notice activeSetlist is preserved
      activeSetlist: setlistPayload,
    });
    assert.ok(liveUpdate.ok);
    assert.ok(liveUpdate.group?.activeSetlist);
    assert.equal(liveUpdate.group.activeSetlist.name, 'Sunday Morning Lineup');
    assert.equal(liveUpdate.group.activeLiveSessionId, 'live_sess_123');

    // 3. Leader stops live sync — setlist MUST STILL persist
    const stopLiveUpdate = updateWorshipGroupBranding(leader.profile.id, groupId, {
      activeLiveSessionId: null,
      activeLiveSessionJoinCode: null,
      activeLiveSessionExpiresAt: null,
      activeLiveSessionLeaderName: null,
      activeSetlist: setlistPayload,
    });
    assert.ok(stopLiveUpdate.ok);
    assert.ok(stopLiveUpdate.group?.activeSetlist);
    assert.equal(stopLiveUpdate.group.activeSetlist.name, 'Sunday Morning Lineup');
    assert.equal(stopLiveUpdate.group.activeLiveSessionId, undefined);

    // 4. Leader manually clears the lineup — ONLY NOW is it removed
    const manualClear = updateWorshipGroupBranding(leader.profile.id, groupId, {
      activeSetlist: null,
    });
    assert.ok(manualClear.ok);
    assert.ok(!manualClear.group?.activeSetlist);
  });

  it('13. leader ending live session from another page terminates live stage and clears group session ID', async () => {
    // 1. Create leader and active live session
    const leaderLive = createLiveSession({
      title: 'Youth Night Service',
      leaderName: 'Pastor Timothy',
      initialSongId: 'song-01',
    });
    const sessionId = leaderLive.session.sessionId;

    // 2. Register active live session on group
    const leaderUser = registerUser({
      email: `timothy_${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Pastor Timothy',
    });
    const groupRes = createWorshipGroup(leaderUser.profile.id, 'Youth Band', 'Calvary Chapel');
    assert.ok(groupRes.group);
    const groupId = groupRes.group.id;

    const liveBroadcast = updateWorshipGroupBranding(leaderUser.profile.id, groupId, {
      activeLiveSessionId: sessionId,
      activeLiveSessionJoinCode: leaderLive.session.joinCode,
      activeLiveSessionLeaderName: 'Pastor Timothy',
    });
    assert.ok(liveBroadcast.ok);
    assert.equal(liveBroadcast.group?.activeLiveSessionId, sessionId);

    // 3. Member joins
    const memberJoin = joinLiveSession({
      sessionId,
      participantName: 'Electric Guitarist',
      instrument: 'guitar',
    });
    assert.equal(memberJoin.session.status, 'active');

    // 4. Leader ends session remotely (from banner on another page)
    const ended = endLiveSession(sessionId, leaderLive.participantToken);
    assert.equal(ended.status, 'ended');

    // Clear from group
    const clearedGroup = updateWorshipGroupBranding(leaderUser.profile.id, groupId, {
      activeLiveSessionId: null,
      activeLiveSessionJoinCode: null,
      activeLiveSessionExpiresAt: null,
      activeLiveSessionLeaderName: null,
    });
    assert.ok(clearedGroup.ok);
    assert.equal(clearedGroup.group?.activeLiveSessionId, undefined);

    // 5. Subsequent join attempts are rejected with SESSION_ENDED
    assert.throws(() => {
      joinLiveSession({
        sessionId,
        participantName: 'Late Bassist',
      });
    }, /already ended/);
  });

  it('14. non-leader members cannot terminate active live session, ensuring End Session action is leader-exclusive', () => {
    const leaderLive = createLiveSession({
      title: 'Easter Sunday Live',
      leaderName: 'Pastor Timothy',
      initialSongId: '1',
    });
    const sessionId = leaderLive.session.sessionId;

    const memberJoin = joinLiveSession({
      sessionId,
      participantName: 'Keyboard Player',
      instrument: 'keyboard',
    });

    // Member participant token cannot end session
    assert.throws(() => {
      endLiveSession(sessionId, memberJoin.participantToken);
    }, /only the worship leader may end/i);

    // Session remains active
    const snapshot = getLiveSessionSnapshot(sessionId, leaderLive.participantToken);
    assert.equal(snapshot.session.status, 'active');

    // Leader participant token successfully ends session
    const ended = endLiveSession(sessionId, leaderLive.participantToken);
    assert.equal(ended.status, 'ended');
  });

  it('15. team member can suggest a setlist, which enters pending state without overwriting active lineup', () => {
    const leader = registerUser({
      email: `lead_${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Pastor David',
    });
    const groupRes = createWorshipGroup(leader.profile.id, 'Main Worship Team', 'Grace Church');
    assert.ok(groupRes.group);
    const groupId = groupRes.group.id;

    // Member joins team
    const singer = registerUser({
      email: `singer_${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Sarah Singer',
      instrument: 'Vocalist',
    });
    updateWorshipGroupBranding(leader.profile.id, groupId, {
      members: [
        {
          userId: leader.profile.id,
          email: leader.profile.email,
          displayName: 'Pastor David',
          role: 'leader',
          joinedAt: new Date().toISOString(),
        },
        {
          userId: singer.profile.id,
          email: singer.profile.email,
          displayName: 'Sarah Singer',
          role: 'member',
          instrument: 'Vocalist',
          joinedAt: new Date().toISOString(),
        },
      ],
    });

    const proposedSetlist: TeamActiveSetlist = {
      id: 'setlist_youth_1',
      name: 'Youth Service Praise',
      publishedAt: new Date().toISOString(),
      publishedBy: singer.profile.id,
      publishedByName: 'Sarah Singer',
      items: [
        { songId: '1', addedAt: new Date().toISOString(), preferredSemitones: 2 },
        { songId: '2', addedAt: new Date().toISOString(), preferredSemitones: -1 },
      ],
    };

    // Singer proposes setlist
    const suggestRes = suggestSetlistForGroup(singer.profile.id, groupId, {
      setlist: proposedSetlist,
      note: 'Keys adjusted for my vocal range as song leader this Sunday',
      targetServiceDate: 'Youth Sunday',
    });

    assert.ok(suggestRes.ok);
    assert.ok(suggestRes.suggestion);
    assert.equal(suggestRes.suggestion.status, 'pending');
    assert.equal(suggestRes.suggestion.suggestedBy, singer.profile.id);
    assert.equal(suggestRes.suggestion.suggestedByName, 'Sarah Singer');
    assert.equal(suggestRes.suggestion.note, 'Keys adjusted for my vocal range as song leader this Sunday');
    assert.equal(suggestRes.suggestion.targetServiceDate, 'Youth Sunday');

    // CRITICAL: activeSetlist MUST NOT be overwritten while pending
    const group = getWorshipGroup(groupId);
    assert.ok(group);
    assert.equal(group.activeSetlist, undefined);
    assert.equal(group.suggestedSetlists?.length, 1);
    assert.equal(group.suggestedSetlists?.[0].status, 'pending');
  });

  it('16. non-member is rejected when trying to suggest a setlist', () => {
    const leader = registerUser({
      email: `lead_${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Pastor David',
    });
    const groupRes = createWorshipGroup(leader.profile.id, 'Main Worship Team', 'Grace Church');
    assert.ok(groupRes.group);

    const outsider = registerUser({
      email: `outsider_${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Outsider User',
    });

    const res = suggestSetlistForGroup(outsider.profile.id, groupRes.group.id, {
      setlist: {
        id: 'setlist_test',
        name: 'Test Setlist',
        publishedAt: new Date().toISOString(),
        publishedBy: outsider.profile.id,
        items: [{ songId: '1', addedAt: new Date().toISOString() }],
      },
    });

    assert.equal(res.ok, false);
    assert.match(res.error || '', /must be a member of this worship team/i);
  });

  it('17. non-leader cannot approve or decline setlist suggestions', () => {
    const leader = registerUser({
      email: `lead_${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Pastor David',
    });
    const groupRes = createWorshipGroup(leader.profile.id, 'Main Worship Team', 'Grace Church');
    assert.ok(groupRes.group);
    const groupId = groupRes.group.id;

    const singer = registerUser({
      email: `singer_${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Sarah Singer',
    });
    const bassist = registerUser({
      email: `bassist_${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Bob Bassist',
    });

    updateWorshipGroupBranding(leader.profile.id, groupId, {
      members: [
        { userId: leader.profile.id, email: leader.profile.email, displayName: 'Pastor David', role: 'leader', joinedAt: new Date().toISOString() },
        { userId: singer.profile.id, email: singer.profile.email, displayName: 'Sarah Singer', role: 'member', joinedAt: new Date().toISOString() },
        { userId: bassist.profile.id, email: bassist.profile.email, displayName: 'Bob Bassist', role: 'member', joinedAt: new Date().toISOString() },
      ],
    });

    const suggestRes = suggestSetlistForGroup(singer.profile.id, groupId, {
      setlist: {
        id: 'setlist_1',
        name: 'Sunday Morning Praise',
        publishedAt: new Date().toISOString(),
        publishedBy: singer.profile.id,
        items: [{ songId: '1', addedAt: new Date().toISOString() }],
      },
    });
    assert.ok(suggestRes.ok && suggestRes.suggestion);

    // Bassist (non-leader) attempts to approve
    const reviewRes = reviewSetlistSuggestion(
      bassist.profile.id,
      groupId,
      suggestRes.suggestion.id,
      'approve'
    );
    assert.equal(reviewRes.ok, false);
    assert.match(reviewRes.error || '', /only the worship team leader or owner/i);

    // Active lineup remains unset
    const group = getWorshipGroup(groupId);
    assert.equal(group?.activeSetlist, undefined);
  });

  it('18. leader approving suggestion promotes it to official active lineup and notifies team', () => {
    const leader = registerUser({
      email: `lead_${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Pastor David',
    });
    const groupRes = createWorshipGroup(leader.profile.id, 'Main Worship Team', 'Grace Church');
    assert.ok(groupRes.group);
    const groupId = groupRes.group.id;

    const singer = registerUser({
      email: `singer_${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Sarah Singer',
      instrument: 'Lead Vocalist',
    });

    updateWorshipGroupBranding(leader.profile.id, groupId, {
      members: [
        { userId: leader.profile.id, email: leader.profile.email, displayName: 'Pastor David', role: 'leader', joinedAt: new Date().toISOString() },
        { userId: singer.profile.id, email: singer.profile.email, displayName: 'Sarah Singer', role: 'member', instrument: 'Lead Vocalist', joinedAt: new Date().toISOString() },
      ],
    });

    const suggestRes = suggestSetlistForGroup(singer.profile.id, groupId, {
      setlist: {
        id: 'setlist_singer_special',
        name: 'Special Easter Service',
        publishedAt: new Date().toISOString(),
        publishedBy: singer.profile.id,
        items: [
          { songId: '1', addedAt: new Date().toISOString(), preferredSemitones: 3 },
          { songId: '2', addedAt: new Date().toISOString(), preferredSemitones: 0 },
        ],
      },
      note: 'Vocal arrangement for Easter',
      targetServiceDate: 'Easter Sunday',
    });
    assert.ok(suggestRes.ok && suggestRes.suggestion);

    // Leader approves!
    const approveRes = reviewSetlistSuggestion(
      leader.profile.id,
      groupId,
      suggestRes.suggestion.id,
      'approve',
      'Looks great Sarah, approved for Sunday!'
    );

    assert.ok(approveRes.ok);
    assert.ok(approveRes.group?.activeSetlist);
    assert.equal(approveRes.group.activeSetlist.name, 'Special Easter Service');
    assert.equal(approveRes.group.activeSetlist.publishedByName, 'Sarah Singer');
    assert.equal(approveRes.group.activeSetlist.items.length, 2);
    assert.equal(approveRes.group.activeSetlist.items[0].preferredSemitones, 3);

    // Suggestion status is updated to approved
    const updatedSuggestion = approveRes.group.suggestedSetlists?.find(
      (s) => s.id === suggestRes.suggestion!.id
    );
    assert.ok(updatedSuggestion);
    assert.equal(updatedSuggestion.status, 'approved');
    assert.equal(updatedSuggestion.reviewedByName, 'Pastor David');
    assert.equal(updatedSuggestion.reviewNote, 'Looks great Sarah, approved for Sunday!');
  });

  it('19. leader declining suggestion updates status with feedback note without touching active lineup', () => {
    const leader = registerUser({
      email: `lead_${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Pastor David',
    });
    const groupRes = createWorshipGroup(leader.profile.id, 'Main Worship Team', 'Grace Church');
    assert.ok(groupRes.group);
    const groupId = groupRes.group.id;

    const singer = registerUser({
      email: `singer_${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Sarah Singer',
    });

    updateWorshipGroupBranding(leader.profile.id, groupId, {
      members: [
        { userId: leader.profile.id, email: leader.profile.email, displayName: 'Pastor David', role: 'leader', joinedAt: new Date().toISOString() },
        { userId: singer.profile.id, email: singer.profile.email, displayName: 'Sarah Singer', role: 'member', joinedAt: new Date().toISOString() },
      ],
    });

    const suggestRes = suggestSetlistForGroup(singer.profile.id, groupId, {
      setlist: {
        id: 'setlist_rock',
        name: 'Heavy Rock Praise',
        publishedAt: new Date().toISOString(),
        publishedBy: singer.profile.id,
        items: [{ songId: '1', addedAt: new Date().toISOString() }],
      },
    });
    assert.ok(suggestRes.ok && suggestRes.suggestion);

    // Leader declines with note
    const declineRes = reviewSetlistSuggestion(
      leader.profile.id,
      groupId,
      suggestRes.suggestion.id,
      'decline',
      'Too heavy for this week’s communion service, let’s do acoustic songs instead.'
    );

    assert.ok(declineRes.ok);
    assert.equal(declineRes.group?.activeSetlist, undefined);

    const declinedSuggestion = declineRes.group?.suggestedSetlists?.find(
      (s) => s.id === suggestRes.suggestion!.id
    );
    assert.ok(declinedSuggestion);
    assert.equal(declinedSuggestion.status, 'declined');
    assert.equal(declinedSuggestion.reviewNote, 'Too heavy for this week’s communion service, let’s do acoustic songs instead.');
  });

  it('20. member can withdraw their pending lineup suggestion', () => {
    const leader = registerUser({
      email: `lead_${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Pastor David',
    });
    const groupRes = createWorshipGroup(leader.profile.id, 'Main Worship Team', 'Grace Church');
    assert.ok(groupRes.group);
    const groupId = groupRes.group.id;

    const singer = registerUser({
      email: `singer_${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Sarah Singer',
    });

    updateWorshipGroupBranding(leader.profile.id, groupId, {
      members: [
        { userId: leader.profile.id, email: leader.profile.email, displayName: 'Pastor David', role: 'leader', joinedAt: new Date().toISOString() },
        { userId: singer.profile.id, email: singer.profile.email, displayName: 'Sarah Singer', role: 'member', joinedAt: new Date().toISOString() },
      ],
    });

    const suggestRes = suggestSetlistForGroup(singer.profile.id, groupId, {
      setlist: {
        id: 'setlist_draft',
        name: 'Draft Lineup',
        publishedAt: new Date().toISOString(),
        publishedBy: singer.profile.id,
        items: [{ songId: '1', addedAt: new Date().toISOString() }],
      },
    });
    assert.ok(suggestRes.ok && suggestRes.suggestion);
    assert.equal(suggestRes.group?.suggestedSetlists?.length, 1);

    // Member withdraws
    const deleteRes = deleteSetlistSuggestion(singer.profile.id, groupId, suggestRes.suggestion.id);
    assert.ok(deleteRes.ok);
    assert.equal(deleteRes.group?.suggestedSetlists?.length, 0);
  });

  it('21. leader can propose a setlist for co-leader review or testing, preserving transpositions and audio links', () => {
    const leader = registerUser({
      email: `lead_co_${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Worship Pastor Mike',
    });
    const groupRes = createWorshipGroup(leader.profile.id, 'East Campus Team', 'Grace Church');
    assert.ok(groupRes.group);
    const groupId = groupRes.group.id;

    // Leader submits a proposal (testing or co-leading flow)
    const proposeRes = suggestSetlistForGroup(leader.profile.id, groupId, {
      setlist: {
        id: 'setlist_easter',
        name: 'Easter Celebration 2026',
        publishedAt: new Date().toISOString(),
        publishedBy: leader.profile.id,
        items: [
          {
            songId: 'song-way-maker',
            addedAt: new Date().toISOString(),
            preferredSemitones: 3,
            notes: 'Sing key of Eb for soprano lead',
            referenceAudioUrl: 'https://www.youtube.com/watch?v=iJCV_2H9xD0',
          },
        ],
      },
      targetServiceDate: 'Easter Sunday',
      note: 'Arranged in Eb with modulation on bridge 2.',
    });

    assert.ok(proposeRes.ok && proposeRes.suggestion);
    assert.equal(proposeRes.suggestion.status, 'pending');
    assert.equal(proposeRes.suggestion.targetServiceDate, 'Easter Sunday');
    assert.equal(proposeRes.suggestion.setlist.items[0].preferredSemitones, 3);
    assert.equal(proposeRes.suggestion.setlist.items[0].referenceAudioUrl, 'https://www.youtube.com/watch?v=iJCV_2H9xD0');

    // Leader approves the proposal
    const approveRes = reviewSetlistSuggestion(
      leader.profile.id,
      groupId,
      proposeRes.suggestion.id,
      'approve'
    );

    assert.ok(approveRes.ok && approveRes.group);
    assert.ok(approveRes.group.activeSetlist);
    assert.equal(approveRes.group.activeSetlist.name, 'Easter Celebration 2026');
    assert.equal(approveRes.group.activeSetlist.items[0].preferredSemitones, 3);
    assert.equal(approveRes.group.activeSetlist.items[0].referenceAudioUrl, 'https://www.youtube.com/watch?v=iJCV_2H9xD0');
    assert.equal(approveRes.group.activeSetlist.items[0].notes, 'Sing key of Eb for soprano lead');

    const approvedSugg = approveRes.group.suggestedSetlists?.find(
      (s) => s.id === proposeRes.suggestion!.id
    );
    assert.ok(approvedSugg);
    assert.equal(approvedSugg.status, 'approved');
  });

  it('22. self-healing fallback when reviewing suggestions: review succeeds even if group was not in server store', async () => {
    const leader = registerUser({
      email: `leader_${Date.now()}_fallback@example.com`,
      password: 'Password123!',
      displayName: 'Worship Director Sarah',
    });

    const unknownGroupId = `group_external_${Date.now()}`;
    const suggestionId = `sugg_${Date.now()}_remote`;

    const clientGroupFallback = {
      id: unknownGroupId,
      name: 'Resilient Praise Team',
      churchName: 'Faith Fellowship',
      ownerId: leader.profile.id,
      inviteCode: 'RESILIENT',
      createdAt: new Date().toISOString(),
      members: [
        {
          userId: leader.profile.id,
          email: leader.profile.email,
          displayName: 'Worship Director Sarah',
          role: 'leader' as const,
          joinedAt: new Date().toISOString(),
        },
      ],
      suggestedSetlists: [
        {
          id: suggestionId,
          setlist: {
            id: 'setlist_recovery',
            name: 'Praise & Thanksgiving',
            publishedAt: new Date().toISOString(),
            publishedBy: 'member_singer',
            publishedByName: 'Singer Sharon',
            items: [{ songId: 'goodness-of-god', addedAt: new Date().toISOString() }],
          },
          suggestedBy: 'member_singer',
          suggestedByName: 'Singer Sharon',
          suggestedByRole: 'Vocalist',
          suggestedAt: new Date().toISOString(),
          status: 'pending' as const,
        },
      ],
    };

    // Review suggestion using self-healing clientGroupFallback
    const reviewRes = reviewSetlistSuggestion(
      leader.profile.id,
      unknownGroupId,
      suggestionId,
      'approve',
      'Looks great for Sunday morning service!',
      clientGroupFallback
    );

    assert.ok(reviewRes.ok, `Expected review to succeed with self-healing, got error: ${reviewRes.error}`);
    assert.ok(reviewRes.group);
    assert.equal(reviewRes.group.id, unknownGroupId);
    assert.ok(reviewRes.group.activeSetlist);
    assert.equal(reviewRes.group.activeSetlist.name, 'Praise & Thanksgiving');
    assert.equal(reviewRes.group.suggestedSetlists?.[0].status, 'approved');
    assert.equal(reviewRes.group.suggestedSetlists?.[0].reviewNote, 'Looks great for Sunday morning service!');
  });

  it('23. strict member permission boundary: non-leader member cannot approve or decline lineup suggestions', async () => {
    const leader = registerUser({
      email: `leader_${Date.now()}_perm@example.com`,
      password: 'Password123!',
      displayName: 'Leader Peter',
    });
    const member = registerUser({
      email: `member_${Date.now()}_perm@example.com`,
      password: 'Password123!',
      displayName: 'Guitarist John',
    });

    const groupRes = createWorshipGroup(leader.profile.id, 'Main Sanctuary Band', 'Cornerstone');
    assert.ok(groupRes.group);
    const groupId = groupRes.group.id;

    // Join as explicit member
    joinWorshipGroupByCode(member.profile.id, groupRes.group.inviteCode);

    // Member proposes setlist
    const proposeRes = suggestSetlistForGroup(member.profile.id, groupId, {
      setlist: {
        id: 'setlist_guitar_lead',
        name: 'Acoustic Worship Night',
        publishedAt: new Date().toISOString(),
        publishedBy: member.profile.id,
        items: [{ songId: 'way-maker', addedAt: new Date().toISOString() }],
      },
      note: 'Soft acoustic arrangements.',
    });
    assert.ok(proposeRes.ok && proposeRes.suggestion);
    assert.equal(proposeRes.suggestion.status, 'pending');

    // Member attempts to approve their own or any suggestion -> must be rejected
    const memberAttempt = reviewSetlistSuggestion(
      member.profile.id,
      groupId,
      proposeRes.suggestion.id,
      'approve'
    );
    assert.equal(memberAttempt.ok, false);
    assert.match(memberAttempt.error || '', /leader/i);

    // Leader approves legitimately
    const leaderApprove = reviewSetlistSuggestion(
      leader.profile.id,
      groupId,
      proposeRes.suggestion.id,
      'approve'
    );
    assert.ok(leaderApprove.ok);
    assert.equal(leaderApprove.group?.activeSetlist?.name, 'Acoustic Worship Night');
  });

  it('24. leader clearing active setlist updates store with null and prevents auto-resurrection', () => {
    const leader = registerUser({
      email: `leader_${Date.now()}_clear@example.com`,
      password: 'Password123!',
      displayName: 'Worship Leader Dan',
    });
    const groupRes = createWorshipGroup(leader.profile.id, 'Resurrection-Free Team', 'Living Water');
    assert.ok(groupRes.group);
    const groupId = groupRes.group.id;

    // 1. Publish setlist
    const publishRes = updateWorshipGroupBranding(leader.profile.id, groupId, {
      activeSetlist: {
        id: 'setlist_to_clear',
        name: 'Songs for Sunday',
        publishedAt: new Date().toISOString(),
        publishedBy: leader.profile.id,
        items: [{ songId: 'song-01', addedAt: new Date().toISOString() }],
      },
    });
    assert.ok(publishRes.ok && publishRes.group?.activeSetlist);
    assert.equal(publishRes.group.activeSetlist.name, 'Songs for Sunday');

    // 2. Clear setlist via activeSetlist: null
    const clearRes = updateWorshipGroupBranding(leader.profile.id, groupId, {
      activeSetlist: null,
    });
    assert.ok(clearRes.ok);
    assert.equal(clearRes.group?.activeSetlist, null);

    // 3. Subsequent query must return activeSetlist as null/falsy
    const refreshed = getWorshipGroup(groupId);
    assert.ok(refreshed);
    assert.ok(!refreshed.activeSetlist);
  });

  it('25. member closing an approved suggestion removes it from suggestions without unpublishing the active lineup from the team', () => {
    const leader = registerUser({
      email: `leader_${Date.now()}_close@example.com`,
      password: 'Password123!',
      displayName: 'Worship Leader Mark',
    });
    const groupRes = createWorshipGroup(leader.profile.id, 'Praise Team', 'Grace Community');
    assert.ok(groupRes.group);
    const groupId = groupRes.group.id;

    const singer = registerUser({
      email: `singer_${Date.now()}_close@example.com`,
      password: 'Password123!',
      displayName: 'Lead Singer Rachel',
    });

    const joinRes = joinWorshipGroupByCode(singer.profile.id, groupRes.group.inviteCode);
    assert.ok(joinRes.ok);

    // 1. Singer suggests a setlist
    const proposeRes = suggestSetlistForGroup(singer.profile.id, groupId, {
      setlist: {
        id: 'sunday_lineup_proposal',
        name: 'Sunday Morning Celebration',
        publishedAt: new Date().toISOString(),
        publishedBy: singer.profile.id,
        publishedByName: 'Rachel',
        items: [
          { songId: 'song-101', addedAt: new Date().toISOString(), preferredSemitones: 0 },
          { songId: 'song-102', addedAt: new Date().toISOString(), preferredSemitones: 2 },
        ],
      },
      note: 'Keys matched for morning vocal energy',
    });
    assert.ok(proposeRes.ok && proposeRes.suggestion);
    const suggestionId = proposeRes.suggestion.id;

    // 2. Leader approves the proposal -> it becomes the team activeSetlist
    const approveRes = reviewSetlistSuggestion(leader.profile.id, groupId, suggestionId, 'approve');
    assert.ok(approveRes.ok && approveRes.group);
    assert.equal(approveRes.group.activeSetlist?.name, 'Sunday Morning Celebration');
    assert.equal(approveRes.group.suggestedSetlists?.find((s) => s.id === suggestionId)?.status, 'approved');

    // 3. Member Rachel sees it is approved and clicks "Close" (deleteSetlistSuggestion)
    const closeRes = deleteSetlistSuggestion(singer.profile.id, groupId, suggestionId);
    assert.ok(closeRes.ok && closeRes.group);

    // 4. Verify suggestion is dismissed from suggestedSetlists
    const isStillInSuggestions = closeRes.group.suggestedSetlists?.some((s) => s.id === suggestionId);
    assert.equal(isStillInSuggestions, false, 'Dismissed suggestion should no longer be in suggestedSetlists');

    // 5. CRITICAL: The team active lineup MUST remain untouched and active!
    assert.ok(closeRes.group.activeSetlist, 'Team activeSetlist must not be cleared by member closing their approved proposal');
    assert.equal(closeRes.group.activeSetlist?.name, 'Sunday Morning Celebration');
    assert.equal(closeRes.group.activeSetlist?.items.length, 2);

    // 6. Verify persisted store consistency
    const refreshed = getWorshipGroup(groupId);
    assert.ok(refreshed);
    assert.equal(refreshed.activeSetlist?.name, 'Sunday Morning Celebration');
    assert.equal(refreshed.suggestedSetlists?.some((s) => s.id === suggestionId), false);
  });

  it('26. sanitizeActiveSetlistForFirestore preserves optional createdAt and updatedAt', () => {
    const rawSetlist = {
      id: 'setlist_123',
      name: 'Sunday Easter Lineup',
      description: 'Morning set',
      publishedAt: '2026-10-29T10:00:00.000Z',
      publishedBy: 'user_456',
      publishedByName: 'Worship Leader',
      createdAt: '2026-10-28T15:30:00.000Z',
      updatedAt: '2026-10-29T09:45:00.000Z',
      items: [{ songId: 'song_1', addedAt: '2026-10-29T10:00:00.000Z' }],
      unauthorizedExtraField: 'should_be_stripped',
    };

    const sanitized = sanitizeActiveSetlistForFirestore(rawSetlist);
    assert.ok(sanitized);
    assert.equal(sanitized.id, 'setlist_123');
    assert.equal(sanitized.name, 'Sunday Easter Lineup');
    assert.equal(sanitized.createdAt, '2026-10-28T15:30:00.000Z');
    assert.equal(sanitized.updatedAt, '2026-10-29T09:45:00.000Z');
    assert.equal((sanitized as any).unauthorizedExtraField, undefined);
  });

  it('27. simulates isValidActiveSetlist CEL logic from firestore.rules', () => {
    function isValidTimestampOrDateString(val: any): boolean {
      return typeof val === 'string' && val.length >= 10 && val.length <= 50;
    }
    function isValidOptionalTimestampOrDateString(data: Record<string, any>, field: string): boolean {
      return !(field in data) || data[field] === null || isValidTimestampOrDateString(data[field]);
    }
    function isValidOptionalString(data: Record<string, any>, field: string, minLen: number, maxLen: number): boolean {
      return (
        !(field in data) ||
        data[field] === null ||
        (typeof data[field] === 'string' && data[field].length >= minLen && data[field].length <= maxLen)
      );
    }
    function isValidActiveSetlistSim(setlist: any): boolean {
      if (!setlist || typeof setlist !== 'object' || Array.isArray(setlist)) return false;
      const allowedKeys = new Set([
        'id', 'name', 'description', 'publishedAt', 'publishedBy', 'publishedByName', 'items', 'createdAt', 'updatedAt'
      ]);
      const keys = Object.keys(setlist);
      const hasOnly = keys.every((k) => allowedKeys.has(k));
      const required = ['id', 'name', 'publishedAt', 'publishedBy', 'items'];
      const hasAll = required.every((k) => k in setlist);
      return (
        hasOnly &&
        hasAll &&
        typeof setlist.id === 'string' && setlist.id.length >= 1 && setlist.id.length <= 128 &&
        typeof setlist.name === 'string' && setlist.name.length >= 1 && setlist.name.length <= 100 &&
        isValidOptionalString(setlist, 'description', 0, 1000) &&
        isValidTimestampOrDateString(setlist.publishedAt) &&
        typeof setlist.publishedBy === 'string' && setlist.publishedBy.length >= 1 && setlist.publishedBy.length <= 128 &&
        isValidOptionalString(setlist, 'publishedByName', 0, 100) &&
        isValidOptionalTimestampOrDateString(setlist, 'createdAt') &&
        isValidOptionalTimestampOrDateString(setlist, 'updatedAt') &&
        Array.isArray(setlist.items) && setlist.items.length <= 100
      );
    }

    const baseSetlist = {
      id: 'setlist_1',
      name: 'Sunday Morning',
      publishedAt: '2026-10-29T10:00:00.000Z',
      publishedBy: 'user_1',
      items: [],
    };

    // 1. Valid without createdAt/updatedAt
    assert.equal(isValidActiveSetlistSim(baseSetlist), true);

    // 2. Valid with createdAt and updatedAt
    assert.equal(
      isValidActiveSetlistSim({
        ...baseSetlist,
        createdAt: '2026-10-29T08:00:00.000Z',
        updatedAt: '2026-10-29T09:00:00.000Z',
      }),
      true
    );

    // 3. Valid with null createdAt / updatedAt
    assert.equal(
      isValidActiveSetlistSim({
        ...baseSetlist,
        createdAt: null,
        updatedAt: null,
      }),
      true
    );

    // 4. Invalid with disallowed extra field
    assert.equal(
      isValidActiveSetlistSim({
        ...baseSetlist,
        maliciousField: 'exploit',
      }),
      false
    );

    // 5. Invalid with malformed createdAt (too short string)
    assert.equal(
      isValidActiveSetlistSim({
        ...baseSetlist,
        createdAt: 'bad',
      }),
      false
    );

    // 6. Invalid when missing required publishedAt
    const missingPublishedAt = { ...baseSetlist };
    delete (missingPublishedAt as any).publishedAt;
    assert.equal(isValidActiveSetlistSim(missingPublishedAt), false);
  });

  it('28. Live Sync active session discovery & multi-client back-and-forth flow', () => {
    // 1. Leader sets up worship group with an active setlist
    const leader = registerUser({
      email: `leader_live_flow_${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Pastor Mark',
      churchName: 'Grace City Church',
    });
    const leaderId = leader.profile.id;
    const createRes = createWorshipGroup(leaderId, 'Grace City Worship', 'Grace City Church');
    assert.equal(createRes.ok, true);
    const group = createRes.group!;
    const groupId = group.id;

    // Member joins group
    const member = registerUser({
      email: `member_live_flow_${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Sarah Keyboard',
    });
    const joinRes = joinWorshipGroupByCode(member.profile.id, group.inviteCode);
    assert.equal(joinRes.ok, true);

    // 2. Before leader goes live: querying active session returns active: false
    const initialCheck = getActiveSessionInfo({ groupId });
    assert.equal(initialCheck.active, false);

    // 3. Leader starts live session, passing groupId
    const sessionRes = createLiveSession({
      title: 'Sunday Morning Praise',
      leaderName: 'Pastor Mark',
      groupId,
      initialSongId: 'song-01',
      setlistSongIds: ['song-01', 'song-02'],
    });
    assert.ok(sessionRes.session);
    assert.equal(sessionRes.session.groupId, groupId);
    const sessionId = sessionRes.session.sessionId;
    const joinCode = sessionRes.session.joinCode;

    // 4. Member polling detects active live session immediately by groupId
    const memberPoll = getActiveSessionInfo({ groupId });
    assert.equal(memberPoll.active, true);
    assert.equal(memberPoll.session?.sessionId, sessionId);
    assert.equal(memberPoll.session?.joinCode, joinCode);
    assert.equal(memberPoll.session?.leaderName, 'Pastor Mark');

    // 5. Member auto-joins with the detected sessionId without needing manual code
    const memberJoin = joinLiveSession({
      sessionId,
      participantName: 'Sarah Keyboard',
      instrument: 'keyboard',
    });
    assert.equal(memberJoin.session.sessionId, sessionId);
    assert.equal(memberJoin.session.participants.length, 2);
    assert.ok(
      memberJoin.session.participants.some(
        (p) => p.name === 'Sarah Keyboard' && p.instrument === 'keyboard'
      )
    );

    // 6. Back-and-forth sync: Leader changes key (+2 semitones) and switches section to "Chorus"
    const updateRes = updateLiveSessionState(
      sessionId,
      sessionRes.participantToken,
      {
        officialSemitones: 2,
        activeSectionId: 'Chorus',
        activeSectionLabel: 'Chorus',
      }
    );
    assert.equal(updateRes.sharedState.officialSemitones, 2);
    assert.equal(updateRes.sharedState.activeSectionLabel, 'Chorus');

    // 7. Member's next state query receives the leader's change instantly
    const memberSnapshot = getLiveSessionSnapshot(sessionId, memberJoin.participantToken);
    assert.equal(memberSnapshot.session.sharedState.officialSemitones, 2);
    assert.equal(memberSnapshot.session.sharedState.activeSectionLabel, 'Chorus');

    // 8. Leader ends session
    const endRes = endLiveSession(sessionId, sessionRes.participantToken);
    assert.equal(endRes.status, 'ended');

    // 9. Member polling now detects session ended
    const postEndPoll = getActiveSessionInfo({ groupId });
    assert.equal(postEndPoll.active, false);
  });

  it('29. immediate join-by-code and setlist song progression', () => {
    const leader = registerUser({
      email: `leader_code_flow_${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Leader Chris',
    });
    const sessionRes = createLiveSession({
      title: 'Youth Night Live',
      leaderName: 'Leader Chris',
      initialSongId: 'song-01',
      initialSemitones: 0,
      setlistSongIds: ['song-01', 'song-02'],
    });

    const cleanCode = sessionRes.session.joinCode;

    // Member joins using the 6-character code
    const memberJoin = joinLiveSession({
      joinCode: cleanCode,
      participantName: 'Drummer Leo',
    });
    assert.equal(memberJoin.session.sessionId, sessionRes.session.sessionId);

    // Leader advances to Song 2 of the setlist with +3 transpose
    const updateState = updateLiveSessionState(
      sessionRes.session.sessionId,
      sessionRes.participantToken,
      {
        songId: 'song-02',
        officialSemitones: 3,
        activeSectionId: 'Bridge',
        activeSectionLabel: 'Bridge',
      }
    );
    assert.equal(updateState.sharedState.songId, 'song-02');
    assert.equal(updateState.sharedState.officialSemitones, 3);
    assert.equal(updateState.sharedState.activeSectionLabel, 'Bridge');

    // Member query matches
    const memberView = getLiveSessionSnapshot(sessionRes.session.sessionId, memberJoin.participantToken);
    assert.equal(memberView.session.sharedState.songId, 'song-02');
    assert.equal(memberView.session.sharedState.officialSemitones, 3);
  });

  it('30. multi-session lifecycle consistency: Start -> End -> Start New session', () => {
    const leader = registerUser({
      email: `leader_cycle_${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Worship Pastor Alex',
    });
    const createRes = createWorshipGroup(leader.profile.id, 'Resurrection Team');
    assert.equal(createRes.ok, true);
    const groupId = createRes.group!.id;

    // Session 1: Morning Rehearsal
    const s1 = createLiveSession({
      title: 'Morning Rehearsal',
      leaderName: 'Worship Pastor Alex',
      groupId,
      initialSongId: 'song-01',
    });
    assert.equal(getActiveSessionInfo({ groupId }).session?.sessionId, s1.session.sessionId);

    // Leader ends Session 1
    endLiveSession(s1.session.sessionId, s1.participantToken);
    assert.equal(getActiveSessionInfo({ groupId }).active, false);

    // Session 2: Sunday Main Service
    const s2 = createLiveSession({
      title: 'Sunday Main Service',
      leaderName: 'Worship Pastor Alex',
      groupId,
      initialSongId: 'song-02',
    });
    const s2Check = getActiveSessionInfo({ groupId });
    assert.equal(s2Check.active, true);
    assert.equal(s2Check.session?.sessionId, s2.session.sessionId);
    assert.notEqual(s2Check.session?.sessionId, s1.session.sessionId);
    assert.equal(s2Check.session?.title, 'Sunday Main Service');

    // Member connects directly to Session 2
    const member = joinLiveSession({
      sessionId: s2.session.sessionId,
      participantName: 'Violinist Chloe',
    });
    assert.equal(member.session.sessionId, s2.session.sessionId);
    assert.equal(member.session.sharedState.songId, 'song-02');
  });

  it('31. resilient activeSetlist sanitization prevents Firestore rules rejection during live sync', () => {
    // Dirty setlist from personal library containing non-schema fields
    const dirtySetlist: any = {
      id: 'setlist_dirty_001',
      name: 'Sunday Easter Lineup',
      description: 'Songs for Easter',
      createdAt: '2026-10-29T10:00:00.000Z',
      updatedAt: '2026-10-29T11:00:00.000Z',
      publishedAt: '2026-10-29T10:00:00.000Z',
      publishedBy: 'leader_123',
      publishedByName: 'Pastor Mark',
      isOfficial: true,
      customTag: 'special-service',
      unknownProperty: 12345,
      items: [
        {
          songId: 'song-01',
          songTitle: 'Goodness of God',
          songArtist: 'Bethel Music',
          preferredSemitones: 2,
          notes: 'Soft acoustic intro',
          extraBogusKey: true,
        },
      ],
    };

    const clean = sanitizeActiveSetlistForFirestore(dirtySetlist);
    assert.ok(clean);
    assert.equal(clean.id, 'setlist_dirty_001');
    assert.equal(clean.name, 'Sunday Easter Lineup');
    assert.equal(clean.publishedAt, '2026-10-29T10:00:00.000Z');
    assert.equal(clean.publishedBy, 'leader_123');
    assert.equal((clean as any).isOfficial, undefined);
    assert.equal((clean as any).customTag, undefined);
    assert.equal((clean as any).unknownProperty, undefined);
    assert.equal(clean.items.length, 1);
    assert.equal(clean.items[0].songId, 'song-01');
    assert.equal(clean.items[0].preferredSemitones, 2);
  });

  it('32. leader approves suggestion -> casts live sync -> returns to team hub / refreshes -> suggestion remains approved and does NOT reappear in pending', () => {
    const leader = registerUser({
      email: `leader_live_loop_${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Pastor Samuel',
    });
    const groupRes = createWorshipGroup(leader.profile.id, 'Praise Central', 'City Church');
    assert.ok(groupRes.group);
    const groupId = groupRes.group.id;

    const vocalist = registerUser({
      email: `vocalist_${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Joy Vocalist',
    });

    updateWorshipGroupBranding(leader.profile.id, groupId, {
      members: [
        { userId: leader.profile.id, email: leader.profile.email, displayName: 'Pastor Samuel', role: 'leader', joinedAt: new Date().toISOString() },
        { userId: vocalist.profile.id, email: vocalist.profile.email, displayName: 'Joy Vocalist', role: 'member', joinedAt: new Date().toISOString() },
      ],
    });

    // 1. Vocalist suggests a setlist
    const suggestRes = suggestSetlistForGroup(vocalist.profile.id, groupId, {
      setlist: {
        id: 'sugg_setlist_joy',
        name: 'Joyful Praise Lineup',
        publishedAt: new Date().toISOString(),
        publishedBy: vocalist.profile.id,
        items: [
          { songId: 'song-01', addedAt: new Date().toISOString(), preferredSemitones: 2 },
          { songId: 'song-02', addedAt: new Date().toISOString() },
        ],
      },
      note: 'Upbeat arrangement for Sunday celebration',
      targetServiceDate: 'Next Sunday',
    });
    assert.ok(suggestRes.ok && suggestRes.suggestion);
    const suggestionId = suggestRes.suggestion.id;

    // Verify it is currently pending
    let currentGroup = getWorshipGroup(groupId)!;
    let pending = (currentGroup.suggestedSetlists || []).filter((s) => s.status === 'pending');
    assert.equal(pending.length, 1);
    assert.equal(pending[0].id, suggestionId);

    // 2. Leader reviews and approves the suggestion
    const approveRes = reviewSetlistSuggestion(
      leader.profile.id,
      groupId,
      suggestionId,
      'approve'
    );
    assert.ok(approveRes.ok && approveRes.group);
    currentGroup = approveRes.group;

    // In the leader's local state, pendingSuggestions is now 0!
    pending = (currentGroup.suggestedSetlists || []).filter((s) => s.status === 'pending');
    assert.equal(pending.length, 0);
    const approvedSugg = currentGroup.suggestedSetlists?.find((s) => s.id === suggestionId);
    assert.ok(approvedSugg);
    assert.equal(approvedSugg.status, 'approved');
    assert.equal(currentGroup.activeSetlist?.name, 'Joyful Praise Lineup');

    // 3. Leader casts Live Sync
    const liveSessionRes = createLiveSession({
      title: `${currentGroup.activeSetlist.name} Live`,
      leaderName: 'Pastor Samuel',
      initialSongId: currentGroup.activeSetlist.items[0].songId,
      initialSemitones: currentGroup.activeSetlist.items[0].preferredSemitones,
      setlistSongIds: currentGroup.activeSetlist.items.map((i) => i.songId),
      groupId,
    });
    assert.ok(liveSessionRes.session);

    // Simulate setTeamActiveLiveSession updating group branding
    const patchRes = updateWorshipGroupBranding(leader.profile.id, groupId, {
      activeLiveSessionId: liveSessionRes.session.sessionId,
      activeLiveSessionJoinCode: liveSessionRes.session.joinCode,
      activeLiveSessionExpiresAt: liveSessionRes.session.expiresAt,
      activeLiveSessionLeaderName: 'Pastor Samuel',
      activeSetlist: currentGroup.activeSetlist,
      suggestedSetlists: currentGroup.suggestedSetlists,
    });
    assert.ok(patchRes.ok && patchRes.group);

    // 4. Leader navigates back to Team Hub (/team) and refreshActiveGroup runs
    // Simulate what happens when AuthContext fetches /api/groups/${groupId}
    const serverGroup = getWorshipGroup(groupId)!;
    assert.ok(serverGroup);

    // Apply mergeSuggestedSetlists (what AuthContext.tsx now executes)
    const mergedSuggestions = mergeSuggestedSetlists(
      serverGroup.suggestedSetlists,
      currentGroup.suggestedSetlists
    );

    const reloadedPending = mergedSuggestions.filter((s) => s.status === 'pending');
    // CRITICAL ASSERTION: The approval modal must NOT reappear!
    assert.equal(reloadedPending.length, 0);

    const reloadedApproved = mergedSuggestions.find((s) => s.id === suggestionId);
    assert.ok(reloadedApproved);
    assert.equal(reloadedApproved.status, 'approved');
    assert.equal(serverGroup.activeSetlist?.name, 'Joyful Praise Lineup');
  });

  it('33. member suggests setlist -> leader declines with note -> leader casts live sync -> suggestion remains declined', () => {
    const leader = registerUser({
      email: `leader_decline_loop_${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Pastor Anna',
    });
    const groupRes = createWorshipGroup(leader.profile.id, 'Grace North', 'Grace Church');
    assert.ok(groupRes.group);
    const groupId = groupRes.group.id;

    const member = registerUser({
      email: `member_tom_${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Tom Bassist',
    });

    updateWorshipGroupBranding(leader.profile.id, groupId, {
      members: [
        { userId: leader.profile.id, email: leader.profile.email, displayName: 'Pastor Anna', role: 'leader', joinedAt: new Date().toISOString() },
        { userId: member.profile.id, email: member.profile.email, displayName: 'Tom Bassist', role: 'member', joinedAt: new Date().toISOString() },
      ],
    });

    const suggestRes = suggestSetlistForGroup(member.profile.id, groupId, {
      setlist: {
        id: 'sugg_acoustic',
        name: 'Acoustic Set',
        publishedAt: new Date().toISOString(),
        publishedBy: member.profile.id,
        items: [{ songId: 'song-01', addedAt: new Date().toISOString() }],
      },
      note: 'Intimate worship set',
    });
    assert.ok(suggestRes.ok && suggestRes.suggestion);
    const suggestionId = suggestRes.suggestion.id;

    // Leader declines suggestion
    const declineRes = reviewSetlistSuggestion(
      leader.profile.id,
      groupId,
      suggestionId,
      'decline',
      'Saving this for next month youth retreat'
    );
    assert.ok(declineRes.ok && declineRes.group);

    // Leader casts live session
    const liveSessionRes = createLiveSession({
      title: 'Midweek Service',
      leaderName: 'Pastor Anna',
      initialSongId: 'song-01',
      groupId,
    });
    assert.ok(liveSessionRes.session);

    updateWorshipGroupBranding(leader.profile.id, groupId, {
      activeLiveSessionId: liveSessionRes.session.sessionId,
      activeLiveSessionJoinCode: liveSessionRes.session.joinCode,
      activeLiveSessionExpiresAt: liveSessionRes.session.expiresAt,
      activeLiveSessionLeaderName: 'Pastor Anna',
      suggestedSetlists: declineRes.group.suggestedSetlists,
    });

    // Leader returns to Team Hub
    const fetched = getWorshipGroup(groupId)!;
    const merged = mergeSuggestedSetlists(fetched.suggestedSetlists, declineRes.group.suggestedSetlists);
    const pendingList = merged.filter((s) => s.status === 'pending');
    assert.equal(pendingList.length, 0);

    const declinedItem = merged.find((s) => s.id === suggestionId);
    assert.ok(declinedItem);
    assert.equal(declinedItem.status, 'declined');
    assert.equal(declinedItem.reviewNote, 'Saving this for next month youth retreat');
  });

  it('34. mergeSuggestedSetlists enforces terminal state invariance across all permutations', () => {
    const dummySetlist: TeamActiveSetlist = {
      id: 'setlist_1',
      name: 'Sunday Praise',
      publishedAt: '2026-10-29T10:00:00Z',
      publishedBy: 'user_1',
      items: [{ songId: 'song-01', addedAt: '2026-10-29T10:00:00Z' }],
    };

    // 1. Current is approved, incoming is stale pending -> result must be approved
    const currentApproved = [
      {
        id: 'sugg_1',
        setlist: dummySetlist,
        suggestedBy: 'user_1',
        suggestedByName: 'Singer',
        suggestedAt: '2026-10-29T10:00:00Z',
        status: 'approved' as const,
        reviewedBy: 'leader_1',
        reviewedByName: 'Pastor',
        reviewedAt: '2026-10-29T10:05:00Z',
      },
    ];

    const incomingPending = [
      {
        id: 'sugg_1',
        setlist: dummySetlist,
        suggestedBy: 'user_1',
        suggestedByName: 'Singer',
        suggestedAt: '2026-10-29T10:00:00Z',
        status: 'pending' as const,
      },
    ];

    const result1 = mergeSuggestedSetlists(incomingPending, currentApproved);
    assert.equal(result1.length, 1);
    assert.equal(result1[0].status, 'approved');
    assert.equal(result1[0].reviewedBy, 'leader_1');

    // 2. Current is declined, incoming is stale pending -> result must be declined
    const currentDeclined = [
      {
        ...currentApproved[0],
        status: 'declined' as const,
        reviewNote: 'Not this week',
      },
    ];
    const result2 = mergeSuggestedSetlists(incomingPending, currentDeclined);
    assert.equal(result2.length, 1);
    assert.equal(result2[0].status, 'declined');
    assert.equal(result2[0].reviewNote, 'Not this week');

    // 3. Incoming is approved on another device, current is pending -> promotes to approved
    const result3 = mergeSuggestedSetlists(currentApproved, incomingPending);
    assert.equal(result3.length, 1);
    assert.equal(result3[0].status, 'approved');

    // 4. New proposal submitted by another user is preserved alongside resolved items
    const incomingWithNewProposal = [
      ...incomingPending,
      {
        id: 'sugg_2',
        setlist: dummySetlist,
        suggestedBy: 'user_2',
        suggestedByName: 'Guitarist Bob',
        suggestedAt: '2026-10-29T11:00:00Z',
        status: 'pending' as const,
      },
    ];
    const result4 = mergeSuggestedSetlists(incomingWithNewProposal, currentApproved);
    assert.equal(result4.length, 2);
    // sugg_2 is pending, sugg_1 is approved
    const s1 = result4.find((s) => s.id === 'sugg_1');
    const s2 = result4.find((s) => s.id === 'sugg_2');
    assert.equal(s1?.status, 'approved');
    assert.equal(s2?.status, 'pending');
  });

  it('35. immediate live sync connection and multi-member band synchronization', () => {
    const leader = registerUser({
      email: `lead_multisync_${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Worship Pastor Luke',
    });
    const groupRes = createWorshipGroup(leader.profile.id, 'Main Sanctuary Band', 'Hope Church');
    assert.ok(groupRes.group);
    const groupId = groupRes.group.id;

    // Leader casts Live Session
    const sessionRes = createLiveSession({
      title: 'Sunday Worship Service',
      leaderName: 'Worship Pastor Luke',
      initialSongId: 'song-01',
      initialSemitones: 0,
      setlistSongIds: ['song-01', 'song-02'],
      groupId,
    });
    assert.ok(sessionRes.session);
    assert.equal(sessionRes.session.groupId, groupId);

    // Active session lookup by groupId returns active session immediately (sub-millisecond)
    const discovery = getActiveSessionInfo({ groupId });
    assert.equal(discovery.active, true);
    assert.equal(discovery.session?.sessionId, sessionRes.session.sessionId);
    assert.equal(discovery.session?.leaderName, 'Worship Pastor Luke');

    // Member 1 (Guitarist) joins
    const guitarist = joinLiveSession({
      sessionId: sessionRes.session.sessionId,
      participantName: 'Dan Guitarist',
      instrument: 'guitar',
    });
    assert.equal(guitarist.session.sessionId, sessionRes.session.sessionId);
    assert.equal(guitarist.session.sharedState.songId, 'song-01');

    // Member 2 (Bassist) joins using join code
    const bassist = joinLiveSession({
      joinCode: sessionRes.session.joinCode,
      participantName: 'Ben Bassist',
      instrument: 'bass',
    });
    assert.equal(bassist.session.sessionId, sessionRes.session.sessionId);

    // Leader changes song to song-02, transposes +2, and highlights Chorus
    const updateRes = updateLiveSessionState(
      sessionRes.session.sessionId,
      sessionRes.participantToken,
      {
        songId: 'song-02',
        officialSemitones: 2,
        activeSectionId: 'Chorus',
        activeSectionLabel: 'Chorus',
      }
    );
    assert.equal(updateRes.sharedState.songId, 'song-02');
    assert.equal(updateRes.sharedState.officialSemitones, 2);
    assert.equal(updateRes.sharedState.activeSectionLabel, 'Chorus');

    // Both guitarist and bassist read updated state instantly
    const guitarSnap = getLiveSessionSnapshot(sessionRes.session.sessionId, guitarist.participantToken);
    const bassSnap = getLiveSessionSnapshot(sessionRes.session.sessionId, bassist.participantToken);

    assert.equal(guitarSnap.session.sharedState.songId, 'song-02');
    assert.equal(guitarSnap.session.sharedState.officialSemitones, 2);
    assert.equal(guitarSnap.session.sharedState.activeSectionLabel, 'Chorus');

    assert.equal(bassSnap.session.sharedState.songId, 'song-02');
    assert.equal(bassSnap.session.sharedState.officialSemitones, 2);
    assert.equal(bassSnap.session.sharedState.activeSectionLabel, 'Chorus');

    // Leader ends session
    const endRes = endLiveSession(sessionRes.session.sessionId, sessionRes.participantToken);
    assert.equal(endRes.status, 'ended');

    // Subsequent discovery returns inactive
    const postEnd = getActiveSessionInfo({ groupId });
    assert.equal(postEnd.active, false);
  });
});
