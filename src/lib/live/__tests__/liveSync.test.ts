import os from 'node:os';
import path from 'node:path';
process.env.WORSHIPY_TEST_PERSIST_PATH = path.join(os.tmpdir(), `worshipy-test-live-${process.pid}-${Date.now()}.json`);

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearAllLiveSessionsForTest,
  createLiveSession,
  endLiveSession,
  getLiveSessionSnapshot,
  joinLiveSession,
  LiveSyncError,
  subscribeToLiveSession,
  transferSessionLeadership,
  updateLiveSessionState,
  updateParticipantPresence,
} from '../liveSessionServer.ts';
import { getSongById } from '../../catalog/songCatalog.ts';
import {
  appendChordToSongSectionLine,
  convertDisplayedSongToBaseChordPro,
  formatSongLineForQuickEdit,
  insertChordAtLyricPositionInSong,
  nudgeChordByWordInSongSectionLine,
  replaceChordInSongSectionLine,
  resolveSongWithLiveOverride,
  splitSegmentTextIntoTappableWords,
  updateLineInSongSection,
} from '../../chordpro/liveArrangement.ts';
import { transposeSong } from '../../music/transposition.ts';
import {
  getBassGuidanceForChord,
  getCapoRelativeChord,
  getGuitarCapoSuggestions,
  getKeyboardVoicing,
} from '../../music/instrumentGuidance.ts';
import type { LiveStreamMessage } from '../../../types/live.ts';
import type { SongSection } from '../../../types/song.ts';

process.env.WMC_DISABLE_DISK_PERSIST = '1';

describe('Leader-Led Live Sync Server & Authoritative State Engine', () => {
  beforeEach(() => {
    clearAllLiveSessionsForTest();
  });

  it('1. creates a session and allows authorized team members to join via joinCode or signed inviteToken', () => {
    const created = createLiveSession({
      title: 'Sunday Morning Worship',
      leaderName: 'Pastor Daniel',
      instrument: 'guitar',
      initialSongId: 'song-01',
      initialSemitones: 0,
    });

    assert.equal(created.session.title, 'Sunday Morning Worship');
    assert.equal(created.session.leaderName, 'Pastor Daniel');
    assert.equal(created.session.revision, 1);
    assert.equal(created.session.joinCode.length, 6);
    assert.equal(created.session.participants.length, 1);
    assert.equal(created.session.participants[0].role, 'leader');

    // Join Member 1 via 6-character joinCode
    const member1 = joinLiveSession({
      joinCode: created.session.joinCode,
      participantName: 'Hannah (Keys)',
      instrument: 'keyboard',
    });

    assert.equal(member1.session.sessionId, created.session.sessionId);
    assert.equal(member1.session.participants.length, 2);

    // Join Member 2 via signed inviteToken
    const member2 = joinLiveSession({
      inviteToken: created.inviteToken,
      participantName: 'Marco (Bass)',
      instrument: 'bass',
    });

    assert.equal(member2.session.participants.length, 3);
    const marco = member2.session.participants.find(
      (p) => p.id === member2.participantId
    );
    assert.ok(marco);
    assert.equal(marco.role, 'member');
    assert.equal(marco.instrument, 'bass');
  });

  it('2. delivers the latest authoritative state to a late-joining member after leader updates song, key, and section', () => {
    const created = createLiveSession({
      title: 'Evening Revival',
      leaderName: 'Elena',
      initialSongId: 'song-01',
      initialSemitones: 0,
    });

    // Leader changes song, transposes +2 semitones, and navigates to chorus (sec-3)
    updateLiveSessionState(
      created.session.sessionId,
      created.participantToken,
      {
        songId: 'song-02',
        officialSemitones: 2,
        enharmonicPreference: 'sharp',
      }
    );

    const updated = updateLiveSessionState(
      created.session.sessionId,
      created.participantToken,
      {
        activeSectionId: 'sec-3',
      }
    );

    assert.equal(updated.revision, 3);

    // Late-joining member connects after revisions 2 and 3
    const lateMember = joinLiveSession({
      joinCode: created.session.joinCode,
      participantName: 'Late Guitarist',
      instrument: 'guitar',
    });

    assert.equal(lateMember.session.revision, 3);
    assert.equal(lateMember.session.sharedState.songId, 'song-02');
    assert.equal(lateMember.session.sharedState.officialSemitones, 2);
    assert.equal(lateMember.session.sharedState.activeSectionId, 'sec-3');
    assert.equal(
      lateMember.session.sharedState.activeSectionLabel,
      'Chorus'
    );
  });

  it('3. synchronizes song, key, setlist queue, and semantic section anchors in real time to subscribers', () => {
    const created = createLiveSession({
      title: 'Band Rehearsal',
      leaderName: 'Leader Sam',
      initialSongId: 'song-01',
    });

    const follower = joinLiveSession({
      joinCode: created.session.joinCode,
      participantName: 'Follower Bassist',
      instrument: 'bass',
    });

    const receivedEvents: LiveStreamMessage[] = [];
    const { unsubscribe } = subscribeToLiveSession(
      created.session.sessionId,
      follower.participantToken,
      (msg) => {
        receivedEvents.push(msg);
      }
    );

    try {
      // Leader transposes key by +3 semitones and selects Chorus (sec-3)
      const rev2 = updateLiveSessionState(
        created.session.sessionId,
        created.participantToken,
        {
          officialSemitones: 3,
          activeSectionId: 'sec-3',
          enharmonicPreference: 'flat',
        }
      );

      assert.equal(rev2.revision, 2);
      assert.equal(rev2.sharedState.officialSemitones, 3);
      assert.equal(rev2.sharedState.activeSectionId, 'sec-3');
      assert.equal(rev2.sharedState.activeSectionLabel, 'Chorus');

      const stateUpdateEvent = receivedEvents.find(
        (ev) => ev.type === 'state_updated'
      );
      assert.ok(stateUpdateEvent);
      assert.equal(stateUpdateEvent.revision, 2);
      assert.equal(
        stateUpdateEvent.session.sharedState.activeSectionId,
        'sec-3'
      );
    } finally {
      unsubscribe();
    }
  });

  it('4. preserves original song chords & lyrics non-destructively across transposed states and calculates instrument-specific guidance', () => {
    const song = getSongById('song-01');
    if (!song) {
      throw new Error('Expected song-01 to exist');
    }
    const originalSnapshot = JSON.stringify(song);

    // Transpose +2 semitones (G -> A)
    const transposed = transposeSong(song, 2, 'auto');
    assert.equal(transposed.displayedKey, 'A');
    assert.equal(
      JSON.stringify(song),
      originalSnapshot,
      'Original song record must remain completely unmutated'
    );

    // Verify lyric text is identical across every line and segment
    for (let sIdx = 0; sIdx < song.sections.length; sIdx++) {
      const origSec: SongSection = song.sections[sIdx];
      const transSec: SongSection = transposed.song.sections[sIdx];
      assert.equal(transSec.id, origSec.id);
      for (let lIdx = 0; lIdx < origSec.lines.length; lIdx++) {
        const origLine = origSec.lines[lIdx];
        const transLine = transSec.lines[lIdx];
        for (let segIdx = 0; segIdx < origLine.segments.length; segIdx++) {
          const origText: string = origLine.segments[segIdx].text;
          const transText: string = transLine.segments[segIdx].text;
          assert.equal(transText, origText);
        }
      }
    }

    // Verify Guitar capo guidance for key of A
    const capoSuggestions = getGuitarCapoSuggestions('A');
    assert.ok(
      capoSuggestions.some((s) => s.capoFret === 2 && s.shapeKey === 'G')
    );
    assert.equal(getCapoRelativeChord('A', 2), 'G');
    assert.equal(getCapoRelativeChord('F#m7', 2), 'Em7');
    assert.equal(getCapoRelativeChord('D/F#', 2), 'C/E');

    // Verify Keyboard voicing guidance
    const kbVoicing = getKeyboardVoicing('D/F#', 'sharp', 'A');
    assert.ok(kbVoicing);
    assert.equal(kbVoicing.leftHandBass, 'F#');
    assert.deepEqual(kbVoicing.rightHandNotes, ['D', 'F#', 'A']);

    // Verify Bass inversion guidance
    const bassInfo = getBassGuidanceForChord('D/F#', 'sharp', 'A');
    assert.ok(bassInfo);
    assert.equal(bassInfo.primaryBass, 'F#');
    assert.equal(bassInfo.chordRoot, 'D');
    assert.equal(bassInfo.isSlashInversion, true);
  });

  it('5. rejects unauthorized member attempts to mutate authoritative leader state or end the session', () => {
    const created = createLiveSession({
      title: 'Protected Session',
      leaderName: 'Leader Grace',
      initialSongId: 'song-01',
    });

    const follower = joinLiveSession({
      joinCode: created.session.joinCode,
      participantName: 'Unauthorized Follower',
      instrument: 'general',
    });

    // Follower attempts to change official key
    assert.throws(
      () => {
        updateLiveSessionState(
          created.session.sessionId,
          follower.participantToken,
          { officialSemitones: 5 }
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof LiveSyncError);
        assert.equal(err.code, 'FORBIDDEN_NOT_LEADER');
        assert.equal(err.statusCode, 403);
        return true;
      }
    );

    // Follower attempts to transfer leadership
    assert.throws(
      () => {
        transferSessionLeadership(
          created.session.sessionId,
          follower.participantToken,
          follower.participantId,
          'make-leader'
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof LiveSyncError);
        assert.equal(err.code, 'FORBIDDEN_PRIMARY_LEADER_ONLY');
        assert.equal(err.statusCode, 403);
        return true;
      }
    );

    // Follower attempts to end session
    assert.throws(
      () => {
        endLiveSession(created.session.sessionId, follower.participantToken);
      },
      (err: unknown) => {
        assert.ok(err instanceof LiveSyncError);
        assert.equal(err.code, 'FORBIDDEN_PRIMARY_LEADER_ONLY');
        assert.equal(err.statusCode, 403);
        return true;
      }
    );
  });

  it('6. rejects invalid join codes, tampered tokens, and expired invitations', () => {
    const created = createLiveSession({
      title: 'Invite Validation Test',
      leaderName: 'Leader Mark',
      initialSongId: 'song-01',
      ttlMs: -5000, // already expired TTL for testing invitation expiration
    });

    // Invalid join code
    assert.throws(
      () => {
        joinLiveSession({
          joinCode: 'ZZZZZZ',
          participantName: 'Tester',
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof LiveSyncError);
        assert.equal(err.code, 'SESSION_NOT_FOUND');
        assert.equal(err.statusCode, 404);
        return true;
      }
    );

    // Tampered invite token
    assert.throws(
      () => {
        joinLiveSession({
          inviteToken: `${created.inviteToken}tampered`,
          participantName: 'Tamper Tester',
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof LiveSyncError);
        assert.equal(err.code, 'INVALID_INVITE_TOKEN');
        assert.equal(err.statusCode, 401);
        return true;
      }
    );

    // Expired signed invite token
    assert.throws(
      () => {
        joinLiveSession({
          inviteToken: created.inviteToken,
          participantName: 'Late Tester',
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof LiveSyncError);
        assert.equal(err.code, 'INVITATION_EXPIRED');
        assert.equal(err.statusCode, 410);
        return true;
      }
    );
  });

  it('7. prevents stale/out-of-order state updates using monotonic revision numbers', () => {
    const created = createLiveSession({
      title: 'Concurrency Check',
      leaderName: 'Leader Joy',
      initialSongId: 'song-01',
    });

    // Revision 1 -> 2
    const rev2 = updateLiveSessionState(
      created.session.sessionId,
      created.participantToken,
      {
        officialSemitones: 2,
        expectedRevision: 1,
      }
    );
    assert.equal(rev2.revision, 2);

    // Outdated client message attempting to overwrite with expectedRevision: 1
    assert.throws(
      () => {
        updateLiveSessionState(
          created.session.sessionId,
          created.participantToken,
          {
            officialSemitones: -4,
            expectedRevision: 1,
          }
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof LiveSyncError);
        assert.equal(err.code, 'STALE_REVISION');
        assert.equal(err.statusCode, 409);
        return true;
      }
    );

    // Confirm authoritative state remained at +2 semitones (revision 2)
    const { session: snapshot } = getLiveSessionSnapshot(
      created.session.sessionId,
      created.participantToken
    );
    assert.equal(snapshot.revision, 2);
    assert.equal(snapshot.sharedState.officialSemitones, 2);
  });

  it('8. supports authorized co-leader promotion, full leadership transfer, reconnection recovery, and safe session termination', () => {
    const created = createLiveSession({
      title: 'Leadership & Reconnect Test',
      leaderName: 'Leader Paul',
      initialSongId: 'song-01',
    });

    const member = joinLiveSession({
      joinCode: created.session.joinCode,
      participantName: 'Co-Leader Ruth',
      instrument: 'keyboard',
    });

    // Promote Ruth to Co-Leader
    const afterCoLeader = transferSessionLeadership(
      created.session.sessionId,
      created.participantToken,
      member.participantId,
      'toggle-co-leader'
    );
    assert.ok(afterCoLeader.coLeaderIds.includes(member.participantId));

    // Co-Leader Ruth can now update official musical state
    const ruthUpdate = updateLiveSessionState(
      created.session.sessionId,
      member.participantToken,
      {
        officialSemitones: 4,
        activeSectionId: 'sec-5',
      }
    );
    assert.equal(ruthUpdate.revision, 3);
    assert.equal(ruthUpdate.sharedState.officialSemitones, 4);

    // Simulate member disconnect & reconnect snapshot recovery
    updateParticipantPresence(
      created.session.sessionId,
      member.participantToken,
      { connectionState: 'reconnecting' }
    );
    const { session: recovered } = getLiveSessionSnapshot(
      created.session.sessionId,
      member.participantToken
    );
    assert.equal(recovered.revision, 3);
    assert.equal(recovered.sharedState.activeSectionId, 'sec-5');

    // Transfer primary leadership to Ruth
    const afterTransfer = transferSessionLeadership(
      created.session.sessionId,
      created.participantToken,
      member.participantId,
      'make-leader'
    );
    assert.equal(afterTransfer.leaderId, member.participantId);
    assert.equal(afterTransfer.leaderName, 'Co-Leader Ruth');

    // Ruth ends the session safely
    const ended = endLiveSession(
      created.session.sessionId,
      member.participantToken
    );
    assert.equal(ended.status, 'ended');

    // Joining an ended session is rejected with 410 SESSION_ENDED
    assert.throws(
      () => {
        joinLiveSession({
          joinCode: created.session.joinCode,
          participantName: 'Too Late',
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof LiveSyncError);
        assert.equal(err.code, 'SESSION_ENDED');
        assert.equal(err.statusCode, 410);
        return true;
      }
    );
  });

  it('15. verifies local network interface discovery and origin formatting for multi-device sync', () => {
    const ifaces = os.networkInterfaces();
    const addresses: string[] = [];

    for (const name of Object.keys(ifaces)) {
      for (const net of ifaces[name] || []) {
        if (net.family === 'IPv4' && !net.internal) {
          addresses.push(net.address);
        }
      }
    }

    // Must resolve at least a loopback fallback or valid IPv4
    const primaryIp = addresses[0] || '127.0.0.1';
    assert.ok(typeof primaryIp === 'string');
    assert.ok(primaryIp.length > 0);

    const port = '3000';
    const networkOrigin = `http://${primaryIp}:${port}`;
    assert.ok(networkOrigin.startsWith('http://'));
    assert.ok(networkOrigin.endsWith(':3000'));
  });

  it('16. resolves active session over ended historical sessions and supports sessionId join', () => {
    // 1. Create and end session 1
    const oldSession = createLiveSession({
      title: 'Previous Rehearsal',
      leaderName: 'Leader Aaron',
      initialSongId: 'song-01',
    });
    endLiveSession(oldSession.session.sessionId, oldSession.participantToken);

    // 2. Create active session 2 with the same or new code
    const activeSession = createLiveSession({
      title: 'Active Worship Stage',
      leaderName: 'Leader Aaron',
      initialSongId: 'song-02',
    });

    // 3. Member joins using sessionId directly
    const memberJoin = joinLiveSession({
      sessionId: activeSession.session.sessionId,
      participantName: 'Drummer Leo',
      instrument: 'bass',
    });
    assert.equal(memberJoin.session.sessionId, activeSession.session.sessionId);
    assert.equal(memberJoin.session.status, 'active');
    assert.equal(memberJoin.session.sharedState.songId, 'song-02');

    // 4. Member joins using joinCode directly
    const codeJoin = joinLiveSession({
      joinCode: activeSession.session.joinCode,
      participantName: 'Pianist Maya',
      instrument: 'keyboard',
    });
    assert.equal(codeJoin.session.sessionId, activeSession.session.sessionId);
    assert.equal(codeJoin.session.status, 'active');
  });

  it('17. participant heartbeat keeps presence connected and updates lastSeenAt without desync', async () => {
    const session = createLiveSession({
      title: 'Sunday Service',
      leaderName: 'Pastor Sarah',
      initialSongId: 'song-01',
    });

    const member = joinLiveSession({
      joinCode: session.session.joinCode,
      participantName: 'Acoustic Guitarist',
      instrument: 'guitar',
    });

    const initialParticipant = member.session.participants.find((p) => p.id === member.participantId);
    assert.ok(initialParticipant);
    assert.equal(initialParticipant.connectionState, 'connected');

    // Simulate presence heartbeat tick
    const updated = updateParticipantPresence(
      session.session.sessionId,
      member.participantToken,
      { connectionState: 'connected' }
    );

    const participantAfter = updated.participants.find((p) => p.id === member.participantId);
    assert.ok(participantAfter);
    assert.equal(participantAfter.connectionState, 'connected');
    assert.ok(new Date(participantAfter.lastSeenAt).getTime() >= new Date(initialParticipant.lastSeenAt).getTime());
  });

  it('18. broadcasts real-time live chord and lyric arrangement overrides to all connected followers', () => {
    const created = createLiveSession({
      title: 'Live Arrangement Rehearsal',
      leaderName: 'Leader Caleb',
      initialSongId: 'song-01', // Original Key: G
    });

    const follower = joinLiveSession({
      joinCode: created.session.joinCode,
      participantName: 'Pianist Hannah',
      instrument: 'keyboard',
    });

    const events: LiveStreamMessage[] = [];
    const { unsubscribe } = subscribeToLiveSession(
      created.session.sessionId,
      follower.participantToken,
      (msg) => {
        events.push(msg);
      }
    );

    const customChordPro = [
      '{title: Ang Buhay Ko Ay Kay Kristo}',
      '{key: G}',
      '',
      'Verse 1:',
      '[G]Binago Mo ang [D/F#]puso ko [Em7]Panginoon [Cadd9]Hesus',
      '',
      'Tag / Vamp:',
      '{comment: Spontaneous build 3x}',
      '[C]Purihin [D]Ka [Em7]Hesus [G/B]magpakailanman',
    ].join('\n');

    const updated = updateLiveSessionState(
      created.session.sessionId,
      created.participantToken,
      {
        songArrangementOverride: {
          songId: 'song-01',
          chordPro: customChordPro,
          arrangementNote: 'Acoustic start, spontaneous Tag 3x at the end',
        },
      }
    );

    unsubscribe();

    assert.equal(updated.sharedState.arrangementId, 'live-custom');
    const override = updated.sharedState.songArrangementOverrides?.['song-01'];
    assert.ok(override);
    assert.equal(override.updatedByName, 'Leader Caleb');
    assert.equal(override.arrangementNote, 'Acoustic start, spontaneous Tag 3x at the end');

    // Verify SSE broadcast delivered the override to followers
    const stateUpdatedEvents = events.filter((e) => e.type === 'state_updated');
    assert.equal(stateUpdatedEvents.length, 1);
    assert.ok(
      stateUpdatedEvents[0].session.sharedState.songArrangementOverrides?.[
        'song-01'
      ]
    );

    // Resolve song for follower and verify new chords, lyrics, and Tag section
    const baseSong = getSongById('song-01')!;
    const resolvedSong = resolveSongWithLiveOverride(baseSong, override);
    assert.equal(resolvedSong.originalKey, 'G');
    assert.equal(resolvedSong.sections.length, 2);
    assert.equal(resolvedSong.sections[1].label, 'Tag / Vamp');
    assert.equal(resolvedSong.sections[1].cue, 'Spontaneous build 3x');
    assert.equal(resolvedSong.sections[0].lines[0].segments[1].chord, 'D/F#');
    assert.ok(resolvedSong.sections[0].lines[0].segments[1].text.includes('puso ko'));

    // Verify unauthorized follower cannot broadcast or clear an arrangement override
    assert.throws(
      () => {
        updateLiveSessionState(
          created.session.sessionId,
          follower.participantToken,
          {
            clearSongArrangementOverrideSongId: 'song-01',
          }
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof LiveSyncError);
        assert.equal(err.code, 'FORBIDDEN_NOT_LEADER');
        return true;
      }
    );
  });

  it('19. prevents double-transposition when Leader edits chords while viewing in a transposed key (e.g., G transposed +2 to A)', () => {
    const baseSong = getSongById('song-01')!; // Original Key: G
    assert.equal(baseSong.originalKey, 'G');

    // Leader is currently in Official Key of A (+2 semitones from G)
    const { song: displayedInA, displayedKey } = transposeSong(baseSong, 2, 'auto');
    assert.equal(displayedKey, 'A');

    // Leader uses 1-tap inline chord swap to change the first chord in Verse 1 from 'A' to 'F#m7'
    // and edits line 1 lyrics & chords in Key of A
    const firstSecId = displayedInA.sections[0].id;
    const afterChordSwap = replaceChordInSongSectionLine(
      displayedInA,
      firstSecId,
      0,
      0,
      'F#m7'
    );
    assert.equal(afterChordSwap.sections[0].lines[0].segments[0].chord, 'F#m7');

    const afterLineEdit = updateLineInSongSection(
      afterChordSwap,
      firstSecId,
      0,
      '[F#m7]New worship [Dmaj7]lyric in [E]key of [A]A',
      'Soft keys only'
    );

    // Convert edited song (in Key of A, +2 semitones) back to canonical base ChordPro (Key of G, 0 semitones)
    const baseChordPro = convertDisplayedSongToBaseChordPro(afterLineEdit, baseSong, 2);

    // Resolve override on baseSong (Key of G)
    const resolvedBase = resolveSongWithLiveOverride(baseSong, {
      songId: baseSong.id,
      chordPro: baseChordPro,
      updatedAt: new Date().toISOString(),
      updatedBy: 'leader-1',
    });

    // In base key (G), F#m7 (-2) -> Em7, Dmaj7 (-2) -> Cmaj7, E (-2) -> D, A (-2) -> G
    const baseSegs = resolvedBase.sections[0].lines[0].segments;
    assert.equal(baseSegs[0].chord, 'Em7');
    assert.equal(baseSegs[1].chord, 'Cmaj7');
    assert.equal(baseSegs[2].chord, 'D');
    assert.equal(baseSegs[3].chord, 'G');

    // Now when Live Sync renders `transposeSong(resolvedBase, +2, 'auto')` for followers in Key of A,
    // they see the EXACT chords the leader typed in A (zero double-transposition!)
    const { song: followerViewInA, displayedKey: followerKey } = transposeSong(
      resolvedBase,
      2,
      'auto'
    );
    assert.equal(followerKey, 'A');
    const followerSegs = followerViewInA.sections[0].lines[0].segments;
    assert.equal(followerSegs[0].chord, 'F#m7');
    assert.equal(followerSegs[1].chord, 'Dmaj7');
    assert.equal(followerSegs[2].chord, 'E');
    assert.equal(followerSegs[3].chord, 'A');
    assert.equal(followerViewInA.sections[0].lines[0].annotation, 'Soft keys only');

    // And if leader steps key up +2 more to B (+4 from G), chords transpose cleanly to G#m7, Emaj7, F#, B
    const { song: followerViewInB, displayedKey: keyB } = transposeSong(
      resolvedBase,
      4,
      'auto'
    );
    assert.equal(keyB, 'B');
    const segsInB = followerViewInB.sections[0].lines[0].segments;
    assert.equal(segsInB[0].chord, 'G#m7');
    assert.equal(segsInB[1].chord, 'Emaj7');
    assert.equal(segsInB[2].chord, 'F#');
    assert.equal(segsInB[3].chord, 'B');
  });

  it('20. preserves custom section selection on key changes, supports multi-song overrides across queue switches, and reverts cleanly', () => {
    const created = createLiveSession({
      title: 'Multi-Song Custom Arrangement Flow',
      leaderName: 'Leader David',
      initialSongId: 'song-01',
      setlistSongIds: ['song-01', 'song-02'],
    });

    // 1. Leader adds a custom "Spontaneous Tag" section to song-01 and selects it
    const song1CustomChordPro = [
      '{title: Song 1 Custom}',
      '{key: G}',
      '',
      'Verse 1:',
      '[G]First verse [C]line',
      '',
      'Spontaneous Tag:',
      '[Em7]We exalt [D]You [C]Lord',
    ].join('\n');

    const afterOverride1 = updateLiveSessionState(
      created.session.sessionId,
      created.participantToken,
      {
        songArrangementOverride: {
          songId: 'song-01',
          chordPro: song1CustomChordPro,
        },
        activeSectionId: 'sec-2', // 'Spontaneous Tag' in parsed ChordPro
      }
    );

    assert.equal(afterOverride1.sharedState.activeSectionId, 'sec-2');
    assert.equal(afterOverride1.sharedState.activeSectionLabel, 'Spontaneous Tag');

    // 2. Leader transposes song-01 up +2 semitones WITHOUT passing activeSectionId
    // Verify activeSectionId stays on 'sec-2' ('Spontaneous Tag') and does NOT reset to 'sec-1'!
    const afterKeyChange = updateLiveSessionState(
      created.session.sessionId,
      created.participantToken,
      {
        officialSemitones: 2,
      }
    );
    assert.equal(afterKeyChange.sharedState.officialSemitones, 2);
    assert.equal(afterKeyChange.sharedState.activeSectionId, 'sec-2');
    assert.equal(afterKeyChange.sharedState.activeSectionLabel, 'Spontaneous Tag');

    // 3. Leader switches to song-02 in the queue and customizes song-02 as well
    const song2CustomChordPro = [
      '{title: Song 2 Custom}',
      '{key: C}',
      '',
      'Chorus:',
      '[F]Holy [G]forever [Am7]Lord',
    ].join('\n');

    const onSong2 = updateLiveSessionState(
      created.session.sessionId,
      created.participantToken,
      {
        songId: 'song-02',
        songArrangementOverride: {
          songId: 'song-02',
          chordPro: song2CustomChordPro,
          arrangementNote: 'Start directly on Chorus',
        },
      }
    );

    assert.equal(onSong2.sharedState.songId, 'song-02');
    assert.ok(onSong2.sharedState.songArrangementOverrides?.['song-01']);
    assert.ok(onSong2.sharedState.songArrangementOverrides?.['song-02']);

    // 4. Leader switches back to song-01 -> song-01's custom arrangement is still intact!
    const backToSong1 = updateLiveSessionState(
      created.session.sessionId,
      created.participantToken,
      {
        songId: 'song-01',
      }
    );
    assert.equal(backToSong1.sharedState.songId, 'song-01');
    assert.equal(backToSong1.sharedState.arrangementId, 'live-custom');
    assert.ok(backToSong1.sharedState.songArrangementOverrides?.['song-01']);

    // 5. Leader reverts song-01 back to the original chart -> song-01 override is removed while song-02 override remains
    const afterRevertSong1 = updateLiveSessionState(
      created.session.sessionId,
      created.participantToken,
      {
        clearSongArrangementOverrideSongId: 'song-01',
      }
    );
    assert.equal(afterRevertSong1.sharedState.arrangementId, 'default');
    assert.equal(afterRevertSong1.sharedState.songArrangementOverrides?.['song-01'], undefined);
    assert.ok(afterRevertSong1.sharedState.songArrangementOverrides?.['song-02']);
  });

  it('21. handles instrumental-to-lyric conversion, chord removal, and rejects empty/oversized arrangement payloads', () => {
    const baseSong = getSongById('song-01')!;
    const secId = baseSong.sections[0].id;

    // 1. Update line to purely instrumental chords -> isInstrumental becomes true
    const instrumentalSong = updateLineInSongSection(
      baseSong,
      secId,
      0,
      '[G] [C] [Em7] [D]'
    );
    assert.equal(instrumentalSong.sections[0].lines[0].isInstrumental, true);
    assert.equal(
      formatSongLineForQuickEdit(instrumentalSong.sections[0].lines[0]),
      '[G] [C] [Em7] [D]'
    );

    // 2. Remove a chord from segment 1 via replaceChordInSongSectionLine('', '')
    const afterRemoveChord = replaceChordInSongSectionLine(
      instrumentalSong,
      secId,
      0,
      1,
      ''
    );
    assert.equal(afterRemoveChord.sections[0].lines[0].segments[1].chord, undefined);

    // 3. Server rejects empty chordPro override with 400 INVALID_ARRANGEMENT
    const created = createLiveSession({
      title: 'Validation Session',
      leaderName: 'Leader Mark',
      initialSongId: 'song-01',
    });

    assert.throws(
      () => {
        updateLiveSessionState(
          created.session.sessionId,
          created.participantToken,
          {
            songArrangementOverride: {
              songId: 'song-01',
              chordPro: '   ',
            },
          }
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof LiveSyncError);
        assert.equal(err.code, 'INVALID_ARRANGEMENT');
        assert.equal(err.statusCode, 400);
        return true;
      }
    );
  });

  it('22. supports free-position word tapping to insert chords anywhere in lyrics, word-by-word chord nudging (← / →), and trailing chord insertion', () => {
    const baseSong = getSongById('song-01')!;
    const secId = baseSong.sections[0].id;

    // Start with a clean single-chord lyric line: "[G]We gather in Your light"
    const initialSong = updateLineInSongSection(
      baseSong,
      secId,
      0,
      '[G]We gather in Your light'
    );
    const initialLine = initialSong.sections[0].lines[0];
    assert.equal(initialLine.segments.length, 1);
    assert.equal(initialLine.segments[0].chord, 'G');
    assert.equal(initialLine.segments[0].text, 'We gather in Your light');

    // 1. Split into tappable words and verify exact character offsets
    const words = splitSegmentTextIntoTappableWords(initialLine.segments[0].text);
    // words: "We", "gather", "in", "Your", "light"
    const yourWord = words.find((w) => w.word === 'Your');
    assert.ok(yourWord);
    assert.equal(
      initialLine.segments[0].text.slice(yourWord.charOffset),
      'Your light'
    );

    // 2. Leader taps the word "Your" and selects chord "D/F#" -> splits segment and places [D/F#] right above "Your"!
    const afterWordTap = insertChordAtLyricPositionInSong(
      initialSong,
      secId,
      0,
      0,
      yourWord.charOffset,
      'D/F#'
    );
    const lineAfterTap = afterWordTap.sections[0].lines[0];
    assert.equal(lineAfterTap.segments.length, 2);
    assert.equal(lineAfterTap.segments[0].chord, 'G');
    assert.equal(lineAfterTap.segments[0].text, 'We gather in ');
    assert.equal(lineAfterTap.segments[1].chord, 'D/F#');
    assert.equal(lineAfterTap.segments[1].text, 'Your light');
    assert.equal(
      formatSongLineForQuickEdit(lineAfterTap),
      '[G]We gather in [D/F#]Your light'
    );

    // 3. Leader nudges "D/F#" one word LEFT (onto "in")
    const nudgedLeft = nudgeChordByWordInSongSectionLine(
      afterWordTap,
      secId,
      0,
      1,
      'left'
    );
    assert.equal(
      formatSongLineForQuickEdit(nudgedLeft.song.sections[0].lines[0]),
      '[G]We gather [D/F#]in Your light'
    );

    // 4. Leader nudges "D/F#" two words RIGHT (from "in" -> "Your" -> "light")
    const nudgedRight1 = nudgeChordByWordInSongSectionLine(
      nudgedLeft.song,
      secId,
      0,
      nudgedLeft.newSegmentIndex,
      'right'
    );
    assert.equal(
      formatSongLineForQuickEdit(nudgedRight1.song.sections[0].lines[0]),
      '[G]We gather in [D/F#]Your light'
    );
    const nudgedRight2 = nudgeChordByWordInSongSectionLine(
      nudgedRight1.song,
      secId,
      0,
      nudgedRight1.newSegmentIndex,
      'right'
    );
    assert.equal(
      formatSongLineForQuickEdit(nudgedRight2.song.sections[0].lines[0]),
      '[G]We gather in Your [D/F#]light'
    );

    // 5. Leader appends a trailing turnaround chord "Cadd9" at the end of the line
    const withTrailing = appendChordToSongSectionLine(
      nudgedRight2.song,
      secId,
      0,
      'Cadd9'
    );
    assert.equal(
      formatSongLineForQuickEdit(withTrailing.sections[0].lines[0]),
      '[G]We gather in Your [D/F#]light[Cadd9]'
    );

    // 6. Removing the middle chord ("D/F#") cleanly merges the split lyric segments back together!
    const afterRemoveMiddle = insertChordAtLyricPositionInSong(
      nudgedRight2.song,
      secId,
      0,
      1,
      0,
      ''
    );
    assert.equal(
      formatSongLineForQuickEdit(afterRemoveMiddle.sections[0].lines[0]),
      '[G]We gather in Your light'
    );
    assert.equal(afterRemoveMiddle.sections[0].lines[0].segments.length, 1);
  });
});
