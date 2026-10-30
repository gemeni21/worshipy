/**
 * Team Hub stability / anti-flicker regression tests.
 *
 * These tests simulate the browser environment (window, localStorage, focus events)
 * and a hosted (serverless) Cloud Hub where consecutive polls of `/api/groups/:id`
 * can land on different server instances holding different copies of the group.
 * Before the fix, the Team Hub re-rendered with alternating data every poll
 * ("non-stop glitching").
 */
import os from 'node:os';
import path from 'node:path';
const testDataDir = path.join(
  os.tmpdir(),
  `worshipy-test-stability-${process.pid}-${Date.now()}`
);
process.env.WORSHIPY_USER_DATA = testDataDir;
process.env.WORSHIPY_TEST_PERSIST_PATH = path.join(testDataDir, 'cloud-store.json');

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { WorshipGroup } from '../../../types/auth.ts';

// IMPORTANT: Load modules BEFORE installing the `window` shim so the Firebase SDK
// does not initialize a real Firestore connection inside the test process.
const teamService = await import('../teamService.ts');
const cloudDb = await import('../../cloud/cloudDb.ts');
const {
  subscribeToTeam,
  setCachedTeam,
  getCachedTeam,
  isStaleServerGroupPayload,
  areTeamGroupsEquivalent,
  reconcileTeamGroup,
  mergeSuggestedArrangements,
  recordDismissedSuggestionId,
  resetServerRevisionTrackingForTest,
} = teamService as typeof teamService & Record<string, any>;

// ---------------------------------------------------------------------------
// Minimal browser shims (installed after module load; read lazily at call time)
// ---------------------------------------------------------------------------
const memoryStorage = new Map<string, string>();
const fakeLocalStorage = {
  getItem: (k: string) => (memoryStorage.has(k) ? memoryStorage.get(k)! : null),
  setItem: (k: string, v: string) => {
    memoryStorage.set(k, String(v));
  },
  removeItem: (k: string) => {
    memoryStorage.delete(k);
  },
  clear: () => memoryStorage.clear(),
  key: (i: number) => Array.from(memoryStorage.keys())[i] ?? null,
  get length() {
    return memoryStorage.size;
  },
};
const fakeWindow = new EventTarget() as EventTarget & Record<string, unknown>;
fakeWindow.localStorage = fakeLocalStorage;
fakeWindow.sessionStorage = fakeLocalStorage;
(globalThis as any).window = fakeWindow;
(globalThis as any).localStorage = fakeLocalStorage;
(globalThis as any).document = { visibilityState: 'visible' };

type FetchHandler = (url: string) => { status: number; body: unknown };
let fetchHandler: FetchHandler = () => ({ status: 404, body: { error: 'not found' } });
let fetchCount = 0;
(globalThis as any).fetch = async (input: unknown) => {
  fetchCount += 1;
  const url = String(input);
  const { status, body } = fetchHandler(url);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(JSON.stringify(body)),
  };
};

const flush = () => new Promise((r) => setTimeout(r, 5));

function makeGroup(overrides: Partial<WorshipGroup> = {}): WorshipGroup {
  return {
    id: 'group_stability',
    name: 'Bethel M Worship',
    churchName: 'Bethel M',
    inviteCode: 'BETHEL',
    ownerId: 'leader_1',
    createdAt: '2026-10-01T00:00:00.000Z',
    members: [
      {
        userId: 'leader_1',
        email: 'leader@bethel.org',
        displayName: 'Leader',
        role: 'leader',
        joinedAt: '2026-10-01T00:00:00.000Z',
      },
      {
        userId: 'member_1',
        email: 'guitar@bethel.org',
        displayName: 'Guitarist',
        role: 'member',
        instrument: 'Guitar',
        joinedAt: '2026-10-02T00:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

const freshSetlist = {
  id: 'setlist_sunday',
  name: 'Sunday Lineup',
  publishedAt: '2026-10-30T00:00:00.000Z',
  publishedBy: 'leader_1',
  publishedByName: 'Leader',
  items: [{ songId: 'song-01', addedAt: '2026-10-30T00:00:00.000Z' }],
};

async function pollTimes(n: number) {
  for (let i = 0; i < n; i++) {
    fakeWindow.dispatchEvent(new Event('focus'));
    await flush();
  }
}

describe('Team Hub stability (anti-flicker)', () => {
  beforeEach(() => {
    memoryStorage.clear();
    fetchCount = 0;
    resetServerRevisionTrackingForTest?.();
  });

  it('1. alternating stale/fresh server instances do NOT cause non-stop re-renders', async () => {
    const fresh = makeGroup({ activeSetlist: freshSetlist as any, serverRevision: 2000 });
    const stale = makeGroup({ serverRevision: 1000 }); // older instance: no setlist yet
    let toggle = 0;
    fetchHandler = () => {
      toggle += 1;
      return { status: 200, body: { group: toggle % 2 === 1 ? fresh : stale } };
    };

    const emissions: Array<WorshipGroup | null> = [];
    const unsub = subscribeToTeam('group_stability', (g) => emissions.push(g));
    await flush();
    await pollTimes(8);
    unsub();

    assert.ok(fetchCount >= 8, 'should have polled several times');
    assert.equal(
      emissions.length,
      1,
      `expected exactly 1 render-worthy update, got ${emissions.length}`
    );
    assert.equal(emissions[0]?.activeSetlist?.id, 'setlist_sunday');
    assert.equal(getCachedTeam()?.activeSetlist?.id, 'setlist_sunday');
  });

  it('2. identical payloads with different key order are treated as equal (no re-render)', async () => {
    const a = makeGroup({ activeSetlist: freshSetlist as any, serverRevision: 3000 });
    // Same content, reversed key order
    const b = Object.fromEntries(Object.entries(a).reverse()) as WorshipGroup;
    assert.equal(areTeamGroupsEquivalent(a, b), true);

    let toggle = 0;
    fetchHandler = () => {
      toggle += 1;
      return { status: 200, body: { group: toggle % 2 ? a : b } };
    };
    const emissions: unknown[] = [];
    const unsub = subscribeToTeam('group_stability', (g) => emissions.push(g));
    await flush();
    await pollTimes(6);
    unsub();
    assert.equal(emissions.length, 1);
  });

  it('3. a genuinely newer revision still propagates immediately', async () => {
    const v1 = makeGroup({ serverRevision: 5000 });
    const v2 = makeGroup({ activeSetlist: freshSetlist as any, serverRevision: 6000 });
    let current: WorshipGroup = v1;
    fetchHandler = () => ({ status: 200, body: { group: current } });

    const emissions: Array<WorshipGroup | null> = [];
    const unsub = subscribeToTeam('group_stability', (g) => emissions.push(g));
    await flush();
    await pollTimes(2);
    current = v2;
    await pollTimes(3);
    unsub();

    assert.equal(emissions.length, 2);
    assert.equal(emissions[1]?.activeSetlist?.id, 'setlist_sunday');
  });

  it('4. a 404 from a cold server instance never wipes the cached team', async () => {
    const cached = makeGroup({ activeSetlist: freshSetlist as any, serverRevision: 7000 });
    setCachedTeam(cached);
    fetchHandler = () => ({ status: 404, body: { error: 'Group not found.' } });

    const emissions: Array<WorshipGroup | null> = [];
    const unsub = subscribeToTeam('group_stability', (g) => emissions.push(g));
    await flush();
    await pollTimes(5);
    unsub();

    assert.equal(emissions.length, 1, 'only the initial cached emission');
    assert.equal(emissions.every((g) => g !== null), true);
    assert.equal(getCachedTeam()?.activeSetlist?.id, 'setlist_sunday');
  });

  it('5. revision seeding from cache blocks a stale instance right after page reload', () => {
    setCachedTeam(makeGroup({ serverRevision: 9000 }));
    assert.equal(isStaleServerGroupPayload(makeGroup({ serverRevision: 8000 })), true);
    assert.equal(isStaleServerGroupPayload(makeGroup({ serverRevision: 9000 })), false);
    assert.equal(isStaleServerGroupPayload(makeGroup({ serverRevision: 9500 })), false);
    assert.equal(isStaleServerGroupPayload(makeGroup({ serverRevision: 9100 })), true);
    // Legacy payloads without a revision are never considered stale
    assert.equal(isStaleServerGroupPayload(makeGroup()), false);
  });

  it('6. server stamps serverRevision only when group content actually changes', async () => {
    const reg = cloudDb.registerUser({
      email: `stability_${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Stability Leader',
      churchName: 'Bethel M',
    });
    const created = cloudDb.createWorshipGroup(reg.profile.id, 'Stability Team', 'Bethel M');
    assert.equal(created.ok, true, created.error);
    const groupId = created.group!.id;
    const rev1 = cloudDb.getWorshipGroup(groupId)!.serverRevision;
    assert.equal(typeof rev1, 'number');

    // Unrelated store write (another user registers) must NOT bump this group's revision
    await new Promise((r) => setTimeout(r, 5));
    cloudDb.registerUser({
      email: `stability_other_${Date.now()}@example.com`,
      password: 'Password123!',
      displayName: 'Other',
    });
    assert.equal(cloudDb.getWorshipGroup(groupId)!.serverRevision, rev1);

    // A real change to the group bumps the revision
    await new Promise((r) => setTimeout(r, 5));
    const branded = cloudDb.updateWorshipGroupBranding(reg.profile.id, groupId, {
      customAppTitle: 'Bethel Worship',
    });
    assert.equal(branded.ok, true, branded.error);
    const rev2 = cloudDb.getWorshipGroup(groupId)!.serverRevision!;
    assert.ok(rev2 > (rev1 as number), `revision should increase (${rev1} -> ${rev2})`);
  });

  it('7. Firestore snapshot with internal fields (memberIds, updatedAt, system meta-takes, null optional fields) vs Server API payload produces zero extra re-renders', async () => {
    const serverPayload = makeGroup({
      activeSetlist: freshSetlist as any,
      serverRevision: 10000,
    });
    const firestorePayload = {
      ...makeGroup({ activeSetlist: freshSetlist as any }),
      churchName: 'Bethel M',
      customAppTitle: null,
      customAppLogoUrl: null,
      memberIds: ['leader_1', 'member_1'],
      memberUids: ['leader_1', 'member_1'],
      updatedAt: '2026-10-30T12:00:00.000Z',
      practiceTakes: [
        {
          id: '__wmc_active_setlist_meta__',
          songId: '__system_meta__',
          songTitle: 'Upcoming Setlist Lineup',
          title: 'Sunday Lineup',
          authorName: 'Leader',
          authorId: 'leader_1',
          createdAt: '2026-10-30T00:00:00.000Z',
          durationSeconds: 0,
          notes: JSON.stringify(freshSetlist),
        },
      ],
    } as unknown as WorshipGroup;

    const reconciledFromServer = reconcileTeamGroup(serverPayload, null);
    const reconciledFromFirestore = reconcileTeamGroup(firestorePayload, reconciledFromServer);

    assert.equal(areTeamGroupsEquivalent(reconciledFromServer, reconciledFromFirestore), true);
    assert.equal('memberIds' in (reconciledFromFirestore as any), false);
    assert.equal('updatedAt' in (reconciledFromFirestore as any), false);
    assert.equal(reconciledFromFirestore.practiceTakes, undefined);
  });

  it('8. mergeSuggestedArrangements enforces terminal state invariance (approved/declined never reverts to pending) and filters dismissed IDs', () => {
    const approvedProposal = {
      id: 'arr_prop_1',
      songId: 'song-01',
      songTitle: 'Song 1',
      instrument: 'guitar' as const,
      chordPro: '[G]Approved [C]chords',
      suggestedBy: 'member_1',
      suggestedByName: 'Guitarist',
      suggestedAt: '2026-10-30T01:00:00.000Z',
      status: 'approved' as const,
      reviewedAt: '2026-10-30T02:00:00.000Z',
    };
    const stalePendingProposal = {
      ...approvedProposal,
      status: 'pending' as const,
      reviewedAt: undefined,
    };

    // Stale server/Firestore payload with 'pending' must NEVER demote 'approved' back to 'pending'
    const merged = mergeSuggestedArrangements([stalePendingProposal], [approvedProposal]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].status, 'approved');

    // Once dismissed by the member, it is never resurrected even if a stale response still includes it
    recordDismissedSuggestionId('arr_prop_1');
    const afterDismiss = mergeSuggestedArrangements([approvedProposal], [approvedProposal]);
    assert.equal(afterDismiss.length, 0);
  });

  it('9. Firestore snapshot missing activeSetlist (undefined) preserves cached activeSetlist while explicit null clears it', () => {
    const withSetlist = reconcileTeamGroup(
      makeGroup({ activeSetlist: freshSetlist as any }),
      null
    );
    assert.equal(withSetlist.activeSetlist?.id, 'setlist_sunday');

    // Partial update omitting activeSetlist (undefined) must preserve existing activeSetlist
    const partialUpdate = reconcileTeamGroup(
      makeGroup({ activeSetlist: undefined }),
      withSetlist
    );
    assert.equal(partialUpdate.activeSetlist?.id, 'setlist_sunday');

    // Explicit clear (null) must clear activeSetlist
    const clearedUpdate = reconcileTeamGroup(
      makeGroup({ activeSetlist: null as any }),
      withSetlist
    );
    assert.equal(clearedUpdate.activeSetlist, undefined);
  });
});
