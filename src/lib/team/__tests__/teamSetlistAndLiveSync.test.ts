import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  registerUser,
  createWorshipGroup,
  getWorshipGroup,
  updateWorshipGroupBranding,
} from '../../cloud/cloudDb.ts';
import type { TeamActiveSetlist } from '../../../types/auth.ts';

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
});
