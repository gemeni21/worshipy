import type { EnharmonicPreference } from './song.ts';

export type InstrumentViewMode = 'general' | 'guitar' | 'keyboard' | 'bass';

export type ParticipantRole = 'leader' | 'co-leader' | 'member';

export type ParticipantConnectionState = 'connected' | 'reconnecting' | 'disconnected';

export type LiveSessionStatus = 'active' | 'ended';

export interface LiveParticipant {
  id: string;
  name: string;
  role: ParticipantRole;
  instrument: InstrumentViewMode;
  connectionState: ParticipantConnectionState;
  joinedAt: string;
  lastSeenAt: string;
}

export interface LiveSharedMusicalState {
  /** Stable SongRecord ID from the catalog */
  songId: string;
  /** Stable SongRecord slug */
  songSlug: string;
  /** Arrangement identifier for future multi-arrangement support */
  arrangementId: string;
  /** Official semitone offset relative to the song's originalKey */
  officialSemitones: number;
  /** Official enharmonic spelling preference */
  enharmonicPreference: EnharmonicPreference;
  /** Semantic section ID (e.g., "sec-1", "sec-2") rather than pixel scroll */
  activeSectionId: string;
  /** Human-readable section label (e.g., "Chorus") */
  activeSectionLabel: string;
  /** Optional line index inside the active section */
  activeLineIndex: number;
  /** Ordered list of song IDs in the live session setlist/queue */
  setlistSongIds: string[];
  /** Timestamp of last state update */
  updatedAt: string;
  /** Participant ID who made the last authoritative change */
  updatedBy: string;
}

export interface LiveSessionSnapshot {
  sessionId: string;
  joinCode: string;
  title: string;
  status: LiveSessionStatus;
  /** Monotonically increasing revision number to prevent out-of-order overwrites */
  revision: number;
  leaderId: string;
  leaderName: string;
  coLeaderIds: string[];
  createdAt: string;
  expiresAt: string;
  endedAt?: string;
  sharedState: LiveSharedMusicalState;
  participants: LiveParticipant[];
}

export const SESSION_CREDENTIALS_STORAGE_KEY = 'wmc_active_live_session_v1';

export interface StoredLiveCredentials {
  sessionId: string;
  participantId: string;
  participantToken: string;
  inviteToken?: string;
  isLeader?: boolean;
}

export interface CreateLiveSessionInput {
  title?: string;
  leaderName: string;
  instrument?: InstrumentViewMode;
  initialSongId: string;
  initialSemitones?: number;
  enharmonicPreference?: EnharmonicPreference;
  setlistSongIds?: string[];
  /** Optional custom TTL in milliseconds (used for testing expiration) */
  ttlMs?: number;
}

export interface CreateLiveSessionResponse {
  session: LiveSessionSnapshot;
  participantId: string;
  participantToken: string;
  inviteToken: string;
  joinUrl: string;
}

export interface JoinLiveSessionInput {
  joinCode?: string;
  sessionId?: string;
  inviteToken?: string;
  participantName: string;
  instrument?: InstrumentViewMode;
  isLeader?: boolean;
}

export interface JoinLiveSessionResponse {
  session: LiveSessionSnapshot;
  participantId: string;
  participantToken: string;
}

export interface UpdateSharedStateInput {
  songId?: string;
  officialSemitones?: number;
  enharmonicPreference?: EnharmonicPreference;
  activeSectionId?: string;
  activeSectionLabel?: string;
  activeLineIndex?: number;
  setlistSongIds?: string[];
  /** Optional optimistic concurrency check */
  expectedRevision?: number;
}

export type LiveStreamEventType =
  | 'snapshot'
  | 'state_updated'
  | 'presence_updated'
  | 'leadership_transferred'
  | 'session_ended'
  | 'heartbeat';

export interface LiveStreamMessage {
  type: LiveStreamEventType;
  revision: number;
  timestamp: string;
  session: LiveSessionSnapshot;
}
