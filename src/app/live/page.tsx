'use client';

import React, {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
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
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { apiUrl, getCloudHubUrl } from '@/lib/api/apiClient';
import { getAllSongs, getSongById } from '@/lib/catalog/songCatalog';
import {
  formatSignedSemitones,
  getDestinationKeyOptions,
  normalizeSemitones,
  transposeSong,
} from '@/lib/music/transposition';
import {
  getBassGuidanceForChord,
  getCapoRelativeChord,
  getGuitarCapoSuggestions,
  getKeyboardVoicing,
} from '@/lib/music/instrumentGuidance';
import { LiveSyncQrModal } from '@/components/live/LiveSyncQrModal';
import { ReferenceAudioPlayer } from '@/components/audio/ReferenceAudioPlayer';
import {
  setTeamActiveLiveSession,
  clearTeamActiveLiveSession,
} from '@/lib/team/teamService';
import type {
  CreateLiveSessionResponse,
  InstrumentViewMode,
  JoinLiveSessionResponse,
  LiveSessionSnapshot,
  LiveStreamMessage,
  UpdateSharedStateInput,
} from '@/types/live';
import type { EnharmonicPreference, SongLine } from '@/types/song';

const SESSION_CREDENTIALS_STORAGE_KEY = 'wmc_active_live_session_v1';

interface StoredLiveCredentials {
  sessionId: string;
  participantId: string;
  participantToken: string;
  inviteToken?: string;
}

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
  const { setlists } = useApp();
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
  const { user, activeGroup } = useAuth();
  const [showLiveAudioPlayer, setShowLiveAudioPlayer] = useState(false);

  // Start Session Form State
  const [leaderName, setLeaderName] = useState(user?.displayName || 'Worship Leader');
  const [sessionTitle, setSessionTitle] = useState('Sunday Worship Service');
  const [starterSongId, setStarterSongId] = useState(
    initialStartSongId || allSongs[0]?.id || ''
  );
  const [starterSetlistId, setStarterSetlistId] = useState(
    initialStartSetlistId || ''
  );
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
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  // Restore active session credentials from sessionStorage if present and no explicit join URL
  useEffect(() => {
    if (initialJoinCode || initialInviteToken) return;
    try {
      const raw = window.sessionStorage.getItem(
        SESSION_CREDENTIALS_STORAGE_KEY
      );
      if (!raw) return;
      const stored = JSON.parse(raw) as StoredLiveCredentials;
      if (stored.sessionId && stored.participantToken) {
        fetch(
          apiUrl(
            `/api/live/sessions/${encodeURIComponent(
              stored.sessionId
            )}?token=${encodeURIComponent(stored.participantToken)}`
          )
        )
          .then(async (res) => {
            if (!res.ok) {
              window.sessionStorage.removeItem(SESSION_CREDENTIALS_STORAGE_KEY);
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
          .catch(() => {});
      }
    } catch {
      // ignore
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

  // Auto-connect team members if their worship team leader is currently live
  useEffect(() => {
    if (session || isSubmitting || !activeGroup) return;

    const teamLiveId = activeGroup.activeLiveSessionId;
    const teamJoinCode = activeGroup.activeLiveSessionJoinCode;
    const teamExpiresAt = activeGroup.activeLiveSessionExpiresAt;

    if (!teamLiveId && !teamJoinCode) return;
    if (teamExpiresAt && new Date(teamExpiresAt).getTime() <= Date.now()) return;

    // Do not force auto-join on the owner/creator so they can choose to start or resume
    const isOwnerLeader = Boolean(user && activeGroup.ownerId === user.id);
    if (isOwnerLeader) return;

    // Check if user previously dismissed this session in this browser session
    try {
      const dismissed = window.sessionStorage.getItem('wmc_dismissed_team_live_session');
      if (dismissed === (teamLiveId || teamJoinCode)) return;
    } catch {}

    let cancelled = false;

    async function autoJoinTeamLive() {
      setIsSubmitting(true);
      try {
        const effectiveName = user?.displayName || user?.email?.split('@')[0] || 'Musician';
        const res = await fetch(apiUrl('/api/live/sessions/join'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: teamLiveId || undefined,
            joinCode: teamJoinCode || undefined,
            participantName: effectiveName,
            instrument: (user?.instrument as any) || 'general',
          }),
        });

        if (cancelled) return;
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
          };
          window.sessionStorage.setItem(
            SESSION_CREDENTIALS_STORAGE_KEY,
            JSON.stringify(creds)
          );
        }
      } catch (err) {
        console.warn('Auto-join team live session note:', err);
      } finally {
        if (!cancelled) setIsSubmitting(false);
      }
    }

    autoJoinTeamLive();

    return () => {
      cancelled = true;
    };
  }, [
    activeGroup?.activeLiveSessionId,
    activeGroup?.activeLiveSessionJoinCode,
    activeGroup?.activeLiveSessionExpiresAt,
    session,
    isSubmitting,
    user,
    activeGroup?.ownerId,
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
        // Pull authoritative snapshot on reconnect to ensure no missed revisions
        fetchLatestSnapshot(activeSessionId, participantToken);
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
      const chosenSetlist = setlists.find((s) => s.id === starterSetlistId);
      const setlistSongIds = chosenSetlist
        ? chosenSetlist.items.map((item) => item.songId)
        : undefined;

      const res = await fetch(apiUrl('/api/live/sessions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: sessionTitle,
          leaderName: leaderName.trim() || user?.displayName || 'Worship Leader',
          instrument: starterInstrument,
          initialSongId:
            setlistSongIds && setlistSongIds.length > 0
              ? setlistSongIds[0]
              : starterSongId,
          initialSemitones:
            chosenSetlist && chosenSetlist.items.length > 0
              ? chosenSetlist.items[0]?.preferredSemitones ??
                initialStartSemitones
              : initialStartSemitones,
          setlistSongIds,
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

      // If user is in a worship team, broadcast active live session to team in Firestore
      if (activeGroup?.id) {
        setTeamActiveLiveSession(activeGroup.id, {
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
        };
        window.sessionStorage.setItem(
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
        };
        window.sessionStorage.setItem(
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
        setErrorAlert({
          title: 'Sync Update Rejected',
          message: data.error ?? 'Could not update official state.',
          code: data.code,
        });
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
      if (activeGroup?.id) {
        clearTeamActiveLiveSession(activeGroup.id).catch(() => {});
      }
      window.sessionStorage.removeItem(SESSION_CREDENTIALS_STORAGE_KEY);
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
    window.sessionStorage.removeItem(SESSION_CREDENTIALS_STORAGE_KEY);
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Card 1: Join a Live Session (Member) */}
          <section
            aria-label="Join an active live session"
            className="theme-card rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 space-y-5 shadow-xs"
          >
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--brand-accent)]">
                Team Member
              </span>
              <h2 className="text-xl font-bold">Join a Live Session</h2>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
                Enter the 6-character join code shared by your worship leader to
                follow the chart in real time.
              </p>
            </div>

            {activeGroup && (
              <div className="p-3.5 rounded-xl bg-[var(--brand-surface)] border border-[var(--brand-accent)]/30 text-xs text-[var(--text-primary)] space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-[var(--brand-accent)]">
                  <Radio className="w-3.5 h-3.5 animate-pulse" />
                  <span>Team Member Auto-Sync Active</span>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)]">
                  You are connected to <strong>{activeGroup.name}</strong>. Whenever your leader starts a Live Rehearsal, this page will connect automatically without typing any code. (Visiting musicians can enter the 6-character code below).
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

              <div>
                <label
                  htmlFor="starter-song-select"
                  className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                >
                  Starting Song
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

              {setlists.length > 0 && (
                <div>
                  <label
                    htmlFor="starter-setlist-select"
                    className="block text-xs font-semibold text-[var(--text-secondary)] mb-1"
                  >
                    Load Queue from Personal Setlist (Optional)
                  </label>
                  <select
                    id="starter-setlist-select"
                    value={starterSetlistId}
                    onChange={(e) => setStarterSetlistId(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] text-sm cursor-pointer"
                  >
                    <option value="">Use Default Starter Queue</option>
                    {setlists.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.name} ({list.items.length} songs)
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

  const sourceSong = getSongById(activeSongId) ?? allSongs[0];
  const officialSong =
    getSongById(session.sharedState.songId) ?? sourceSong;

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
  const activeReferenceAudioUrl =
    activeGroup?.activeSetlist?.items.find((i) => i.songId === activeSongId)?.referenceAudioUrl ||
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
    if (canControlOfficialState && viewMode === 'follow') {
      sendOfficialStateUpdate({
        songId: targetSongId,
        officialSemitones: 0,
      });
    } else {
      if (viewMode === 'follow') handleSwitchToIndependent();
      setIndependentSongId(targetSongId);
      setIndependentSemitones(0);
    }
  };

  const handleAddSongToLiveQueue = () => {
    if (!canControlOfficialState || !songToAddId) return;
    if (session.sharedState.setlistSongIds.includes(songToAddId)) return;
    sendOfficialStateUpdate({
      setlistSongIds: [...session.sharedState.setlistSongIds, songToAddId],
    });
  };

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
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
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

              {/* Prev / Next Song in Setlist Controls (Leader) */}
              {canControlOfficialState && viewMode === 'follow' && (
                <div className="flex items-center gap-1.5">
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
                </div>
              )}
            </div>

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

                      if (instrumental) {
                        return (
                          <div key={lineIdx} className="chart-line-scroll py-1">
                            <div className="inline-flex items-center gap-2 font-mono font-bold">
                              <span className="text-xs font-sans uppercase text-[var(--text-secondary)]">
                                Chords:
                              </span>
                              {line.segments.map((seg, segIdx) => (
                                <span
                                  key={segIdx}
                                  className="px-2.5 py-1 rounded-lg bg-[var(--chord-bg)] text-[var(--chord-color)] border border-[var(--border-subtle)]"
                                >
                                  | {formatDisplayedChord(seg.chord)}
                                </span>
                              ))}
                              <span>|</span>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={lineIdx} className="chart-line-scroll">
                          <div className="chart-line-segments">
                            {line.segments.map((seg, segIdx) => (
                              <span key={segIdx} className="chart-segment">
                                <span className="chart-chord-row">
                                  {seg.chord
                                    ? formatDisplayedChord(seg.chord)
                                    : '\u00A0'}
                                </span>
                                <span className="chart-lyric-row">
                                  {seg.text || '\u00A0'}
                                </span>
                              </span>
                            ))}
                          </div>
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
                        <div className="font-semibold text-sm truncate">
                          {idx + 1}. {s.title}
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
