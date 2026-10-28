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
} from '../../cloud/cloudDb.ts';
import {
  createLiveSession,
  joinLiveSession,
  updateLiveSessionState,
  clearAllLiveSessionsForTest,
  endLiveSession,
  getLiveSessionSnapshot,
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
    assert.equal(manualClear.group?.activeSetlist, undefined);
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
});
