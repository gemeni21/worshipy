'use client';

import React, {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Crown,
  Guitar,
  Headphones,
  Link2,
  ListMusic,
  Minus,
  Music,
  Piano,
  Plus,
  QrCode,
  Radio,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sliders,
  UserCheck,
  Users,
  Wifi,
  WifiOff,
  XCircle,
  Loader2,
  Edit3,
  Sparkles,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { apiUrl, getCloudHubUrl } from '@/lib/api/apiClient';
import { getAllSongs, getSongById } from '@/lib/catalog/songCatalog';
import {
  getSuggestedChordsForKey,
  insertChordAtCursor,
} from '@/lib/chordpro/chordPro';
import {
  appendChordToSongSectionLine,
  convertDisplayedSongToBaseChordPro,
  formatSongLineForQuickEdit,
  getPersonalInstrumentArrangements,
  insertChordAtLyricPositionInSong,
  makeArrangementCompositeKey,
  nudgeChordByWordInSongSectionLine,
  removePersonalInstrumentArrangement,
  replaceChordInSongSectionLine,
  resolveLayeredSongArrangement,
  resolveSongWithLiveOverride,
  savePersonalInstrumentArrangement,
  splitSegmentTextIntoTappableWords,
  updateLineInSongSection,
  type PreferredArrangementLayerMode,
} from '@/lib/chordpro/liveArrangement';
import {
  formatSignedSemitones,
  getDestinationKeyOptions,
  normalizeSemitones,
  transposeSong,
  transposeKey,
} from '@/lib/music/transposition';
import {
  getBassGuidanceForChord,
  getCapoRelativeChord,
  getGuitarCapoSuggestions,
  getKeyboardVoicing,
} from '@/lib/music/instrumentGuidance';
import { LiveSyncQrModal } from '@/components/live/LiveSyncQrModal';
import { LiveArrangementEditorModal } from '@/components/live/LiveArrangementEditorModal';
import { ReferenceAudioPlayer } from '@/components/audio/ReferenceAudioPlayer';
import {
  setTeamActiveLiveSession,
  clearTeamActiveLiveSession,
  getCachedTeam,
  setCachedTeam,
  broadcastTeamSync,
  subscribeToTeam,
  getSessionToken,
} from '@/lib/team/teamService';
import type { TeamSongArrangement, WorshipGroup } from '@/types/auth';
import {
  SESSION_CREDENTIALS_STORAGE_KEY,
  type CreateLiveSessionResponse,
  type InstrumentViewMode,
  type JoinLiveSessionResponse,
  type LiveArrangementProposal,
  type LiveSessionSnapshot,
  type LiveStreamMessage,
  type UpdateSharedStateInput,
  type StoredLiveCredentials,
} from '@/types/live';
import type { EnharmonicPreference, SongLine } from '@/types/song';

function isLineInstrumental(line: SongLine): boolean {
  if (line.isInstrumental) return true;
  return line.segments.every((seg) => seg.text.trim() === '');
}

const INSTRUMENT_LABELS: Record<InstrumentViewMode, string> = {
  general: 'General Chart',
  guitar: 'Guitar View',
  keyboard: 'Keyboard View',
  bass: 'Bass View',
};

function LiveSyncWorkspace({
  initialJoinCode,
  initialInviteToken,
  initialStartSongId,
  initialStartSemitones,
  initialStartSetlistId,
}: {
  initialJoinCode: string;
  initialInviteToken: string;
  initialStartSongId: string;
  initialStartSemitones: number;
  initialStartSetlistId: string;
}) {
  const { setlists, saveCustomSong } = useApp();
  const allSongs = getAllSongs();

  // Active session & credentials state
  const [session, setSession] = useState<LiveSessionSnapshot | null>(null);
  const [participantId, setParticipantId] = useState<string>('');
  const [participantToken, setParticipantToken] = useState<string>('');
  const [inviteToken, setInviteToken] = useState<string>('');

  // Connection & synchronization state
  const [streamStatus, setStreamStatus] = useState<
    'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error' | 'ended'
  >('idle');
  const [simulatedDisconnect, setSimulatedDisconnect] = useState(false);

  // Follower vs. Independent Browsing mode
  const [viewMode, setViewMode] = useState<'follow' | 'independent'>('follow');
  const [independentSongId, setIndependentSongId] = useState<string>('');
  const [independentSemitones, setIndependentSemitones] = useState<number>(0);
  const [independentSectionId, setIndependentSectionId] = useState<string>('');
  const [independentSpelling, setIndependentSpelling] =
    useState<EnharmonicPreference>('auto');

  // Instrument-specific view state
  const [instrumentView, setInstrumentView] =
    useState<InstrumentViewMode>('general');
  const [selectedCapoFret, setSelectedCapoFret] = useState<number>(0);

  // Authenticated user & team state
  const { user, activeGroup, refreshActiveGroup } = useAuth();
  const [showLiveAudioPlayer, setShowLiveAudioPlayer] = useState(false);
  const [showManualJoinForm, setShowManualJoinForm] = useState(false);
  const [liveGroup, setLiveGroup] = useState<WorshipGroup | null>(() => getCachedTeam());

  const effectiveGroup = liveGroup || activeGroup || getCachedTeam();
  const targetGroupId = effectiveGroup?.id || user?.groupId;
  const isTeamMember = Boolean(targetGroupId);
  const isOwnerLeader = Boolean(
    user && (effectiveGroup?.ownerId === user.id || user.groupRole === 'leader')
  );

  useEffect(() => {
    if (activeGroup) {
      setLiveGroup(activeGroup);
    }
  }, [activeGroup]);

  useEffect(() => {
    if (!targetGroupId) return;
    const unsub = subscribeToTeam(targetGroupId, (updated: WorshipGroup | null) => {
      setLiveGroup(updated);
    });
    return () => unsub();
  }, [targetGroupId]);

  // Start Session Form State
  const [leaderName, setLeaderName] = useState(user?.displayName || 'Worship Leader');
  const [sessionTitle, setSessionTitle] = useState('Sunday Worship Service');
  const [starterSongId, setStarterSongId] = useState(
    initialStartSongId || allSongs[0]?.id || ''
  );

  const teamActiveSetlist = effectiveGroup?.activeSetlist;

  const availableSetlists = useMemo(() => {
    const list: Array<{
      id: string;
      name: string;
      itemCount: number;
      isTeamLineup?: boolean;
      items: Array<{ songId: string; preferredSemitones?: number; referenceAudioUrl?: string }>;
    }> = [];

    if (teamActiveSetlist && teamActiveSetlist.items?.length > 0) {
      list.push({
        id: teamActiveSetlist.id,
        name: `🌟 Church Lineup: ${teamActiveSetlist.name}`,
        itemCount: teamActiveSetlist.items.length,
        isTeamLineup: true,
        items: teamActiveSetlist.items,
      });
    }

    for (const s of setlists) {
      if (s.id !== teamActiveSetlist?.id && s.items?.length > 0) {
        list.push({
          id: s.id,
          name: s.name,
          itemCount: s.items.length,
          items: s.items,
        });
      }
    }

    return list;
  }, [teamActiveSetlist, setlists]);

  const [starterSetlistId, setStarterSetlistId] = useState<string>(() => {
    if (initialStartSetlistId) return initialStartSetlistId;
    if (effectiveGroup?.activeSetlist?.id) return effectiveGroup.activeSetlist.id;
    if (setlists.length > 0) return setlists[0].id;
    return '__none__';
  });

  const activeSelectedSetlist = useMemo(() => {
    if (!starterSetlistId || starterSetlistId === '__none__') return null;
    if (teamActiveSetlist && teamActiveSetlist.id === starterSetlistId) {
      return teamActiveSetlist;
    }
    return setlists.find((s) => s.id === starterSetlistId) || null;
  }, [starterSetlistId, teamActiveSetlist, setlists]);

  const [starterInstrument, setStarterInstrument] =
    useState<InstrumentViewMode>('general');

  // Join Session Form State
  const [joinCodeInput, setJoinCodeInput] = useState(initialJoinCode);
  const [joinInviteTokenInput, setJoinInviteTokenInput] =
    useState(initialInviteToken);
  const [memberNameInput, setMemberNameInput] = useState(user?.displayName || '');
  const [memberInstrument, setMemberInstrument] =
    useState<InstrumentViewMode>('guitar');

  // Sync user display name if resolved asynchronously
  useEffect(() => {
    if (user?.displayName) {
      setLeaderName((prev) => (prev === 'Worship Leader' ? user.displayName : prev));
      setMemberNameInput((prev) => (prev === '' ? user.displayName : prev));
    }
  }, [user?.displayName]);

  // UI Alerts & Modals
  const [networkOrigin, setNetworkOrigin] = useState<string>('');
  const [errorAlert, setErrorAlert] = useState<{
    title: string;
    message: string;
    code?: string;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<
    'code' | 'link' | 'network' | null
  >(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showArrangementModal, setShowArrangementModal] = useState(false);
  const [isQuickEditMode, setIsQuickEditMode] = useState(false);
  const [personalArrangements, setPersonalArrangements] = useState<
    Record<string, TeamSongArrangement>
  >(() => getPersonalInstrumentArrangements());
  const [preferredArrangementLayer, setPreferredArrangementLayer] =
    useState<PreferredArrangementLayerMode>('auto');
  const [leaderEditScope, setLeaderEditScope] = useState<
    'band' | 'instrument' | 'personal'
  >('band');
  const [arrangementFeedbackToast, setArrangementFeedbackToast] = useState<
    string | null
  >(null);
  const [isSubmittingToAdmin, setIsSubmittingToAdmin] = useState(false);
  const [activeChordEditTarget, setActiveChordEditTarget] = useState<{
    sectionId: string;
    lineIndex: number;
    segmentIndex: number;
    charOffset: number;
    targetWord?: string;
    currentChord: string;
    isTrailing?: boolean;
  } | null>(null);
  const [customChordInput, setCustomChordInput] = useState('');
  const [activeLineEditTarget, setActiveLineEditTarget] = useState<{
    sectionId: string;
    lineIndex: number;
    bracketedText: string;
    annotation: string;
  } | null>(null);
  const inlineLineInputRef = useRef<HTMLInputElement | null>(null);
  const inlineLineCursorRef = useRef<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAutoConnecting, setIsAutoConnecting] = useState(false);
  const autoJoinInFlightRef = useRef(false);
  const autoJoinAttemptedIdRef = useRef<string | null>(null);
  const isRestoringStoredCredsRef = useRef(false);
  const [songToAddId, setSongToAddId] = useState(allSongs[0]?.id ?? '');

  // Discover local network origin (for band Wi-Fi synchronization)
  useEffect(() => {
    fetch(apiUrl('/api/live/network-info'))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.networkOrigin) {
          setNetworkOrigin(data.networkOrigin);
        }
      })
      .catch(() => {});
  }, []);

  const sectionElementsRef = useRef<Record<string, HTMLElement | null>>({});
  const latestRevisionRef = useRef<number>(0);

  // Restore active session credentials from sessionStorage or localStorage if present and no explicit join URL
  useEffect(() => {
    if (initialJoinCode || initialInviteToken) return;
    try {
      const raw =
        window.sessionStorage.getItem(SESSION_CREDENTIALS_STORAGE_KEY) ||
        window.localStorage.getItem(SESSION_CREDENTIALS_STORAGE_KEY);
      if (!raw) return;
      const stored = JSON.parse(raw) as StoredLiveCredentials;
      if (stored.sessionId && stored.participantToken) {
        isRestoringStoredCredsRef.current = true;
        fetch(
          apiUrl(
            `/api/live/sessions/${encodeURIComponent(
              stored.sessionId
            )}?token=${encodeURIComponent(stored.participantToken)}`
          )
        )
          .then(async (res) => {
            if (!res.ok) {
              const errData = await res.json().catch(() => null);
              if (
                res.status === 401 ||
                res.status === 403 ||
                res.status === 404 ||
                res.status === 410 ||
                errData?.code === 'SESSION_ENDED'
              ) {
                window.sessionStorage.removeItem(SESSION_CREDENTIALS_STORAGE_KEY);
                window.localStorage.removeItem(SESSION_CREDENTIALS_STORAGE_KEY);
              }
              return;
            }
            const data = (await res.json()) as {
              session: LiveSessionSnapshot;
              inviteToken?: string;
            };
            latestRevisionRef.current = data.session.revision;
            setSession(data.session);
            setParticipantId(stored.participantId);
            setParticipantToken(stored.participantToken);
            if (data.inviteToken || stored.inviteToken) {
              setInviteToken(data.inviteToken ?? stored.inviteToken ?? '');
            }
          })
          .catch(() => {})
          .finally(() => {
            isRestoringStoredCredsRef.current = false;
          });
      }
    } catch {
      isRestoringStoredCredsRef.current = false;
    }
  }, [initialJoinCode, initialInviteToken]);

  // Recover latest snapshot from server (used on reconnect)
  const fetchLatestSnapshot = useCallback(
    async (sid: string, token: string) => {
      try {
        const res = await fetch(
          apiUrl(
            `/api/live/sessions/${encodeURIComponent(
              sid
            )}?token=${encodeURIComponent(token)}`
          ),
          { cache: 'no-store' }
        );
        if (!res.ok) {
          const errData = (await res.json().catch(() => ({}))) as {
            error?: string;
            code?: string;
          };
          setErrorAlert({
            title: 'Session Recovery Error',
            message: errData.error ?? 'Could not reload live session.',
            code: errData.code,
          });
          return;
        }
        const data = (await res.json()) as {
          session: LiveSessionSnapshot;
          inviteToken?: string;
        };
        if (data.session.revision >= latestRevisionRef.current) {
          latestRevisionRef.current = data.session.revision;
          setSession(data.session);
          if (data.session.status === 'ended') {
            setStreamStatus('ended');
          }
        }
        if (data.inviteToken) {
          setInviteToken(data.inviteToken);
        }
      } catch {
        setStreamStatus('reconnecting');
      }
    },
    []
  );

  // 1. Periodically refresh active group state while on /live so leader going live triggers instantly
  useEffect(() => {
    if ((!targetGroupId && !user) || session) return;
    refreshActiveGroup();
    const interval = setInterval(() => {
      refreshActiveGroup();
    }, 2000);

    const onFocus = () => refreshActiveGroup();
    window.addEventListener('focus', onFocus);
    window.addEventListener('visibilitychange', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('visibilitychange', onFocus);
    };
  }, [targetGroupId, session, refreshActiveGroup]);

  // Unified join helper for automatic and 1-click stage connection
  const performJoinLiveSession = useCallback(
    async (target: {
      sessionId?: string;
      joinCode?: string;
      isAuto?: boolean;
      isLeader?: boolean;
    }) => {
      if (autoJoinInFlightRef.current) return;
      autoJoinInFlightRef.current = true;
      if (target.isAuto) {
        setIsAutoConnecting(true);
      } else {
        setIsSubmitting(true);
      }
      setErrorAlert(null);

      try {
        const effectiveName =
          user?.displayName || user?.email?.split('@')[0] || 'Musician';
        const res = await fetch(apiUrl('/api/live/sessions/join'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: target.sessionId || undefined,
            joinCode: target.joinCode || undefined,
            participantName: effectiveName,
            instrument: (user?.instrument as any) || 'general',
            isLeader: target.isLeader || undefined,
          }),
        });

        const data = await res.json();
        if (res.ok && data.session) {
          latestRevisionRef.current = data.session.revision;
          setSession(data.session);
          setParticipantId(data.participantId);
          setParticipantToken(data.participantToken);
          setInstrumentView((user?.instrument as any) || 'general');
          setViewMode('follow');

          const creds: StoredLiveCredentials = {
            sessionId: data.session.sessionId,
            participantId: data.participantId,
            participantToken: data.participantToken,
            isLeader: Boolean(target.isLeader),
          };
          window.sessionStorage.setItem(
            SESSION_CREDENTIALS_STORAGE_KEY,
            JSON.stringify(creds)
          );
          window.localStorage.setItem(
            SESSION_CREDENTIALS_STORAGE_KEY,
            JSON.stringify(creds)
          );
        } else {
          console.warn('Live session join response not ok:', data);
          if (target.isAuto) {
            // Allow retry on subsequent poll if leader was just starting
            setTimeout(() => {
              autoJoinAttemptedIdRef.current = null;
            }, 3000);
          } else {
            setErrorAlert({
              title: 'Unable to Join Live Session',
              message: data?.error ?? 'Invalid join code or live session.',
              code: data?.code,
            });
          }
        }
      } catch (err) {
        console.warn('Live session join network error:', err);
        if (target.isAuto) {
          setTimeout(() => {
            autoJoinAttemptedIdRef.current = null;
          }, 3000);
        } else {
          setErrorAlert({
            title: 'Connection Notice',
            message: 'Network error while attempting to connect to the live stage.',
          });
        }
      } finally {
        autoJoinInFlightRef.current = false;
        setIsAutoConnecting(false);
        setIsSubmitting(false);
      }
    },
    [user?.displayName, user?.email, user?.instrument]
  );

  // 2. Auto-connect team members and re-connect leader if their worship team leader is currently live
  useEffect(() => {
    if (session) return;
    const currentGrp = liveGroup || activeGroup || getCachedTeam();
    const grpId = currentGrp?.id || user?.groupId;
    if (!grpId) return;

    let cancelled = false;

    const isLeader = Boolean(
      user && (currentGrp?.ownerId === user.id || user.groupRole === 'leader')
    );

    async function checkAndAutoJoin() {
      if (isRestoringStoredCredsRef.current && !session) return;
      if (session || autoJoinInFlightRef.current || cancelled) return;

      const grp = liveGroup || activeGroup || getCachedTeam();
      let liveId = grp?.activeLiveSessionId;
      let joinCode = grp?.activeLiveSessionJoinCode;
      let expiresAt = grp?.activeLiveSessionExpiresAt;
      let leaderDispName = grp?.activeLiveSessionLeaderName;

      // 1. Query dedicated active session endpoint on server
      try {
        const res = await fetch(
          apiUrl(`/api/live/sessions/active?groupId=${encodeURIComponent(grpId || '')}`),
          { cache: 'no-store' }
        );
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (data.active && data.session) {
            liveId = data.session.sessionId;
            joinCode = data.session.joinCode;
            expiresAt = data.session.expiresAt;
            leaderDispName = data.session.leaderName;

            const currentCache = getCachedTeam() || grp;
            if (currentCache) {
              const updated: WorshipGroup = {
                ...currentCache,
                activeLiveSessionId: liveId,
                activeLiveSessionJoinCode: joinCode,
                activeLiveSessionExpiresAt: expiresAt,
                activeLiveSessionLeaderName: leaderDispName,
              };
              setLiveGroup(updated);
              setCachedTeam(updated);
              broadcastTeamSync(updated);
            }
          } else if (
            data.active === false &&
            (data.reason === 'ended' || (expiresAt && new Date(expiresAt).getTime() <= Date.now()))
          ) {
            // Server explicitly reports session ended or expired, clear local active session indicator
            setLiveGroup((prev) =>
              prev
                ? {
                    ...prev,
                    activeLiveSessionId: undefined,
                    activeLiveSessionJoinCode: undefined,
                    activeLiveSessionExpiresAt: undefined,
                    activeLiveSessionLeaderName: undefined,
                  }
                : null
            );
          }
        }
      } catch (err) {
        console.warn('Active live session discovery error:', err);
      }

      // Fallback: check group API if activeLiveSessionId still not found
      if (!liveId && !joinCode) {
        try {
          const res = await fetch(apiUrl(`/api/groups/${grpId}`), { cache: 'no-store' });
          if (res.ok && !cancelled) {
            const data = await res.json();
            if (data.group?.activeLiveSessionId) {
              liveId = data.group.activeLiveSessionId;
              joinCode = data.group.activeLiveSessionJoinCode;
              expiresAt = data.group.activeLiveSessionExpiresAt;
              leaderDispName = data.group.activeLiveSessionLeaderName;
              setLiveGroup(data.group);
              setCachedTeam(data.group);
            }
          }
        } catch {}
      }

      if (cancelled || session || autoJoinInFlightRef.current) return;
      if (!liveId && !joinCode) return;
      if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return;

      // Check if user previously dismissed this session in this browser session
      try {
        const dismissed = window.sessionStorage.getItem('wmc_dismissed_team_live_session');
        if (dismissed === (liveId || joinCode)) return;
      } catch {}

      const sessionKey = `${liveId || ''}:${joinCode || ''}`;
      if (autoJoinAttemptedIdRef.current === sessionKey) return;
      autoJoinAttemptedIdRef.current = sessionKey;

      await performJoinLiveSession({
        sessionId: liveId || undefined,
        joinCode: joinCode || undefined,
        isAuto: true,
        isLeader,
      });
    }

    checkAndAutoJoin();

    // Cross-tab instantaneous stage sync
    const handleTabSync = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.id === grpId) {
        setLiveGroup(detail);
        checkAndAutoJoin();
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('wmc_team_sync', handleTabSync);
    }

    // Fast recurring polling (every 1.5s in standby) to guarantee instant connection when leader goes live
    const pollTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && !session) {
        checkAndAutoJoin();
      }
    }, 1500);

    return () => {
      cancelled = true;
      clearInterval(pollTimer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('wmc_team_sync', handleTabSync);
      }
    };
  }, [
    liveGroup?.id,
    liveGroup?.activeLiveSessionId,
    liveGroup?.activeLiveSessionJoinCode,
    liveGroup?.activeLiveSessionExpiresAt,
    activeGroup?.id,
    activeGroup?.activeLiveSessionId,
    activeGroup?.activeLiveSessionJoinCode,
    activeGroup?.activeLiveSessionExpiresAt,
    session,
    user?.id,
    user?.groupRole,
    user?.groupId,
    performJoinLiveSession,
  ]);

  const activeSessionId = session?.sessionId;
  const activeSessionStatus = session?.status;

  // Establish SSE real-time stream & automatic reconnection
  useEffect(() => {
    if (
      !activeSessionId ||
      !participantToken ||
      activeSessionStatus === 'ended'
    ) {
      return;
    }
    if (simulatedDisconnect) {
      return;
    }

    let es: EventSource | null = null;
    let reconnectTimeout: number | null = null;
    let cancelled = false;

    const connectStream = () => {
      if (cancelled) return;
      setStreamStatus((prev) =>
        prev === 'connected' ? 'connected' : 'connecting'
      );

      const url = apiUrl(
        `/api/live/sessions/${encodeURIComponent(
          activeSessionId
        )}/stream?token=${encodeURIComponent(participantToken)}`
      );

      es = new EventSource(url);

      es.onopen = () => {
        if (cancelled) return;
        setStreamStatus('connected');
      };

      es.onmessage = (event) => {
        if (cancelled) return;
        try {
          const msg = JSON.parse(event.data) as LiveStreamMessage;
          if (!msg || !msg.session) return;

          // Ignore outdated revisions
          if (
            msg.type === 'state_updated' &&
            msg.revision < latestRevisionRef.current
          ) {
            return;
          }

          latestRevisionRef.current = Math.max(
            latestRevisionRef.current,
            msg.session.revision
          );
          setSession(msg.session);

          if (msg.type === 'session_ended' || msg.session.status === 'ended') {
            setStreamStatus('ended');
            es?.close();
          } else {
            setStreamStatus('connected');
          }
        } catch {
          // ignore malformed event
        }
      };

      es.onerror = () => {
        if (cancelled) return;
        setStreamStatus('reconnecting');
        es?.close();
        reconnectTimeout = window.setTimeout(() => {
          connectStream();
        }, 2500);
      };
    };

    connectStream();

    return () => {
      cancelled = true;
      if (reconnectTimeout) window.clearTimeout(reconnectTimeout);
      es?.close();
    };
  }, [
    activeSessionId,
    activeSessionStatus,
    participantToken,
    simulatedDisconnect,
    fetchLatestSnapshot,
  ]);

  // Active session presence heartbeat loop: keeps participant online in Connected Team roster across all workers
  useEffect(() => {
    if (
      !activeSessionId ||
      !participantToken ||
      activeSessionStatus === 'ended' ||
      simulatedDisconnect
    ) {
      return;
    }

    const sendHeartbeat = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      fetch(apiUrl(`/api/live/sessions/${encodeURIComponent(activeSessionId)}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${participantToken}`,
        },
        body: JSON.stringify({
          action: 'update-presence',
          connectionState: 'connected',
        }),
      }).catch(() => {});
    };

    // Send initial heartbeat and schedule recurring 15s interval
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 15000);

    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        sendHeartbeat();
        fetchLatestSnapshot(activeSessionId, participantToken);
      }
    };
    const onFocus = () => {
      sendHeartbeat();
      fetchLatestSnapshot(activeSessionId, participantToken);
    };

    window.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [activeSessionId, participantToken, activeSessionStatus, simulatedDisconnect]);

  // Smoothly scroll to the active semantic section when in Follow Leader mode
  const sharedSectionId = session?.sharedState.activeSectionId;
  useEffect(() => {
    if (!session || viewMode !== 'follow' || !sharedSectionId) return;
    const el = sectionElementsRef.current[sharedSectionId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [session?.sharedState.songId, sharedSectionId, viewMode, session]);

  const isPrimaryLeader = Boolean(
    session && participantId && session.leaderId === participantId
  );

  const canControlOfficialState = Boolean(
    session &&
      participantId &&
      (session.leaderId === participantId ||
        session.coLeaderIds.includes(participantId))
  );

  // Start a new Live Session
  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorAlert(null);
    setIsSubmitting(true);

    try {
      const chosenSetlist = activeSelectedSetlist;
      const setlistSongIds = chosenSetlist && chosenSetlist.items.length > 0
        ? chosenSetlist.items.map((item) => item.songId)
        : undefined;

      const initialSongId =
        chosenSetlist && chosenSetlist.items.length > 0
          ? chosenSetlist.items[0].songId
          : starterSongId;

      const initialSemitones =
        chosenSetlist && chosenSetlist.items.length > 0
          ? chosenSetlist.items[0]?.preferredSemitones ?? initialStartSemitones
          : initialStartSemitones;

      const grpId = activeGroup?.id || user?.groupId || getCachedTeam()?.id;

      const res = await fetch(apiUrl('/api/live/sessions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: sessionTitle || (chosenSetlist?.name ? `${chosenSetlist.name} Live` : 'Sunday Worship Service'),
          leaderName: leaderName.trim() || user?.displayName || 'Worship Leader',
          instrument: starterInstrument,
          initialSongId,
          initialSemitones,
          setlistSongIds,
          groupId: grpId || undefined,
        }),
      });

      const data = (await res.json()) as CreateLiveSessionResponse & {
        error?: string;
        code?: string;
      };

      if (!res.ok) {
        setErrorAlert({
          title: 'Could Not Start Live Session',
          message: data.error ?? 'Unexpected server error.',
          code: data.code,
        });
        return;
      }

      latestRevisionRef.current = data.session.revision;
      setSession(data.session);
      setParticipantId(data.participantId);
      setParticipantToken(data.participantToken);
      setInviteToken(data.inviteToken);
      setInstrumentView(starterInstrument);
      setViewMode('follow');

      // If user is in a worship team, broadcast active live session to team across server, Firestore, and tabs
      if (grpId) {
        setTeamActiveLiveSession(grpId, {
          sessionId: data.session.sessionId,
          joinCode: data.session.joinCode,
          expiresAt: data.session.expiresAt,
          leaderName: data.session.leaderName,
        }).catch((err) => console.warn('Broadcast live session note:', err));
      }

      try {
        const creds: StoredLiveCredentials = {
          sessionId: data.session.sessionId,
          participantId: data.participantId,
          participantToken: data.participantToken,
          inviteToken: data.inviteToken,
          isLeader: true,
        };
        window.sessionStorage.setItem(
          SESSION_CREDENTIALS_STORAGE_KEY,
          JSON.stringify(creds)
        );
        window.localStorage.setItem(
          SESSION_CREDENTIALS_STORAGE_KEY,
          JSON.stringify(creds)
        );
      } catch {
        // ignore
      }
    } catch {
      setErrorAlert({
        title: 'Network Error',
        message: 'Could not reach the Live Sync server.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Join an existing Live Session
  const handleJoinSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorAlert(null);
    setIsSubmitting(true);

    const effectiveName =
      memberNameInput.trim() || user?.displayName || 'Musician';
    if (!memberNameInput.trim()) {
      setMemberNameInput(effectiveName);
    }

    try {
      const res = await fetch(apiUrl('/api/live/sessions/join'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          joinCode: joinCodeInput.trim() || undefined,
          inviteToken: joinInviteTokenInput.trim() || undefined,
          participantName: effectiveName,
          instrument: memberInstrument,
        }),
      });

      const data = (await res.json()) as JoinLiveSessionResponse & {
        error?: string;
        code?: string;
      };

      if (!res.ok) {
        let msg = data.error ?? 'Invalid join code or invitation link.';
        if (data.code === 'SESSION_NOT_FOUND') {
          msg = `Session "${joinCodeInput.trim()}" was not found on this server. If joining from a separate browser or device, please ensure you are using the leader's exact Invite Link or Wi-Fi Link.`;
        }
        setErrorAlert({
          title:
            data.code === 'INVITATION_EXPIRED'
              ? 'Invitation Expired'
              : data.code === 'SESSION_ENDED'
              ? 'Session Already Ended'
              : 'Unable to Join Live Session',
          message: msg,
          code: data.code,
        });
        return;
      }

      latestRevisionRef.current = data.session.revision;
      setSession(data.session);
      setParticipantId(data.participantId);
      setParticipantToken(data.participantToken);
      setInstrumentView(memberInstrument);
      setViewMode('follow');

      try {
        const creds: StoredLiveCredentials = {
          sessionId: data.session.sessionId,
          participantId: data.participantId,
          participantToken: data.participantToken,
          isLeader: false,
        };
        window.sessionStorage.setItem(
          SESSION_CREDENTIALS_STORAGE_KEY,
          JSON.stringify(creds)
        );
        window.localStorage.setItem(
          SESSION_CREDENTIALS_STORAGE_KEY,
          JSON.stringify(creds)
        );
      } catch {
        // ignore
      }
    } catch {
      setErrorAlert({
        title: 'Connection Error',
        message: 'Could not connect to the Live Sync server.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Send authoritative state update (Leader / Co-Leader)
  const sendOfficialStateUpdate = async (patch: UpdateSharedStateInput) => {
    if (!session || !participantToken) return;
    setErrorAlert(null);

    try {
      const res = await fetch(
        apiUrl(`/api/live/sessions/${encodeURIComponent(session.sessionId)}`),
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${participantToken}`,
          },
          body: JSON.stringify({
            action: 'update-state',
            state: {
              ...patch,
              expectedRevision: session.revision,
            },
          }),
        }
      );

      const data = (await res.json()) as {
        session?: LiveSessionSnapshot;
        error?: string;
        code?: string;
      };

      if (!res.ok) {
        if (data.session) {
          latestRevisionRef.current = data.session.revision;
          setSession(data.session);
        }
        if (res.status === 404 || data.code === 'SESSION_NOT_FOUND') {
          setErrorAlert({
            title: 'Live Session Not Found',
            message: isPrimaryLeader
              ? 'This live stage session has ended or expired on the server. Tap "End Session" or start a new live stage below.'
              : 'The live session has ended or could not be found on the server.',
            code: data.code,
          });
        } else {
          setErrorAlert({
            title: 'Sync Update Rejected',
            message: data.error ?? 'Could not update official state.',
            code: data.code,
          });
        }
        return;
      }

      if (data.session) {
        latestRevisionRef.current = data.session.revision;
        setSession(data.session);
      }
    } catch {
      setStreamStatus('reconnecting');
    }
  };

  // Switch between Follow Leader and Browse Independently
  const handleSwitchToIndependent = () => {
    if (!session) return;
    setIndependentSongId(session.sharedState.songId);
    setIndependentSemitones(session.sharedState.officialSemitones);
    setIndependentSectionId(session.sharedState.activeSectionId);
    setIndependentSpelling(session.sharedState.enharmonicPreference);
    setViewMode('independent');
  };

  const handleReturnToLeader = () => {
    setViewMode('follow');
    if (session?.sharedState.activeSectionId) {
      const el = sectionElementsRef.current[session.sharedState.activeSectionId];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  };

  const handleInstrumentChange = async (nextInstrument: InstrumentViewMode) => {
    setInstrumentView(nextInstrument);
    setSelectedCapoFret(0);
    if (!session || !participantToken) return;
    try {
      await fetch(
        apiUrl(`/api/live/sessions/${encodeURIComponent(session.sessionId)}`),
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${participantToken}`,
          },
          body: JSON.stringify({
            action: 'update-presence',
            instrument: nextInstrument,
          }),
        }
      );
    } catch {
      // ignore non-critical presence update failure
    }
  };

  const handleTransferLeadership = async (
    targetId: string,
    leadershipAction: 'make-leader' | 'toggle-co-leader'
  ) => {
    if (!session || !participantToken) return;
    try {
      const res = await fetch(
        apiUrl(`/api/live/sessions/${encodeURIComponent(session.sessionId)}`),
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${participantToken}`,
          },
          body: JSON.stringify({
            action: 'transfer-leadership',
            targetParticipantId: targetId,
            leadershipAction,
          }),
        }
      );
      const data = (await res.json()) as {
        session?: LiveSessionSnapshot;
        error?: string;
      };
      if (res.ok && data.session) {
        latestRevisionRef.current = data.session.revision;
        setSession(data.session);
      } else if (data.error) {
        setErrorAlert({
          title: 'Leadership Action Failed',
          message: data.error,
        });
      }
    } catch {
      // ignore
    }
  };

  const handleEndSession = async () => {
    if (!session || !participantToken) return;
    if (
      !window.confirm(
        'End this live worship session for all connected team members? Personal setlists and favorites will not be affected.'
      )
    ) {
      return;
    }

    try {
      const res = await fetch(
        apiUrl(`/api/live/sessions/${encodeURIComponent(session.sessionId)}`),
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${participantToken}`,
          },
          body: JSON.stringify({ action: 'end-session' }),
        }
      );
      const data = (await res.json()) as { session?: LiveSessionSnapshot };
      if (data.session) {
        setSession(data.session);
        setStreamStatus('ended');
      }
      const grpId = activeGroup?.id || user?.groupId || getCachedTeam()?.id;
      if (grpId) {
        clearTeamActiveLiveSession(grpId).catch(() => {});
      }
      setLiveGroup((prev) =>
        prev
          ? {
              ...prev,
              activeLiveSessionId: undefined,
              activeLiveSessionJoinCode: undefined,
              activeLiveSessionExpiresAt: undefined,
              activeLiveSessionLeaderName: undefined,
            }
          : null
      );
      window.sessionStorage.removeItem(SESSION_CREDENTIALS_STORAGE_KEY);
      window.localStorage.removeItem(SESSION_CREDENTIALS_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const handleLeaveLocalSession = () => {
    if (activeGroup?.activeLiveSessionId) {
      try {
        window.sessionStorage.setItem(
          'wmc_dismissed_team_live_session',
          activeGroup.activeLiveSessionId
        );
      } catch {}
    }
    autoJoinAttemptedIdRef.current = null;
    window.sessionStorage.removeItem(SESSION_CREDENTIALS_STORAGE_KEY);
    window.localStorage.removeItem(SESSION_CREDENTIALS_STORAGE_KEY);
    setSession(null);
    setParticipantId('');
    setParticipantToken('');
    setInviteToken('');
    setStreamStatus('idle');
    setErrorAlert(null);
  };

  const copyToClipboard = async (
    text: string,
    field: 'code' | 'link' | 'network'
  ) => {
    let success = false;

    // 1. Desktop native Electron clipboard bridge
    try {
      const desktopBridge = (
        window as unknown as {
          worshipyDesktop?: {
            copyToClipboard?: (t: string) => boolean;
          };
        }
      )?.worshipyDesktop;
      if (typeof desktopBridge?.copyToClipboard === 'function') {
        success = desktopBridge.copyToClipboard(text);
      }
    } catch {
      // fallback
    }

    // 2. Modern Clipboard API
    if (!success && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        success = true;
      } catch {
        // fallback
      }
    }

    // 3. Fallback textarea copy execCommand
    if (!success && typeof document !== 'undefined') {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.setAttribute('readonly', '');
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        success = document.execCommand('copy');
        document.body.removeChild(textArea);
      } catch {
        // fallback
      }
    }

    if (success) {
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 2500);
    }
  };

  // ============================================================================
  // LOBBY VIEW: START LIVE SESSION OR JOIN EXISTING SESSION
  // ============================================================================
  if (!session) {
    return (
      <div className="space-y-8">
        <header className="space-y-2">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--brand-surface)] text-[var(--brand-accent)]">
            <Radio className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Worship Music Companion Pro · Live Sync</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Leader-Led Live Worship Synchronization
          </h1>
          <p className="text-sm sm:text-base text-[var(--text-secondary)]">
            Synchronize the current song, official transposed key, active
            section, and setlist queue across every musician&apos;s phone,
            tablet, or laptop in real time.
          </p>
        </header>

        {/* Error / Expired Invitation Alert */}
        {errorAlert && (
          <div
            role="alert"
            className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-5 text-rose-700 dark:text-rose-300 flex items-start justify-between gap-4"
          >
            <div className="flex items-start gap-3">
              <AlertCircle
                className="w-5 h-5 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <h2 className="font-bold text-sm sm:text-base">
                  {errorAlert.title}
                </h2>
                <p className="text-xs sm:text-sm">{errorAlert.message}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setErrorAlert(null)}
              className="text-xs underline font-semibold shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {isTeamMember && !isOwnerLeader && !showManualJoinForm ? (
          /* Member View: Automatic 1-Click Sync Standby */
          <div className="max-w-md mx-auto space-y-4">
            {isAutoConnecting ? (
              <section className="theme-card rounded-2xl border border-[var(--brand-accent)]/30 bg-[var(--bg-surface)] p-8 text-center space-y-4 shadow-sm">
                <div className="w-14 h-14 rounded-full bg-[var(--brand-surface)] text-[var(--brand-accent)] flex items-center justify-center mx-auto">
                  <Radio className="w-7 h-7 animate-pulse" />
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-xl font-bold">Connecting to Live Stage...</h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {effectiveGroup?.activeLiveSessionLeaderName || 'Leader'} is live. Auto-connecting your chart with zero codes...
                  </p>
                </div>
              </section>
            ) : (
              <section
                aria-label="Live Worship Standby"
                className="theme-card rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 text-center space-y-5 shadow-xs"
              >
                <div className="w-16 h-16 rounded-full bg-[var(--brand-surface)] text-[var(--brand-accent)] mx-auto flex items-center justify-center">
                  <Radio className="w-8 h-8 opacity-80" />
                </div>
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    Connected to {effectiveGroup?.name || 'Worship Team'}
                  </div>

                  {effectiveGroup?.activeLiveSessionId &&
                  (!effectiveGroup.activeLiveSessionExpiresAt ||
                    new Date(effectiveGroup.activeLiveSessionExpiresAt).getTime() > Date.now()) ? (
                    <div className="space-y-3 pt-1">
                      <h2 className="text-xl font-bold text-[var(--brand-accent)]">
                        {effectiveGroup.activeLiveSessionLeaderName || 'Worship Leader'} is Live!
                      </h2>
                      <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                        A live worship stage is currently active. Connect your chart below to follow in real time with zero manual codes.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          autoJoinAttemptedIdRef.current = null;
                          performJoinLiveSession({
                            sessionId: effectiveGroup.activeLiveSessionId,
                            joinCode: effectiveGroup.activeLiveSessionJoinCode,
                            isAuto: false,
                          });
                        }}
                        disabled={isSubmitting || isAutoConnecting}
                        className="w-full py-3 px-4 rounded-xl bg-[var(--brand-accent)] text-[#0c0c10] font-bold text-sm shadow-md hover:opacity-95 cursor-pointer inline-flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                      >
                        <Radio className="w-4 h-4 animate-pulse" />
                        <span>{isSubmitting ? 'Connecting to Stage...' : 'Connect to Live Stage Now'}</span>
                      </button>
                    </div>
                  ) : (
                    <>
                      <h2 className="text-xl font-bold">Waiting for Worship Leader to Go Live</h2>
                      <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
                        You are logged in as a band member (<strong>{user?.displayName || 'Musician'}</strong> · {user?.instrument || 'Band'}). You don&apos;t need to enter any code—your screen will automatically sync with the leader the moment they start the live service!
                      </p>
                    </>
                  )}
                </div>

                <div className="pt-3 border-t border-[var(--border-subtle)]/60 flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowManualJoinForm(true)}
                    className="text-xs text-[var(--brand-accent)] hover:underline cursor-pointer"
                  >
                    Visiting another church or have a separate join code?
                  </button>
                </div>
              </section>
            )}
          </div>
        ) : (
          /* Leader or Guest View: Form Grid */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Card 1: Join a Live Session (Member or Guest) */}
            <section
              aria-label="Join an active live session"
              className="theme-card rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-5 shadow-xs"
            >
              <div className="space-y-1">
                {isTeamMember && !isOwnerLeader && (
                  <button
                    type="button"
                    onClick={() => setShowManualJoinForm(false)}
                    className="text-xs text-[var(--brand-accent)] hover:underline cursor-pointer mb-1 block"
                  >
                    ← Back to Automatic Stage Sync
                  </button>
                )}
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--brand-accent)]">
                  {isTeamMember ? 'Band Member' : 'Guest / Visitor'}
                </span>
                <h2 className="text-xl font-bold">Join a Live Session</h2>
                <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
                  Enter the 6-character join code shared by the worship leader to follow the chart in real time.
                </p>
              </div>

              {effectiveGroup && (
                <div className="p-3.5 rounded-xl bg-[var(--brand-surface)] border border-[var(--brand-accent)]/30 text-xs text-[var(--text-primary)] space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-[var(--brand-accent)]">
                    <Radio className="w-3.5 h-3.5 animate-pulse" />
                    <span>Connected to {effectiveGroup.name}</span>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Whenever your leader starts Live Rehearsal, you will connect automatically without typing any code.
                  </p>
                </div>
              )}

              <form onSubmit={handleJoinSession} className="space-y-4">
                <div>
                  <label
                    htmlFor="join-code-input"
                    className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                  >
                    6-Character Join Code
                  </label>
                  <input
                    id="join-code-input"
                    type="text"
                    value={joinCodeInput}
                    onChange={(e) => {
                      setJoinCodeInput(e.target.value.toUpperCase());
                      if (joinInviteTokenInput) setJoinInviteTokenInput('');
                    }}
                    placeholder="e.g. 7K9M2P"
                    maxLength={12}
                    className="w-full h-12 px-4 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] font-mono font-bold text-lg uppercase tracking-widest focus:bg-[var(--bg-surface)]"
                  />
                  {joinInviteTokenInput && (
                    <p className="text-xs text-[var(--brand-accent)] mt-1 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Signed invitation token pre-filled from link.</span>
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="member-name-input"
                    className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                  >
                    Your Display Name
                  </label>
                  <input
                    id="member-name-input"
                    type="text"
                    value={memberNameInput}
                    onChange={(e) => setMemberNameInput(e.target.value)}
                    placeholder={
                      user?.displayName || 'e.g. Carlo (Acoustic Guitar)'
                    }
                    className="w-full h-11 px-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm focus:bg-[var(--bg-surface)]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="member-instrument-select"
                    className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                  >
                    Instrument Guidance View
                  </label>
                  <select
                    id="member-instrument-select"
                    value={memberInstrument}
                    onChange={(e) =>
                      setMemberInstrument(e.target.value as InstrumentViewMode)
                    }
                    className="w-full h-11 px-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm font-medium cursor-pointer"
                  >
                    <option value="general">General Chord & Lyric Chart</option>
                    <option value="guitar">
                      Guitar View (with Capo & Shape Guidance)
                    </option>
                    <option value="keyboard">
                      Keyboard View (with LH Bass & RH Voicings)
                    </option>
                    <option value="bass">
                      Bass View (with Slash-Bass Pedals & 5ths)
                    </option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    (!joinCodeInput.trim() && !joinInviteTokenInput.trim())
                  }
                  className="w-full h-12 rounded-xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/35 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] font-bold text-sm sm:text-base shadow-sm transition-all disabled:opacity-40 cursor-pointer"
                >
                  {isSubmitting ? 'Joining Session...' : 'Join Live Session'}
                </button>
              </form>
            </section>

            {/* Card 2: Start a Live Session (Leader) */}
            <section
              aria-label="Start a new leader-led live session"
              className="theme-card rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-5 shadow-xs"
            >
              <div className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--brand-accent)]">
                  Worship Leader
                </span>
                <h2 className="text-xl font-bold">Start a Live Session</h2>
                <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
                  Launch an authoritative session from a song or setlist and
                  generate a join code for your band.
                </p>
              </div>

              {effectiveGroup?.activeLiveSessionId &&
                (!effectiveGroup.activeLiveSessionExpiresAt ||
                  new Date(effectiveGroup.activeLiveSessionExpiresAt).getTime() > Date.now()) && (
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-2">
                    <div className="flex items-center gap-2 font-bold text-sm">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                      <span>Active Live Session Running</span>
                    </div>
                    <p className="text-[11px] text-white/70">
                      Join Code: <strong className="text-white tracking-widest">{effectiveGroup.activeLiveSessionJoinCode}</strong> • Leader: {effectiveGroup.activeLiveSessionLeaderName}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        autoJoinAttemptedIdRef.current = null;
                        performJoinLiveSession({
                          sessionId: effectiveGroup.activeLiveSessionId,
                          joinCode: effectiveGroup.activeLiveSessionJoinCode,
                          isAuto: false,
                          isLeader: true,
                        });
                      }}
                      disabled={isSubmitting || isAutoConnecting}
                      className="w-full py-2.5 rounded-lg bg-amber-400 text-black font-bold text-xs hover:bg-amber-300 transition-all cursor-pointer disabled:opacity-50"
                    >
                      ⚡ {isSubmitting ? 'Connecting...' : 'Re-enter Active Leader Stage'}
                    </button>
                  </div>
                )}

              <form onSubmit={handleStartSession} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="leader-name-input"
                    className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                  >
                    Leader Name
                  </label>
                  <input
                    id="leader-name-input"
                    type="text"
                    required
                    value={leaderName}
                    onChange={(e) => setLeaderName(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm"
                  />
                </div>

                <div>
                  <label
                    htmlFor="session-title-input"
                    className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                  >
                    Session Title
                  </label>
                  <input
                    id="session-title-input"
                    type="text"
                    required
                    value={sessionTitle}
                    onChange={(e) => setSessionTitle(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm"
                  />
                </div>
              </div>

              {/* Setlist / Lineup Selection */}
              {availableSetlists.length > 0 && (
                <div>
                  <label
                    htmlFor="starter-setlist-select"
                    className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                  >
                    Service Lineup / Setlist
                  </label>
                  <select
                    id="starter-setlist-select"
                    value={activeSelectedSetlist ? starterSetlistId : '__none__'}
                    onChange={(e) => setStarterSetlistId(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm font-medium cursor-pointer"
                  >
                    {availableSetlists.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.name} ({list.itemCount} {list.itemCount === 1 ? 'song' : 'songs'})
                      </option>
                    ))}
                    <option value="__none__">Single Song / Free Jam (No Setlist)</option>
                  </select>
                </div>
              )}

              {/* If a setlist is loaded: Display opening song and queue preview (NO confusing Starting Song catalog dropdown!) */}
              {activeSelectedSetlist && activeSelectedSetlist.items.length > 0 ? (
                <div className="p-3.5 rounded-2xl bg-[var(--brand-surface)]/70 border border-[var(--brand-accent)]/30 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-bold text-xs text-[var(--brand-accent)]">
                      <ListMusic className="w-4 h-4" />
                      <span>Lineup Starting Sequence</span>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--brand-accent)]/20 text-[var(--brand-accent)] border border-[var(--brand-accent)]/30">
                      Auto-starts at Song 1
                    </span>
                  </div>

                  {(() => {
                    const firstItem = activeSelectedSetlist.items[0];
                    const firstSong = allSongs.find((s) => s.id === firstItem.songId);
                    const openingKey = firstItem.preferredSemitones
                      ? transposeKey(firstSong?.originalKey || 'C', firstItem.preferredSemitones, 'auto')
                      : firstSong?.originalKey || 'C';

                    return (
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-5 h-5 rounded-full bg-[var(--brand-surface)] text-[var(--brand-accent)] font-bold text-[10px] flex items-center justify-center shrink-0">
                            1
                          </span>
                          <span className="font-bold text-[var(--text-primary)] truncate">
                            {firstSong?.title || firstItem.songId}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-[11px] text-[var(--brand-accent)] bg-[var(--brand-surface)] px-2 py-0.5 rounded border border-[var(--brand-accent)]/20 shrink-0 ml-2">
                          Key of {openingKey}
                        </span>
                      </div>
                    );
                  })()}

                  {activeSelectedSetlist.items.length > 1 && (
                    <p className="text-[11px] text-[var(--text-secondary)] truncate">
                      Queue: {activeSelectedSetlist.items.slice(1).map((item, idx) => {
                        const s = allSongs.find((song) => song.id === item.songId);
                        return `${idx + 2}. ${s?.title || item.songId}`;
                      }).join(' • ')}
                    </p>
                  )}
                </div>
              ) : (
                /* Only show Catalog Song selector if the leader is doing an impromptu Single Song session with no setlist */
                <div>
                  <label
                    htmlFor="starter-song-select"
                    className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                  >
                    Select Song to Play (Impromptu / Jam)
                  </label>
                  <select
                    id="starter-song-select"
                    value={starterSongId}
                    onChange={(e) => setStarterSongId(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm font-medium cursor-pointer"
                  >
                    {allSongs.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title} (Key of {s.originalKey} · {s.language.label})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label
                  htmlFor="leader-instrument-select"
                  className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                >
                  Leader Instrument View
                </label>
                <select
                  id="leader-instrument-select"
                  value={starterInstrument}
                  onChange={(e) =>
                    setStarterInstrument(e.target.value as InstrumentViewMode)
                  }
                  className="w-full h-11 px-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm cursor-pointer"
                >
                  <option value="general">General Chord & Lyric Chart</option>
                  <option value="guitar">Guitar View</option>
                  <option value="keyboard">Keyboard View</option>
                  <option value="bass">Bass View</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || !leaderName.trim()}
                className="w-full h-12 rounded-xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/35 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] font-bold text-sm sm:text-base shadow-sm transition-all disabled:opacity-40 cursor-pointer inline-flex items-center justify-center gap-2"
              >
                <Radio className="w-4 h-4 animate-pulse" aria-hidden="true" />
                <span>
                  {isSubmitting
                    ? 'Starting Live Session...'
                    : 'Start Live Session as Leader'}
                </span>
              </button>
            </form>
          </section>
        </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // SESSION ENDED STATE
  // ============================================================================
  if (session.status === 'ended' || streamStatus === 'ended') {
    return (
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 text-center space-y-4 my-6">
        <div className="w-12 h-12 rounded-full bg-[var(--bg-subtle)] text-[var(--text-secondary)] flex items-center justify-center mx-auto">
          <XCircle className="w-6 h-6" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold">Live Worship Session Ended</h1>
        <p className="text-sm sm:text-base text-[var(--text-secondary)] mx-auto max-w-md">
          <strong>{session.title}</strong> has been ended by the worship leader
          ({session.leaderName}). Your personal favorites, local setlists, and
          saved offline songs remain untouched on this device.
        </p>
        <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleLeaveLocalSession}
            className="px-5 py-2.5 rounded-xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/35 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] font-semibold text-sm cursor-pointer transition-colors"
          >
            Start or Join Another Session
          </button>
          <Link
            href="/songs"
            className="px-5 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm font-medium"
          >
            Browse Song Catalog
          </Link>
        </div>
      </div>
    );
  }

  // ============================================================================
  // ACTIVE LIVE SESSION WORKSPACE (LEADER OR FOLLOWER VIEW)
  // ============================================================================
  const activeSongId =
    viewMode === 'follow'
      ? session.sharedState.songId
      : independentSongId || session.sharedState.songId;

  const activeSemitones =
    viewMode === 'follow'
      ? session.sharedState.officialSemitones
      : independentSemitones;

  const activeSpelling =
    viewMode === 'follow'
      ? session.sharedState.enharmonicPreference
      : independentSpelling;

  const activeSectionAnchor =
    viewMode === 'follow'
      ? session.sharedState.activeSectionId
      : independentSectionId || session.sharedState.activeSectionId;

  const rawSourceSong = getSongById(activeSongId) ?? allSongs[0];
  const rawOfficialSong =
    getSongById(session.sharedState.songId) ?? rawSourceSong;

  const layeredResult = resolveLayeredSongArrangement({
    baseSong: rawSourceSong,
    instrument: instrumentView,
    personalArrangements,
    liveInstrumentOverrides: session.sharedState.instrumentArrangementOverrides,
    liveBandOverrides: session.sharedState.songArrangementOverrides,
    groupArrangements: effectiveGroup?.songArrangements,
    preferredLayer: preferredArrangementLayer,
  });

  const activeSongOverride = layeredResult.activeOverride;
  const officialSongOverride =
    session.sharedState.songArrangementOverrides?.[rawOfficialSong.id];

  const sourceSong = layeredResult.song;
  const officialSong = resolveSongWithLiveOverride(
    rawOfficialSong,
    officialSongOverride
  );

  // Only the Worship Leader (or Co-Leader) can push chord/lyric changes in Live Sync (scoped strictly to the Church Group).
  // Members edit and propose arrangements outside of Live Sync on `/songs/[slug]`.
  const canEditChartInLive = canControlOfficialState && viewMode === 'follow';
  const isBroadcastingEdits =
    canEditChartInLive && leaderEditScope !== 'personal';
  const targetBroadcastInstrument: InstrumentViewMode =
    leaderEditScope === 'instrument' && instrumentView !== 'general'
      ? instrumentView
      : 'general';

  const {
    song: displaySong,
    displayedKey,
    normalizedSemitones,
  } = transposeSong(sourceSong, activeSemitones, activeSpelling);

  const { displayedKey: officialDisplayedKey } = transposeSong(
    officialSong,
    session.sharedState.officialSemitones,
    session.sharedState.enharmonicPreference
  );

  const keyOptions = getDestinationKeyOptions(
    sourceSong.originalKey,
    activeSpelling
  );

  const guitarCapoSuggestions = getGuitarCapoSuggestions(displayedKey);
  const currentSetlistSongs = session.sharedState.setlistSongIds
    .map((id) => getSongById(id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  const currentSongSetlistIndex = currentSetlistSongs.findIndex(
    (s) => s.id === session.sharedState.songId
  );

  // Check if active song has a reference audio track in team lineup or personal setlists
  const currentTeamLineup = activeGroup?.activeSetlist || getCachedTeam()?.activeSetlist;
  const activeReferenceAudioUrl =
    currentTeamLineup?.items.find((i) => i.songId === activeSongId)?.referenceAudioUrl ||
    setlists.flatMap((s) => s.items).find((i) => i.songId === activeSongId && i.referenceAudioUrl)?.referenceAudioUrl;

  const activeSectionObj =
    displaySong.sections.find((s) => s.id === activeSectionAnchor) ??
    displaySong.sections[0];

  // Collect distinct chords in the active section for Keyboard & Bass quick summary panels
  const activeSectionChords = Array.from(
    new Set(
      (activeSectionObj?.lines ?? []).flatMap((line) =>
        line.segments
          .map((seg) => seg.chord?.trim())
          .filter((c): c is string => Boolean(c && c !== 'N.C.'))
      )
    )
  );

  const cloudBase = getCloudHubUrl();
  const hostOrigin =
    cloudBase ||
    (typeof window !== 'undefined' ? window.location.origin : '');
  const fullJoinLink = hostOrigin
    ? `${hostOrigin}/live?code=${encodeURIComponent(
        session.joinCode
      )}${
        inviteToken ? `&invite=${encodeURIComponent(inviteToken)}` : ''
      }`
    : `/live?code=${session.joinCode}`;

  const wifiJoinLink = networkOrigin
    ? `${networkOrigin}/live?code=${encodeURIComponent(
        session.joinCode
      )}${
        inviteToken ? `&invite=${encodeURIComponent(inviteToken)}` : ''
      }`
    : fullJoinLink;

  const handleKeyStep = (delta: number) => {
    const next = normalizeSemitones(activeSemitones + delta);
    if (canControlOfficialState && viewMode === 'follow') {
      sendOfficialStateUpdate({ officialSemitones: next });
    } else {
      if (viewMode === 'follow') handleSwitchToIndependent();
      setIndependentSemitones(next);
    }
  };

  const handleTargetKeySelect = (targetSemitones: number) => {
    const next = normalizeSemitones(targetSemitones);
    if (canControlOfficialState && viewMode === 'follow') {
      sendOfficialStateUpdate({ officialSemitones: next });
    } else {
      if (viewMode === 'follow') handleSwitchToIndependent();
      setIndependentSemitones(next);
    }
  };

  const handleResetKey = () => {
    if (canControlOfficialState && viewMode === 'follow') {
      sendOfficialStateUpdate({
        officialSemitones: 0,
        enharmonicPreference: 'auto',
      });
    } else {
      if (viewMode === 'follow') handleSwitchToIndependent();
      setIndependentSemitones(0);
      setIndependentSpelling('auto');
    }
  };

  const handleSectionSelect = (sectionId: string) => {
    if (canControlOfficialState && viewMode === 'follow') {
      sendOfficialStateUpdate({ activeSectionId: sectionId });
    } else {
      if (viewMode === 'follow') handleSwitchToIndependent();
      setIndependentSectionId(sectionId);
      const el = sectionElementsRef.current[sectionId];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  };

  const handleSelectSongInQueue = (targetSongId: string) => {
    setActiveChordEditTarget(null);
    setActiveLineEditTarget(null);
    // Preserve planned song transposition from team lineup or personal setlist
    const activeLineup = effectiveGroup?.activeSetlist || activeSelectedSetlist;
    const lineupItem =
      activeLineup?.items?.find((i) => i.songId === targetSongId) ||
      setlists.flatMap((s) => s.items).find((i) => i.songId === targetSongId);
    const targetSemitones = lineupItem?.preferredSemitones ?? 0;

    if (canControlOfficialState && viewMode === 'follow') {
      sendOfficialStateUpdate({
        songId: targetSongId,
        officialSemitones: targetSemitones,
      });
    } else {
      if (viewMode === 'follow') handleSwitchToIndependent();
      setIndependentSongId(targetSongId);
      setIndependentSemitones(targetSemitones);
    }
  };

  const handleAddSongToLiveQueue = () => {
    if (!canControlOfficialState || !songToAddId) return;
    if (session.sharedState.setlistSongIds.includes(songToAddId)) return;
    sendOfficialStateUpdate({
      setlistSongIds: [...session.sharedState.setlistSongIds, songToAddId],
    });
  };

  const diatonicSuggestionsForDisplayedKey = getSuggestedChordsForKey(displayedKey);
  const currentParticipant = session.participants.find(
    (p) => p.id === participantId
  );

  const showToast = (msg: string) => {
    setArrangementFeedbackToast(msg);
    window.setTimeout(() => {
      setArrangementFeedbackToast((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  const applyArrangementChange = async (
    baseChordPro: string,
    arrangementNote?: string
  ) => {
    if (!canControlOfficialState || viewMode !== 'follow') return;
    if (isBroadcastingEdits) {
      await sendOfficialStateUpdate({
        songArrangementOverride: {
          songId: rawSourceSong.id,
          instrument: targetBroadcastInstrument,
          chordPro: baseChordPro,
          arrangementNote:
            arrangementNote ?? activeSongOverride?.arrangementNote,
        },
      });
      showToast(
        targetBroadcastInstrument === 'general'
          ? 'Pushed live to Band & saved to your Church Group only (not Global).'
          : `Pushed live to ${targetBroadcastInstrument.toUpperCase()} charts & saved to your Church Group only (not Global).`
      );
    } else {
      const nextPersonal = savePersonalInstrumentArrangement({
        songId: rawSourceSong.id,
        songTitle: rawSourceSong.title,
        instrument: instrumentView,
        chordPro: baseChordPro,
        arrangementNote:
          arrangementNote ??
          activeSongOverride?.arrangementNote ??
          `My ${instrumentView} chords`,
        updatedBy: user?.id || participantId || 'local-user',
        updatedByName:
          user?.displayName ||
          currentParticipant?.name ||
          memberNameInput ||
          'Musician',
      });
      setPersonalArrangements(nextPersonal);
      setPreferredArrangementLayer('auto');
      showToast(
        `Saved to your Personal ${
          instrumentView === 'general' ? 'Song' : instrumentView.toUpperCase()
        } Chords.`
      );
    }
  };

  const handleBroadcastLiveOverride = async (payload: {
    songId: string;
    chordPro: string;
    arrangementNote?: string;
  }) => {
    await applyArrangementChange(payload.chordPro, payload.arrangementNote);
  };

  const handleRevertSongToOriginal = async (targetSongId: string) => {
    setActiveChordEditTarget(null);
    setActiveLineEditTarget(null);
    if (
      layeredResult.activeLayer === 'personal-instrument' ||
      !isBroadcastingEdits
    ) {
      const nextPersonal = removePersonalInstrumentArrangement(
        targetSongId,
        instrumentView
      );
      setPersonalArrangements(nextPersonal);
      showToast(`Reset your personal ${instrumentView} arrangement.`);
      return;
    }
    const clearKey =
      targetBroadcastInstrument === 'general'
        ? targetSongId
        : `${targetSongId}:${targetBroadcastInstrument}`;
    await sendOfficialStateUpdate({
      clearSongArrangementOverrideSongId: clearKey,
    });
  };

  const handleSubmitArrangementToGlobalAdmin = async () => {
    if (!activeSongOverride || isSubmittingToAdmin) return;
    const authToken = getSessionToken();
    if (!authToken) {
      setErrorAlert({
        title: 'Sign In Required for Global Admin Permission Request',
        message:
          'Please sign in with your Worship Leader account to ask the Admin for permission to publish this Church Group arrangement globally.',
      });
      return;
    }

    setIsSubmittingToAdmin(true);
    try {
      const arrangedBaseSong = resolveSongWithLiveOverride(
        rawSourceSong,
        activeSongOverride
      );
      const churchLabel =
        effectiveGroup?.churchName ||
        effectiveGroup?.name ||
        user?.churchName ||
        'Church Team';
      const submittedSong = {
        ...arrangedBaseSong,
        updatedAt: new Date().toISOString(),
      };
      const res = await fetch(apiUrl('/api/cloud/submissions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          song: submittedSong,
          submissionNotes: `Global Publish Permission Request from Leader (${churchLabel})${
            activeSongOverride.arrangementNote
              ? ` — "${activeSongOverride.arrangementNote}"`
              : ''
          }`,
        }),
      });
      if (res.ok) {
        showToast(
          'Permission request sent to Admin! Your arrangement remains scoped to your Church Group until the Admin approves it for the Global Catalog.'
        );
      } else {
        const errData = await res.json().catch(() => null);
        setErrorAlert({
          title: 'Global Permission Request Failed',
          message:
            errData?.error ||
            'Could not send global publishing permission request to Admin.',
        });
      }
    } finally {
      setIsSubmittingToAdmin(false);
    }
  };

  const handleInlineChordChange = async (
    sectionId: string,
    lineIndex: number,
    segmentIndex: number,
    newConcertChord: string,
    charOffset: number = 0,
    isTrailing: boolean = false
  ) => {
    let updatedDisplayedSong = displaySong;
    if (isTrailing) {
      updatedDisplayedSong = appendChordToSongSectionLine(
        displaySong,
        sectionId,
        lineIndex,
        newConcertChord
      );
    } else if (charOffset > 0) {
      updatedDisplayedSong = insertChordAtLyricPositionInSong(
        displaySong,
        sectionId,
        lineIndex,
        segmentIndex,
        charOffset,
        newConcertChord
      );
    } else {
      updatedDisplayedSong = replaceChordInSongSectionLine(
        displaySong,
        sectionId,
        lineIndex,
        segmentIndex,
        newConcertChord
      );
    }
    const baseChordPro = convertDisplayedSongToBaseChordPro(
      updatedDisplayedSong,
      rawSourceSong,
      activeSemitones
    );
    setActiveChordEditTarget(null);
    setCustomChordInput('');
    await applyArrangementChange(
      baseChordPro,
      activeSongOverride?.arrangementNote
    );
  };

  const handleNudgeChord = async (
    sectionId: string,
    lineIndex: number,
    segmentIndex: number,
    direction: 'left' | 'right'
  ) => {
    const { song: updatedDisplayedSong, newSegmentIndex } =
      nudgeChordByWordInSongSectionLine(
        displaySong,
        sectionId,
        lineIndex,
        segmentIndex,
        direction
      );
    const baseChordPro = convertDisplayedSongToBaseChordPro(
      updatedDisplayedSong,
      rawSourceSong,
      activeSemitones
    );
    setActiveChordEditTarget((prev) =>
      prev
        ? {
            ...prev,
            segmentIndex: newSegmentIndex,
            charOffset: 0,
            targetWord: undefined,
          }
        : null
    );
    await applyArrangementChange(
      baseChordPro,
      activeSongOverride?.arrangementNote
    );
  };

  const handleInlineLineSave = async () => {
    if (!activeLineEditTarget) return;
    const updatedDisplayedSong = updateLineInSongSection(
      displaySong,
      activeLineEditTarget.sectionId,
      activeLineEditTarget.lineIndex,
      activeLineEditTarget.bracketedText,
      activeLineEditTarget.annotation
    );
    const baseChordPro = convertDisplayedSongToBaseChordPro(
      updatedDisplayedSong,
      rawSourceSong,
      activeSemitones
    );
    setActiveLineEditTarget(null);
    await applyArrangementChange(
      baseChordPro,
      activeSongOverride?.arrangementNote
    );
  };

  const pendingArrangementProposals = (
    session.sharedState.arrangementProposals || []
  ).filter((p) => p.status === 'pending');

  return (
    <div className="space-y-6">
      {/* Top Live Sync Status & Control Banner */}
      <section
        aria-label="Live Session Status Banner"
        className="rounded-2xl border-2 border-[var(--brand-accent)] bg-[var(--bg-surface)] p-4 sm:p-5 space-y-4 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {/* Connection Status Pill */}
              {streamStatus === 'connected' && !simulatedDisconnect ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                  <Wifi className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    {viewMode === 'follow'
                      ? 'Synchronized · Live'
                      : 'Connected · Browsing Independently'}
                  </span>
                </span>
              ) : streamStatus === 'connecting' || streamStatus === 'idle' ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  <span>Connecting to Live Stage...</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
                  <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    {simulatedDisconnect
                      ? 'Reconnecting (Simulated Disconnect)...'
                      : 'Reconnecting to Live Session...'}
                  </span>
                </span>
              )}

              {/* Role Badge */}
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--brand-surface)] text-[var(--brand-accent)]">
                <Crown className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {isPrimaryLeader
                    ? 'You are Leading'
                    : canControlOfficialState
                    ? `Co-Leader (Leading: ${session.leaderName})`
                    : `Led by ${session.leaderName}`}
                </span>
              </span>

              <span className="text-xs font-mono text-[var(--text-secondary)] px-2 py-0.5 rounded bg-[var(--bg-subtle)]">
                Rev #{session.revision}
              </span>
            </div>

            <h1 className="text-lg sm:text-xl font-bold">{session.title}</h1>
          </div>

          {/* Right Action Controls: Join Code, Simulate Reconnect, Leave/End */}
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              {/* Join Code Badge + Copy */}
              <div className="inline-flex items-center rounded-xl border border-[var(--border-strong)] bg-[var(--bg-subtle)] px-3 py-1.5 gap-2">
                <div>
                  <span className="block text-[0.625rem] uppercase tracking-wider text-[var(--text-secondary)]">
                    Join Code
                  </span>
                  <span
                    data-testid="live-join-code"
                    className="font-mono font-bold text-sm sm:text-base tracking-widest text-[var(--brand-accent)]"
                  >
                    {session.joinCode}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(session.joinCode, 'code')}
                  aria-label="Copy join code"
                  className="p-1.5 rounded-lg bg-[var(--bg-surface)] hover:text-[var(--brand-accent)] text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
                >
                  {copiedField === 'code' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                      <span className="text-emerald-400 font-bold">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Code</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => copyToClipboard(fullJoinLink, 'link')}
                  aria-label="Copy invite link"
                  className="p-1.5 rounded-lg bg-[var(--bg-surface)] hover:text-[var(--brand-accent)] text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
                  title="Copy full invite link for this device"
                >
                  {copiedField === 'link' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                      <span className="text-emerald-400 font-bold">Copied</span>
                    </>
                  ) : (
                    <>
                      <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Invite Link</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowQrModal(true)}
                  aria-label="Show QR Code for phones"
                  className="p-1.5 rounded-lg bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-all"
                  title="Display QR code for phones and tablets to scan and join instantly"
                >
                  <QrCode className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>QR Code</span>
                </button>
                {networkOrigin && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(wifiJoinLink, 'network')}
                    aria-label="Copy Wi-Fi link for band members"
                    className="p-1.5 rounded-lg bg-[var(--bg-surface)] hover:text-[var(--brand-accent)] text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
                    title="Share this link with band members on the same Wi-Fi network"
                  >
                    {copiedField === 'network' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                        <span className="text-emerald-400 font-bold">Copied Wi-Fi</span>
                      </>
                    ) : (
                      <>
                        <Wifi className="w-3.5 h-3.5 text-[var(--brand-accent)]" aria-hidden="true" />
                        <span>Wi-Fi Link</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Test Reconnection Button */}
              <button
                type="button"
                onClick={() => setSimulatedDisconnect((prev) => !prev)}
              className={`px-3 py-2 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                simulatedDisconnect
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                {simulatedDisconnect ? 'Reconnect Now' : 'Test Reconnect'}
              </span>
            </button>

            {isPrimaryLeader ? (
              <button
                type="button"
                onClick={handleEndSession}
                className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs sm:text-sm font-semibold cursor-pointer"
              >
                End Session
              </button>
            ) : (
              <button
                type="button"
                onClick={handleLeaveLocalSession}
                className="px-3.5 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-xs sm:text-sm font-semibold hover:border-rose-500/40 cursor-pointer"
              >
                Leave Session
              </button>
            )}
          </div>

            {networkOrigin && (
              <div className="text-[0.6875rem] text-[var(--text-secondary)] flex items-center gap-1.5 px-1">
                <Wifi className="w-3 h-3 text-[var(--brand-accent)] shrink-0" />
                <span>Band Wi-Fi:</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(wifiJoinLink, 'network')}
                  className="font-mono text-[var(--brand-accent)] underline hover:text-[var(--brand-accent)]/80 text-left truncate max-w-[280px] sm:max-w-[420px] cursor-pointer"
                  title="Click to copy full Wi-Fi join link"
                >
                  {wifiJoinLink}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Follower Mode Toggle Bar: Follow Leader vs. Browse Independently */}
        <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">
              Sync Mode:
            </span>
            <div
              role="group"
              aria-label="Synchronization viewing mode"
              className="inline-flex rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-1 text-xs"
            >
              <button
                type="button"
                onClick={handleReturnToLeader}
                aria-pressed={viewMode === 'follow'}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                  viewMode === 'follow'
                    ? 'bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/35 shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Follow Leader
              </button>
              <button
                type="button"
                onClick={handleSwitchToIndependent}
                aria-pressed={viewMode === 'independent'}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                  viewMode === 'independent'
                    ? 'bg-amber-600 text-white'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                Browse Independently
              </button>
            </div>

            {viewMode === 'independent' && (
              <button
                type="button"
                onClick={handleReturnToLeader}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/35 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] text-xs font-bold shadow-xs cursor-pointer transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  Return to Leader ({officialSong.title} · Key of{' '}
                  {officialDisplayedKey} ·{' '}
                  {session.sharedState.activeSectionLabel})
                </span>
              </button>
            )}
          </div>

          {/* Instrument View Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">
              Instrument View:
            </span>
            <div
              role="group"
              aria-label="Instrument guidance view"
              className="inline-flex flex-wrap rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-1 text-xs"
            >
              {(['general', 'guitar', 'keyboard', 'bass'] as const).map(
                (inst) => (
                  <button
                    key={inst}
                    type="button"
                    onClick={() => handleInstrumentChange(inst)}
                    aria-pressed={instrumentView === inst}
                    className={`px-2.5 py-1.5 rounded-lg font-semibold capitalize transition-colors cursor-pointer ${
                      instrumentView === inst
                        ? 'bg-[var(--bg-surface)] text-[var(--brand-accent)] shadow-xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {inst}
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </section>

      {errorAlert && (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs sm:text-sm text-rose-700 dark:text-rose-300 flex items-center justify-between gap-3"
        >
          <span>
            <strong>{errorAlert.title}:</strong> {errorAlert.message}
          </span>
          <button
            type="button"
            onClick={() => setErrorAlert(null)}
            className="underline font-semibold cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Live Grid: Left/Center = Synchronized Chart & Controls, Right = Setlist Queue & Connected Team */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left/Center 8 Columns: Active Song Transposition & Synchronized Chart */}
        <div className="lg:col-span-8 space-y-5">
          {/* Song Header & Key Controls */}
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[var(--bg-subtle)]">
                    {displaySong.language.label}
                  </span>
                  <span className="text-xs text-[var(--text-secondary)]">
                    {displaySong.category.label}
                  </span>
                  {displaySong.tempoBpm && (
                    <span className="text-xs text-[var(--text-secondary)]">
                      · {displaySong.tempoBpm} BPM ({displaySong.timeSignature})
                    </span>
                  )}
                </div>
                <h2 className="text-2xl font-bold">{displaySong.title}</h2>
                {displaySong.artist && (
                  <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
                    {displaySong.artist}
                  </p>
                )}
              </div>

              {/* Prev / Next Song in Setlist Controls & Leader-Only Live Arrangement Push Controls */}
              <div className="flex flex-wrap items-center gap-1.5">
                {canControlOfficialState && viewMode === 'follow' && (
                  <>
                    <select
                      aria-label="Leader arrangement edit scope"
                      data-testid="leader-edit-scope-select"
                      value={leaderEditScope}
                      onChange={(e) =>
                        setLeaderEditScope(
                          e.target.value as 'band' | 'instrument' | 'personal'
                        )
                      }
                      className="h-9 px-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-xs font-semibold cursor-pointer"
                      title="Leader pushes chord & lyric changes to your Church Group only (not Global)"
                    >
                      <option value="band">
                        Push to Church Group: Entire Band (Not Global)
                      </option>
                      {instrumentView !== 'general' && (
                        <option value="instrument">
                          Push to Church Group: {instrumentView.toUpperCase()}{' '}
                          Only (Not Global)
                        </option>
                      )}
                      <option value="personal">
                        Save Only to My Personal {instrumentView} Chords
                      </option>
                    </select>

                    <button
                      type="button"
                      onClick={() => {
                        setIsQuickEditMode((prev) => !prev);
                        setActiveChordEditTarget(null);
                        setActiveLineEditTarget(null);
                      }}
                      aria-pressed={isQuickEditMode}
                      data-testid="live-quick-edit-toggle"
                      className={`px-3 py-2 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                        isQuickEditMode
                          ? 'bg-[var(--brand-accent)] text-[#0c0c10] border-[var(--brand-accent)] shadow-xs'
                          : 'border-[var(--brand-accent)]/40 bg-[var(--brand-surface)] text-[var(--brand-accent)] hover:bg-[var(--brand-accent)] hover:text-[#0c0c10]'
                      }`}
                      title="Leader only: Tap any word or chord directly on the live chart to push changes to your Church Group"
                    >
                      <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>
                        {isQuickEditMode
                          ? 'Exit Quick Tap Edit'
                          : 'Quick-Tap Edit Chart (Church Group)'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowArrangementModal(true)}
                      data-testid="open-live-arrangement-studio-btn"
                      className="px-3 py-2 rounded-xl border border-[var(--brand-accent)]/40 bg-[var(--brand-surface)] text-[var(--brand-accent)] hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                      title="Leader only: Open Chords & Lyrics Studio to push changes to your Church Group"
                    >
                      <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Arrange Chords &amp; Lyrics</span>
                    </button>

                    <button
                      type="button"
                      disabled={currentSongSetlistIndex <= 0}
                      onClick={() => {
                        const prevSong =
                          currentSetlistSongs[currentSongSetlistIndex - 1];
                        if (prevSong) handleSelectSongInQueue(prevSong.id);
                      }}
                      className="px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Prev Song</span>
                    </button>
                    <button
                      type="button"
                      disabled={
                        currentSongSetlistIndex < 0 ||
                        currentSongSetlistIndex >= currentSetlistSongs.length - 1
                      }
                      onClick={() => {
                        const nextSong =
                          currentSetlistSongs[currentSongSetlistIndex + 1];
                        if (nextSong) handleSelectSongInQueue(nextSong.id);
                      }}
                      className="px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-40 cursor-pointer"
                    >
                      <span>Next Song</span>
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Toast Feedback Notification */}
            {arrangementFeedbackToast && (
              <div
                role="status"
                data-testid="arrangement-feedback-toast"
                className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-400 flex items-center justify-between gap-2"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  <span>{arrangementFeedbackToast}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setArrangementFeedbackToast(null)}
                  className="underline text-[11px] cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Active Arrangement Banner (Personal Instrument, Church Instrument, or Live Band Master) */}
            {(activeSongOverride || layeredResult.hasPersonalInstrumentOverride) && (
              <div
                data-testid="live-arrangement-active-banner"
                className="rounded-xl border border-[var(--brand-accent)]/40 bg-[var(--brand-surface)] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 font-bold text-[var(--brand-accent)]">
                    <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>
                      {layeredResult.activeLayer === 'personal-instrument'
                        ? `My Personal ${instrumentView.toUpperCase()} Arrangement Active (Carried over from Rehearsal)`
                        : layeredResult.activeLayer === 'live-instrument' ||
                          layeredResult.activeLayer === 'group-instrument'
                        ? `Church Group ${instrumentView.toUpperCase()} Arrangement Active (Church Only)`
                        : 'Church Group Live Arrangement Active (Church Only)'}
                    </span>
                  </span>
                  {activeSongOverride?.updatedByName && (
                    <span className="text-[var(--text-secondary)]">
                      · Arranged by{' '}
                      <strong className="text-[var(--text-primary)]">
                        {activeSongOverride.updatedByName}
                      </strong>
                    </span>
                  )}
                  {activeSongOverride?.arrangementNote && (
                    <span className="px-2 py-0.5 rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)] font-semibold text-[var(--text-primary)]">
                      “{activeSongOverride.arrangementNote}”
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Layer Switcher Pill if user has a personal override */}
                  {layeredResult.hasPersonalInstrumentOverride && (
                    <button
                      type="button"
                      data-testid="toggle-personal-vs-official-chart-btn"
                      onClick={() =>
                        setPreferredArrangementLayer((prev) =>
                          prev === 'band-master' ? 'auto' : 'band-master'
                        )
                      }
                      className="px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] font-semibold hover:border-[var(--brand-accent)] cursor-pointer"
                    >
                      {preferredArrangementLayer === 'band-master'
                        ? `Use My ${instrumentView.toUpperCase()} Chords`
                        : 'Compare with Official Band Chart'}
                    </button>
                  )}

                  {/* Leader Request Admin Permission for Global Publishing */}
                  {canControlOfficialState &&
                    activeSongOverride &&
                    layeredResult.activeLayer !== 'personal-instrument' && (
                      <button
                        type="button"
                        disabled={isSubmittingToAdmin}
                        data-testid="submit-arrangement-to-admin-btn"
                        onClick={handleSubmitArrangementToGlobalAdmin}
                        className="px-2.5 py-1 rounded-lg border border-[var(--brand-accent)]/40 bg-[var(--bg-surface)] text-[var(--brand-accent)] hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                        title="Ask Admin for permission to publish this Church Group arrangement globally"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>
                          {isSubmittingToAdmin
                            ? 'Requesting Admin Approval...'
                            : 'Ask Admin to Publish Globally'}
                        </span>
                      </button>
                    )}

                  {canControlOfficialState && viewMode === 'follow' && (
                    <button
                      type="button"
                      onClick={() => setShowArrangementModal(true)}
                      className="text-xs font-bold text-[var(--brand-accent)] hover:underline cursor-pointer"
                    >
                      Edit Arrangement
                    </button>
                  )}
                  {activeSongOverride &&
                    (canControlOfficialState ||
                      layeredResult.activeLayer === 'personal-instrument') && (
                      <button
                        type="button"
                        onClick={() =>
                          handleRevertSongToOriginal(rawSourceSong.id)
                        }
                        className="text-xs font-semibold text-rose-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>
                          {layeredResult.activeLayer === 'personal-instrument'
                            ? 'Reset My Local Edits'
                            : 'Revert Church Arrangement'}
                        </span>
                      </button>
                    )}
                </div>
              </div>
            )}

            {/* Quick-Tap Edit Mode Helper Bar */}
            {canEditChartInLive && isQuickEditMode && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-300">
                <div className="flex items-center gap-2">
                  <Edit3 className="w-4 h-4 shrink-0" />
                  <span>
                    <strong>
                      {isBroadcastingEdits
                        ? `Free-Position Live Tap Edit (${
                            targetBroadcastInstrument === 'general'
                              ? 'Entire Band'
                              : targetBroadcastInstrument.toUpperCase()
                          }):`
                        : `Personal ${instrumentView.toUpperCase()} Tap Edit (Only on your screen):`}
                    </strong>{' '}
                    Tap <strong>any word in the lyrics</strong> to drop a chord
                    right above that word, tap any{' '}
                    <strong>existing chord</strong> to swap or slide it{' '}
                    <strong>← / →</strong> across words, or tap{' '}
                    <strong>Edit Words &amp; Chords</strong> to rewrite lyrics at
                    your cursor.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsQuickEditMode(false);
                    setActiveChordEditTarget(null);
                    setActiveLineEditTarget(null);
                  }}
                  className="underline font-bold cursor-pointer shrink-0"
                >
                  Done
                </button>
              </div>
            )}

            {/* Transposition & Section Bar */}
            <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div
                  role="group"
                  aria-label="Live transposition controls"
                  className="inline-flex items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-1"
                >
                  <button
                    type="button"
                    onClick={() => handleKeyStep(-1)}
                    aria-label="Transpose down 1 semitone"
                    className="w-9 h-9 inline-flex items-center justify-center rounded-lg bg-[var(--bg-surface)] font-bold cursor-pointer"
                  >
                    <Minus className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <div className="px-3 text-center min-w-[4.5rem]">
                    <span className="block text-[0.625rem] uppercase tracking-wider text-[var(--text-secondary)]">
                      {viewMode === 'follow' ? 'Official Key' : 'Local Key'}
                    </span>
                    <span
                      data-testid="live-displayed-key"
                      className="font-mono font-bold text-base text-[var(--brand-accent)]"
                    >
                      {displayedKey}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleKeyStep(1)}
                    aria-label="Transpose up 1 semitone"
                    className="w-9 h-9 inline-flex items-center justify-center rounded-lg bg-[var(--bg-surface)] font-bold cursor-pointer"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>

                <select
                  aria-label="Select destination key"
                  value={normalizedSemitones}
                  onChange={(e) => handleTargetKeySelect(Number(e.target.value))}
                  className="h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 font-mono font-semibold text-sm cursor-pointer"
                >
                  {keyOptions.map((opt) => (
                    <option
                      key={opt.semitonesFromOriginal}
                      value={opt.semitonesFromOriginal}
                    >
                      {opt.key}
                      {opt.semitonesFromOriginal === 0
                        ? ' (Orig)'
                        : ` (${formatSignedSemitones(
                            opt.semitonesFromOriginal
                          )})`}
                    </option>
                  ))}
                </select>

                {normalizedSemitones !== 0 && (
                  <button
                    type="button"
                    onClick={handleResetKey}
                    className="h-11 px-3 rounded-xl border border-[var(--brand-accent)] bg-[var(--brand-surface)] text-[var(--brand-accent)] text-xs font-semibold cursor-pointer"
                  >
                    Reset ({sourceSong.originalKey})
                  </button>
                )}
              </div>

              <div className="text-xs text-[var(--text-secondary)]">
                {canControlOfficialState && viewMode === 'follow'
                  ? 'Changes broadcast immediately to all followers.'
                  : viewMode === 'follow'
                  ? 'Adjusting key or section switches you to Browse Independently.'
                  : 'Browsing locally — official session key remains ' +
                    officialDisplayedKey +
                    '.'}
              </div>
            </div>

            {/* Section Anchor Navigation Pills */}
            <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center gap-1.5 overflow-x-auto text-xs">
              <span className="font-semibold text-[var(--text-secondary)] shrink-0 mr-1">
                Active Section:
              </span>
              {displaySong.sections.map((sec) => {
                const isActive = sec.id === activeSectionAnchor;
                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => handleSectionSelect(sec.id)}
                    aria-pressed={isActive}
                    className={`px-3 py-1.5 rounded-lg font-semibold shrink-0 transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/35 shadow-xs'
                        : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {sec.label}
                  </button>
                );
              })}
            </div>

            {/* In-Ear Reference Audio Player (Strictly local to this device) */}
            {activeReferenceAudioUrl && (
              <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setShowLiveAudioPlayer(!showLiveAudioPlayer)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] text-xs font-bold transition-all shadow-xs cursor-pointer"
                  >
                    <Headphones className="w-3.5 h-3.5" />
                    <span>
                      {showLiveAudioPlayer
                        ? 'Hide In-Ear Reference Audio'
                        : 'Play In-Ear Reference Audio (Sifra / Practice)'}
                    </span>
                  </button>
                  <span className="text-[11px] text-[var(--text-secondary)] italic">
                    Plays locally in your earphones • Zero sound sent to other members
                  </span>
                </div>

                {showLiveAudioPlayer && (
                  <ReferenceAudioPlayer
                    url={activeReferenceAudioUrl}
                    songTitle={`${displaySong.title} (${displayedKey})`}
                    compact={true}
                  />
                )}
              </div>
            )}
          </div>

          {/* Instrument-Specific Guidance Panel (Guitar / Keyboard / Bass) */}
          {instrumentView === 'guitar' && (
            <section
              aria-label="Guitar Capo and Shape Guidance"
              className="rounded-2xl border border-[var(--brand-accent)]/40 bg-[var(--brand-surface)] p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2 font-bold text-sm text-[var(--brand-accent)]">
                  <Guitar className="w-4 h-4" aria-hidden="true" />
                  <span>
                    Guitar Guidance — Concert Key of {displayedKey}
                  </span>
                </div>
                <span className="text-xs text-[var(--text-secondary)]">
                  Select a capo position to display capo-relative chord shapes
                  in the chart
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedCapoFret(0)}
                  aria-pressed={selectedCapoFret === 0}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                    selectedCapoFret === 0
                      ? 'bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/35 shadow-xs'
                      : 'bg-[var(--bg-surface)] border-[var(--border-subtle)]'
                  }`}
                >
                  Concert Chords (No Capo)
                </button>
                {guitarCapoSuggestions
                  .filter((s) => s.capoFret > 0)
                  .map((sug) => (
                    <button
                      key={sug.capoFret}
                      type="button"
                      onClick={() => setSelectedCapoFret(sug.capoFret)}
                      aria-pressed={selectedCapoFret === sug.capoFret}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                        selectedCapoFret === sug.capoFret
                          ? 'bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/35 shadow-xs'
                          : 'bg-[var(--bg-surface)] border-[var(--border-subtle)]'
                      }`}
                    >
                      {sug.description}
                    </button>
                  ))}
              </div>
            </section>
          )}

          {instrumentView === 'keyboard' && (
            <section
              aria-label="Keyboard Voicing Guidance"
              className="rounded-2xl border border-[var(--brand-accent)]/40 bg-[var(--brand-surface)] p-4 space-y-3"
            >
              <div className="inline-flex items-center gap-2 font-bold text-sm text-[var(--brand-accent)]">
                <Piano className="w-4 h-4" aria-hidden="true" />
                <span>
                  Keyboard Voicings for Active Section (
                  {activeSectionObj?.label}) — Key of {displayedKey}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {activeSectionChords.map((chord) => {
                  const v = getKeyboardVoicing(
                    chord,
                    activeSpelling,
                    displayedKey
                  );
                  if (!v) return null;
                  return (
                    <div
                      key={chord}
                      className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-2.5 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between font-mono font-bold">
                        <span className="text-[var(--brand-accent)] text-sm">
                          {v.chord}
                        </span>
                        <span>
                          LH: {v.leftHandBass} · RH:{' '}
                          {v.rightHandNotes.join(' – ')}
                        </span>
                      </div>
                      <p className="text-[var(--text-secondary)]">
                        {v.voicingTip}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {instrumentView === 'bass' && (
            <section
              aria-label="Bass Guitar Guidance"
              className="rounded-2xl border border-[var(--brand-accent)]/40 bg-[var(--brand-surface)] p-4 space-y-3"
            >
              <div className="inline-flex items-center gap-2 font-bold text-sm text-[var(--brand-accent)]">
                <Sliders className="w-4 h-4" aria-hidden="true" />
                <span>
                  Bass Pedal & Inversion Map ({activeSectionObj?.label}) — Key
                  of {displayedKey}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {activeSectionChords.map((chord) => {
                  const b = getBassGuidanceForChord(
                    chord,
                    activeSpelling,
                    displayedKey
                  );
                  if (!b) return null;
                  return (
                    <div
                      key={chord}
                      className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-2 text-xs"
                    >
                      <div className="font-mono font-bold text-sm text-[var(--brand-accent)]">
                        {b.chord} → Play Bass: {b.primaryBass}
                      </div>
                      <div className="text-[var(--text-secondary)]">
                        {b.isSlashInversion
                          ? `Slash inversion (Root: ${b.chordRoot}, 5th: ${b.fifthNote})`
                          : `Root note (5th: ${b.fifthNote})`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Synchronized Song Sections */}
          <article aria-label="Live Synchronized Song Chart" className="space-y-4">
            {displaySong.sections.map((section) => {
              const isHighlighted = section.id === activeSectionAnchor;
              return (
                <section
                  key={section.id}
                  data-section-id={section.id}
                  ref={(el) => {
                    sectionElementsRef.current[section.id] = el;
                  }}
                  onClick={() => handleSectionSelect(section.id)}
                  className={`rounded-2xl border p-5 transition-all cursor-pointer ${
                    isHighlighted
                      ? 'border-2 border-[var(--brand-accent)] bg-[var(--bg-surface)] shadow-md'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-surface)] opacity-85 hover:opacity-100'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b border-[var(--border-subtle)]">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm sm:text-base font-bold uppercase tracking-wider text-[var(--brand-accent)]">
                        {section.label}
                      </h3>
                      {isHighlighted && (
                        <span className="text-[0.6875rem] font-bold uppercase px-2 py-0.5 rounded-full bg-[var(--brand-surface)] text-[var(--brand-accent)]">
                          Active Section
                        </span>
                      )}
                    </div>
                    {section.cue && (
                      <span className="text-xs italic text-[var(--text-secondary)]">
                        {section.cue}
                      </span>
                    )}
                  </div>

                  <div className="space-y-4">
                    {section.lines.map((line, lineIdx) => {
                      const instrumental = isLineInstrumental(line);
                      const isEditingThisLine =
                        canEditChartInLive &&
                        activeLineEditTarget?.sectionId === section.id &&
                        activeLineEditTarget?.lineIndex === lineIdx;

                      const formatDisplayedChord = (rawChord?: string) => {
                        if (!rawChord) return '\u00A0';
                        if (
                          instrumentView === 'guitar' &&
                          selectedCapoFret > 0
                        ) {
                          const capoShape = getCapoRelativeChord(
                            rawChord,
                            selectedCapoFret
                          );
                          return `${rawChord} [${capoShape}]`;
                        }
                        if (instrumentView === 'bass') {
                          const bassInfo = getBassGuidanceForChord(
                            rawChord,
                            activeSpelling,
                            displayedKey
                          );
                          if (bassInfo && bassInfo.isSlashInversion) {
                            return `${rawChord} (Bass: ${bassInfo.primaryBass})`;
                          }
                        }
                        return rawChord;
                      };

                      const renderChordPickerPopover = () => {
                        const isTarget =
                          canEditChartInLive &&
                          activeChordEditTarget?.sectionId === section.id &&
                          activeChordEditTarget?.lineIndex === lineIdx;

                        if (!isTarget || !activeChordEditTarget) return null;

                        const {
                          segmentIndex: segIdx,
                          charOffset,
                          targetWord,
                          currentChord,
                          isTrailing,
                        } = activeChordEditTarget;

                        const headerLabel = isTrailing
                          ? `Add Chord at End of Line (Key of ${displayedKey})`
                          : charOffset > 0 && targetWord
                          ? `Add Chord Above "${targetWord}" (Key of ${displayedKey})`
                          : currentChord
                          ? `Chord "${currentChord}"${
                              targetWord ? ` on "${targetWord}"` : ''
                            } (Key of ${displayedKey})`
                          : `Add Chord${
                              targetWord ? ` Above "${targetWord}"` : ''
                            } (Key of ${displayedKey})`;

                        return (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            data-testid="inline-chord-picker-popover"
                            className="mt-1.5 mb-2 p-3.5 rounded-xl border-2 border-[var(--brand-accent)] bg-[var(--bg-surface)] shadow-xl space-y-2.5 z-30 max-w-lg"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-bold text-[var(--brand-accent)]">
                                {headerLabel}
                              </span>
                              <button
                                type="button"
                                onClick={() => setActiveChordEditTarget(null)}
                                className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                              >
                                Close
                              </button>
                            </div>

                            {/* 1-Tap Diatonic Chord Buttons */}
                            <div className="flex flex-wrap gap-1.5">
                              {diatonicSuggestionsForDisplayedKey.map((sug) => (
                                <button
                                  key={sug}
                                  type="button"
                                  onClick={() =>
                                    handleInlineChordChange(
                                      section.id,
                                      lineIdx,
                                      segIdx,
                                      sug,
                                      charOffset,
                                      Boolean(isTrailing)
                                    )
                                  }
                                  className={`px-2.5 py-1 rounded-lg font-mono font-bold text-xs border cursor-pointer transition-colors ${
                                    sug === currentChord &&
                                    charOffset === 0 &&
                                    !isTrailing
                                      ? 'bg-[var(--brand-accent)] text-[#0c0c10] border-[var(--brand-accent)]'
                                      : 'bg-[var(--brand-surface)] text-[var(--brand-accent)] border-[var(--brand-accent)]/30 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10]'
                                  }`}
                                >
                                  {sug}
                                </button>
                              ))}
                              {currentChord &&
                                charOffset === 0 &&
                                !isTrailing && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleInlineChordChange(
                                        section.id,
                                        lineIdx,
                                        segIdx,
                                        '',
                                        0,
                                        false
                                      )
                                    }
                                    className="px-2.5 py-1 rounded-lg font-sans font-semibold text-xs border border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 cursor-pointer"
                                  >
                                    Remove Chord
                                  </button>
                                )}
                            </div>

                            {/* Word Nudge Controls (Move Chord Left / Right Across Lyrics) + Edit Words Shortcut */}
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[var(--border-subtle)]">
                              {currentChord &&
                              charOffset === 0 &&
                              !isTrailing &&
                              !instrumental ? (
                                <div className="inline-flex items-center gap-1.5">
                                  <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                                    Position:
                                  </span>
                                  <button
                                    type="button"
                                    data-testid="nudge-chord-left-btn"
                                    onClick={() =>
                                      handleNudgeChord(
                                        section.id,
                                        lineIdx,
                                        segIdx,
                                        'left'
                                      )
                                    }
                                    className="px-2 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-[var(--brand-accent)] text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                                    title="Slide this chord one word to the left"
                                  >
                                    <ArrowLeft className="w-3 h-3" />
                                    <span>Word Left</span>
                                  </button>
                                  <button
                                    type="button"
                                    data-testid="nudge-chord-right-btn"
                                    onClick={() =>
                                      handleNudgeChord(
                                        section.id,
                                        lineIdx,
                                        segIdx,
                                        'right'
                                      )
                                    }
                                    className="px-2 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-[var(--brand-accent)] text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                                    title="Slide this chord one word to the right"
                                  >
                                    <span>Word Right</span>
                                    <ArrowRight className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[11px] text-[var(--text-secondary)]">
                                  Tap any chord above to place it right here
                                </span>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  const bracketed =
                                    formatSongLineForQuickEdit(line);
                                  setActiveChordEditTarget(null);
                                  inlineLineCursorRef.current = bracketed.length;
                                  setActiveLineEditTarget({
                                    sectionId: section.id,
                                    lineIndex: lineIdx,
                                    bracketedText: bracketed,
                                    annotation: line.annotation || '',
                                  });
                                }}
                                className="px-2.5 py-1 rounded-lg border border-[var(--brand-accent)]/40 bg-[var(--brand-surface)] text-[var(--brand-accent)] text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>Edit Lyrics &amp; Chords Text</span>
                              </button>
                            </div>

                            {/* Custom Chord Symbol Input */}
                            <div className="flex items-center gap-1.5 pt-1">
                              <input
                                type="text"
                                aria-label="Custom chord symbol"
                                value={customChordInput}
                                onChange={(e) =>
                                  setCustomChordInput(e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (
                                    e.key === 'Enter' &&
                                    customChordInput.trim()
                                  ) {
                                    e.preventDefault();
                                    handleInlineChordChange(
                                      section.id,
                                      lineIdx,
                                      segIdx,
                                      customChordInput.trim(),
                                      charOffset,
                                      Boolean(isTrailing)
                                    );
                                  }
                                }}
                                placeholder="Custom chord (e.g. D/F#, Asus4, Bm7)"
                                className="flex-1 h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] font-mono text-xs"
                              />
                              <button
                                type="button"
                                disabled={!customChordInput.trim()}
                                onClick={() =>
                                  handleInlineChordChange(
                                    section.id,
                                    lineIdx,
                                    segIdx,
                                    customChordInput.trim(),
                                    charOffset,
                                    Boolean(isTrailing)
                                  )
                                }
                                className="px-3 h-8 rounded-lg bg-[var(--brand-accent)] text-[#0c0c10] font-bold text-xs cursor-pointer disabled:opacity-40"
                              >
                                Apply
                              </button>
                            </div>
                          </div>
                        );
                      };

                      if (isEditingThisLine && activeLineEditTarget) {
                        return (
                          <div
                            key={lineIdx}
                            onClick={(e) => e.stopPropagation()}
                            className="p-3.5 rounded-xl border-2 border-[var(--brand-accent)] bg-[var(--bg-subtle)] space-y-2.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-xs font-bold text-[var(--brand-accent)]">
                                Live Edit Line #{lineIdx + 1} — Click anywhere in
                                the lyrics below &amp; tap a +{displayedKey}{' '}
                                chord to insert at your cursor:
                              </span>
                              <div className="flex flex-wrap gap-1">
                                {diatonicSuggestionsForDisplayedKey.map(
                                  (chord) => (
                                    <button
                                      key={chord}
                                      type="button"
                                      onClick={() => {
                                        const inputEl =
                                          inlineLineInputRef.current;
                                        const curPos =
                                          inputEl?.selectionStart ??
                                          inlineLineCursorRef.current ??
                                          activeLineEditTarget.bracketedText
                                            .length;
                                        const { nextText, nextCursor } =
                                          insertChordAtCursor(
                                            activeLineEditTarget.bracketedText,
                                            curPos,
                                            chord
                                          );
                                        inlineLineCursorRef.current =
                                          nextCursor;
                                        setActiveLineEditTarget((prev) =>
                                          prev
                                            ? {
                                                ...prev,
                                                bracketedText: nextText,
                                              }
                                            : null
                                        );
                                        window.requestAnimationFrame(() => {
                                          if (inlineLineInputRef.current) {
                                            inlineLineInputRef.current.focus();
                                            inlineLineInputRef.current.setSelectionRange(
                                              nextCursor,
                                              nextCursor
                                            );
                                          }
                                        });
                                      }}
                                      className="px-2 py-0.5 rounded bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] font-mono font-bold text-[11px] cursor-pointer transition-colors"
                                      title={`Insert [${chord}] at cursor position`}
                                    >
                                      +{chord}
                                    </button>
                                  )
                                )}
                              </div>
                            </div>
                            <input
                              ref={inlineLineInputRef}
                              type="text"
                              aria-label="Edit line chords and lyrics"
                              value={activeLineEditTarget.bracketedText}
                              onClick={(e) => {
                                inlineLineCursorRef.current =
                                  e.currentTarget.selectionStart;
                              }}
                              onKeyUp={(e) => {
                                inlineLineCursorRef.current =
                                  e.currentTarget.selectionStart;
                              }}
                              onChange={(e) => {
                                inlineLineCursorRef.current =
                                  e.target.selectionStart;
                                setActiveLineEditTarget((prev) =>
                                  prev
                                    ? { ...prev, bracketedText: e.target.value }
                                    : null
                                );
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleInlineLineSave();
                                } else if (e.key === 'Escape') {
                                  e.preventDefault();
                                  setActiveLineEditTarget(null);
                                }
                              }}
                              placeholder="Type lyrics and place chords in brackets like [G]Amazing [D/F#]grace"
                              className="w-full h-10 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] font-mono text-xs sm:text-sm"
                            />
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <input
                                type="text"
                                aria-label="Optional line performance cue"
                                value={activeLineEditTarget.annotation}
                                onChange={(e) =>
                                  setActiveLineEditTarget((prev) =>
                                    prev
                                      ? { ...prev, annotation: e.target.value }
                                      : null
                                  )
                                }
                                placeholder="Optional cue above line (e.g. Build on drums, A cappella)"
                                className="flex-1 min-w-[180px] h-8 px-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs"
                              />
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setActiveLineEditTarget(null)}
                                  className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-semibold cursor-pointer"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={handleInlineLineSave}
                                  className="px-3.5 py-1.5 rounded-lg bg-[var(--brand-accent)] text-[#0c0c10] text-xs font-bold cursor-pointer"
                                >
                                  Broadcast Line Update
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      if (instrumental) {
                        const isPopoverOnThisLine =
                          activeChordEditTarget?.sectionId === section.id &&
                          activeChordEditTarget?.lineIndex === lineIdx;
                        const canTapChord =
                          canEditChartInLive && isQuickEditMode;
                        return (
                          <div key={lineIdx} className="chart-line-scroll py-1">
                            <div className="inline-flex flex-wrap items-center gap-2 font-mono font-bold">
                              <span className="text-xs font-sans uppercase text-[var(--text-secondary)]">
                                Chords:
                              </span>
                              {line.segments.map((seg, segIdx) => (
                                <span
                                  key={segIdx}
                                  onClick={(e) => {
                                    if (!canTapChord) return;
                                    e.stopPropagation();
                                    setCustomChordInput(seg.chord || '');
                                    setActiveChordEditTarget({
                                      sectionId: section.id,
                                      lineIndex: lineIdx,
                                      segmentIndex: segIdx,
                                      charOffset: 0,
                                      currentChord: seg.chord || '',
                                    });
                                  }}
                                  className={`px-2.5 py-1 rounded-lg bg-[var(--chord-bg)] text-[var(--chord-color)] border ${
                                    canTapChord
                                      ? 'border-[var(--brand-accent)] hover:bg-[var(--brand-surface)] cursor-pointer'
                                      : 'border-[var(--border-subtle)]'
                                  }`}
                                >
                                  | {formatDisplayedChord(seg.chord)}
                                </span>
                              ))}
                              <span>|</span>
                              {canTapChord && (
                                <>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setCustomChordInput('');
                                      setActiveChordEditTarget({
                                        sectionId: section.id,
                                        lineIndex: lineIdx,
                                        segmentIndex: line.segments.length,
                                        charOffset: 0,
                                        currentChord: '',
                                        isTrailing: true,
                                      });
                                    }}
                                    className="px-2 py-0.5 rounded-md border border-dashed border-[var(--brand-accent)]/60 bg-[var(--brand-surface)] text-[var(--brand-accent)] font-mono text-[11px] font-bold cursor-pointer"
                                    title="Add another chord to this progression"
                                  >
                                    + Add Chord
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveChordEditTarget(null);
                                      setActiveLineEditTarget({
                                        sectionId: section.id,
                                        lineIndex: lineIdx,
                                        bracketedText:
                                          formatSongLineForQuickEdit(line),
                                        annotation: line.annotation || '',
                                      });
                                    }}
                                    className="px-2 py-0.5 rounded-md border border-[var(--brand-accent)]/40 bg-[var(--brand-surface)] text-[var(--brand-accent)] font-sans text-[11px] font-semibold cursor-pointer"
                                  >
                                    Edit Chords &amp; Lyrics
                                  </button>
                                </>
                              )}
                            </div>
                            {isPopoverOnThisLine && renderChordPickerPopover()}
                          </div>
                        );
                      }

                      const isPopoverOnThisLine =
                        activeChordEditTarget?.sectionId === section.id &&
                        activeChordEditTarget?.lineIndex === lineIdx;
                      const canTapChart =
                        canEditChartInLive && isQuickEditMode;

                      return (
                        <div key={lineIdx} className="chart-line-scroll">
                          {line.annotation && (
                            <div className="text-[11px] italic text-[var(--brand-accent)] mb-0.5">
                              [{line.annotation}]
                            </div>
                          )}
                          <div className="flex items-start justify-between gap-2">
                            <div className="chart-line-segments items-end">
                              {line.segments.map((seg, segIdx) => {
                                const wordTokens = canTapChart
                                  ? splitSegmentTextIntoTappableWords(
                                      seg.text || ''
                                    )
                                  : [];
                                const firstWordText =
                                  wordTokens.find((w) => w.word)?.word ||
                                  seg.text?.trim().split(/\s+/)[0];

                                return (
                                  <span key={segIdx} className="chart-segment">
                                    <span
                                      onClick={(e) => {
                                        if (!canTapChart) return;
                                        e.stopPropagation();
                                        setCustomChordInput(seg.chord || '');
                                        setActiveChordEditTarget({
                                          sectionId: section.id,
                                          lineIndex: lineIdx,
                                          segmentIndex: segIdx,
                                          charOffset: 0,
                                          targetWord: firstWordText,
                                          currentChord: seg.chord || '',
                                        });
                                      }}
                                      className={`chart-chord-row ${
                                        canTapChart
                                          ? 'px-1 rounded border border-dashed border-[var(--brand-accent)]/50 hover:bg-[var(--brand-surface)] cursor-pointer'
                                          : ''
                                      }`}
                                      title={
                                        canTapChart
                                          ? 'Tap to change, move (←/→), or remove chord here'
                                          : undefined
                                      }
                                    >
                                      {seg.chord
                                        ? formatDisplayedChord(seg.chord)
                                        : canTapChart
                                        ? '+chord'
                                        : '\u00A0'}
                                    </span>
                                    <span className="chart-lyric-row">
                                      {canTapChart && wordTokens.length > 0 ? (
                                        wordTokens.map((tok, wIdx) => {
                                          if (!tok.word) {
                                            return (
                                              <span key={wIdx}>
                                                {tok.trailingSpace}
                                              </span>
                                            );
                                          }
                                          const isSelectedWord =
                                            isPopoverOnThisLine &&
                                            activeChordEditTarget?.segmentIndex ===
                                              segIdx &&
                                            activeChordEditTarget?.charOffset ===
                                              tok.charOffset;
                                          return (
                                            <React.Fragment key={wIdx}>
                                              <span
                                                data-testid={`tappable-lyric-word-${section.id}-${lineIdx}-${segIdx}-${wIdx}`}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  const existingChordHere =
                                                    tok.charOffset === 0
                                                      ? seg.chord || ''
                                                      : '';
                                                  setCustomChordInput(
                                                    existingChordHere
                                                  );
                                                  setActiveChordEditTarget({
                                                    sectionId: section.id,
                                                    lineIndex: lineIdx,
                                                    segmentIndex: segIdx,
                                                    charOffset: tok.charOffset,
                                                    targetWord: tok.word,
                                                    currentChord:
                                                      existingChordHere,
                                                  });
                                                }}
                                                title={`Tap "${tok.word}" to place a chord right above this word or edit lyrics`}
                                                className={`rounded px-0.5 -mx-0.5 transition-colors cursor-pointer ${
                                                  isSelectedWord
                                                    ? 'bg-[var(--brand-accent)] text-[#0c0c10] font-bold'
                                                    : 'hover:bg-[var(--brand-surface)] hover:text-[var(--brand-accent)] underline decoration-dotted decoration-[var(--brand-accent)]/45 underline-offset-4'
                                                }`}
                                              >
                                                {tok.word}
                                              </span>
                                              {tok.trailingSpace}
                                            </React.Fragment>
                                          );
                                        })
                                      ) : (
                                        seg.text || '\u00A0'
                                      )}
                                    </span>
                                  </span>
                                );
                              })}

                              {/* Trailing +Chord button at the end of the lyric line */}
                              {canTapChart && (
                                <span className="chart-segment ml-1.5">
                                  <span
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setCustomChordInput('');
                                      setActiveChordEditTarget({
                                        sectionId: section.id,
                                        lineIndex: lineIdx,
                                        segmentIndex: line.segments.length,
                                        charOffset: 0,
                                        currentChord: '',
                                        isTrailing: true,
                                      });
                                    }}
                                    title="Add a chord at the end of this line"
                                    className="chart-chord-row px-1.5 rounded border border-dashed border-[var(--brand-accent)]/50 hover:bg-[var(--brand-surface)] text-[11px] cursor-pointer"
                                  >
                                    +end chord
                                  </span>
                                  <span className="chart-lyric-row">
                                    {'\u00A0'}
                                  </span>
                                </span>
                              )}
                            </div>

                            {canTapChart && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveChordEditTarget(null);
                                  const bracketed =
                                    formatSongLineForQuickEdit(line);
                                  inlineLineCursorRef.current = bracketed.length;
                                  setActiveLineEditTarget({
                                    sectionId: section.id,
                                    lineIndex: lineIdx,
                                    bracketedText: bracketed,
                                    annotation: line.annotation || '',
                                  });
                                }}
                                className="shrink-0 px-2.5 py-1 rounded-lg border border-[var(--brand-accent)]/40 bg-[var(--brand-surface)] text-[var(--brand-accent)] hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] text-[11px] font-bold cursor-pointer transition-colors"
                              >
                                Edit Words &amp; Chords
                              </button>
                            )}
                          </div>
                          {isPopoverOnThisLine && renderChordPickerPopover()}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </article>
        </div>

        {/* Right 4 Columns: Live Setlist Queue & Connected Participants */}
        <div className="lg:col-span-4 space-y-5">
          {/* Live Setlist Queue */}
          <section
            aria-label="Live Setlist Queue"
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold inline-flex items-center gap-2">
                <Music
                  className="w-4 h-4 text-[var(--brand-accent)]"
                  aria-hidden="true"
                />
                <span>Session Setlist ({currentSetlistSongs.length})</span>
              </h2>
            </div>

            <ol className="space-y-2">
              {currentSetlistSongs.map((s, idx) => {
                const isOfficialCurrent = s.id === session.sharedState.songId;
                const hasCustomOverride = Boolean(
                  session.sharedState.songArrangementOverrides?.[s.id]
                );
                return (
                  <li key={`${s.id}-${idx}`}>
                    <button
                      type="button"
                      onClick={() => handleSelectSongInQueue(s.id)}
                      className={`w-full text-left rounded-xl border px-3.5 py-2.5 transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                        isOfficialCurrent
                          ? 'border-[var(--brand-accent)] bg-[var(--brand-surface)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-subtle)] hover:border-[var(--border-strong)]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate flex items-center gap-1.5">
                          <span className="truncate">
                            {idx + 1}. {s.title}
                          </span>
                          {hasCustomOverride && (
                            <span
                              title="Custom live arrangement active"
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/30 shrink-0"
                            >
                              Arranged
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[var(--text-secondary)]">
                          Orig Key: {s.originalKey} · {s.language.label}
                        </div>
                      </div>
                      {isOfficialCurrent && (
                        <span className="text-[0.6875rem] font-bold px-2 py-0.5 rounded bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/35 shrink-0">
                          Live
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>

            {canControlOfficialState && (
              <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
                <label
                  htmlFor="live-add-song-select"
                  className="block text-xs font-semibold text-[var(--text-secondary)]"
                >
                  Add Song to Live Queue
                </label>
                <div className="flex gap-2">
                  <select
                    id="live-add-song-select"
                    value={songToAddId}
                    onChange={(e) => setSongToAddId(e.target.value)}
                    className="flex-1 min-w-0 h-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 text-xs cursor-pointer"
                  >
                    {allSongs.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title} ({s.originalKey})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddSongToLiveQueue}
                    className="px-3 h-9 rounded-lg bg-[var(--brand-surface)] text-[var(--brand-accent)] border border-[var(--brand-accent)]/35 hover:bg-[var(--brand-accent)] hover:text-[#0c0c10] text-xs font-semibold cursor-pointer shrink-0 transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Connected Participants & Leadership Transfer */}
          <section
            aria-label="Connected Team Members"
            className="theme-card rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold inline-flex items-center gap-2">
                <Users
                  className="w-4 h-4 text-[var(--brand-accent)]"
                  aria-hidden="true"
                />
                <span>
                  Connected Team ({session.participants.length})
                </span>
              </h2>
            </div>

            <ul className="space-y-2.5">
              {session.participants.map((p) => {
                const isMe = p.id === participantId;
                return (
                  <li
                    key={p.id}
                    className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-sm flex items-center gap-1.5 truncate">
                          <span>
                            {p.name}
                            {isMe ? ' (You)' : ''}
                          </span>
                          {p.role === 'leader' && (
                            <span className="text-[0.625rem] uppercase font-bold px-1.5 py-0.5 rounded bg-[var(--brand-surface)] text-[var(--brand-accent)]">
                              Leader
                            </span>
                          )}
                          {p.role === 'co-leader' && (
                            <span className="text-[0.625rem] uppercase font-bold px-1.5 py-0.5 rounded bg-[var(--brand-surface)] text-[var(--brand-accent)]">
                              Co-Leader
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[var(--text-secondary)]">
                          {INSTRUMENT_LABELS[p.instrument]}
                        </div>
                      </div>

                      {/* Connection status badge */}
                      <span
                        className={`text-[0.6875rem] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                          p.connectionState === 'connected'
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : p.connectionState === 'reconnecting'
                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            : 'bg-slate-500/15 text-slate-500'
                        }`}
                      >
                        {p.connectionState}
                      </span>
                    </div>

                    {/* Authorized Leadership Transfer Controls (Primary Leader Only) */}
                    {isPrimaryLeader && !isMe && (
                      <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleTransferLeadership(p.id, 'make-leader')
                          }
                          className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--brand-accent)] inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Crown className="w-3 h-3" aria-hidden="true" />
                          <span>Transfer Leadership</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleTransferLeadership(p.id, 'toggle-co-leader')
                          }
                          className="text-xs font-medium px-2.5 py-1 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--brand-accent)] inline-flex items-center gap-1 cursor-pointer"
                        >
                          <UserCheck className="w-3 h-3" aria-hidden="true" />
                          <span>
                            {p.role === 'co-leader'
                              ? 'Revoke Co-Leader'
                              : 'Make Co-Leader'}
                          </span>
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>

      {/* Live Sync QR Code Modal for Mobile Quick Join */}
      {session && (
        <LiveSyncQrModal
          isOpen={showQrModal}
          onClose={() => setShowQrModal(false)}
          sessionCode={session.joinCode}
          joinUrl={fullJoinLink}
          sessionTitle={session.title}
        />
      )}

      {/* Real-Time Live Arrangement Chords & Lyrics Studio Modal (Leader Only in Live Sync) */}
      {session && canControlOfficialState && (
        <LiveArrangementEditorModal
          isOpen={showArrangementModal}
          onClose={() => setShowArrangementModal(false)}
          baseSong={rawSourceSong}
          displayedSong={displaySong}
          displayedSemitones={activeSemitones}
          displayedKey={displayedKey}
          initialArrangementNote={activeSongOverride?.arrangementNote}
          hasActiveOverride={Boolean(activeSongOverride)}
          onBroadcastOverride={handleBroadcastLiveOverride}
          onRevertToOriginal={handleRevertSongToOriginal}
          primaryActionLabel={
            isBroadcastingEdits
              ? targetBroadcastInstrument === 'general'
                ? 'Push to Church Group (Band Only)'
                : `Push to Church Group (${targetBroadcastInstrument.toUpperCase()} Only)`
              : `Save to My ${
                  instrumentView === 'general'
                    ? 'Personal'
                    : instrumentView.toUpperCase()
                } Chords`
          }
          onSaveCopyToMySongs={async (customSong) => {
            await saveCustomSong(customSong);
          }}
        />
      )}
    </div>
  );
}

function LivePageSearchParamsReader() {
  const searchParams = useSearchParams();
  return (
    <LiveSyncWorkspace
      key={searchParams.toString()}
      initialJoinCode={searchParams.get('code') ?? ''}
      initialInviteToken={searchParams.get('invite') ?? ''}
      initialStartSongId={searchParams.get('startSong') ?? ''}
      initialStartSemitones={Number(searchParams.get('semitones') ?? 0)}
      initialStartSetlistId={searchParams.get('startSetlist') ?? ''}
    />
  );
}

export default function LiveSyncPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 text-center text-sm text-[var(--text-secondary)]">
          Loading Live Sync workspace...
        </div>
      }
    >
      <LivePageSearchParamsReader />
    </Suspense>
  );
}
