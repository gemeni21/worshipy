/**
 * Microphone Capture & Lifecycle Controller for the Guitar/Bass/Chromatic Tuner
 *
 * Enforces privacy-conscious, leak-free management of MediaStreamTracks, Web Audio API
 * AudioContext/AnalyserNode, and pitch-detection polling loops.
 */

import {
  calculateRms,
  detectPitchYin,
  PitchSmoother,
  type YinPitchDetectionResult,
} from './tunerEngine.ts';

export type TunerErrorCode =
  | 'INSECURE_CONTEXT'
  | 'UNSUPPORTED_BROWSER'
  | 'PERMISSION_DENIED'
  | 'NO_MICROPHONE_FOUND'
  | 'MICROPHONE_BUSY'
  | 'AUDIO_INTERRUPTED'
  | 'AUDIO_INIT_FAILED';

export interface TunerErrorState {
  code: TunerErrorCode;
  title: string;
  message: string;
  recoveryHint: string;
}

export type TunerLifecycleState =
  | 'idle'
  | 'requesting-permission'
  | 'listening'
  | 'stopped'
  | 'interrupted'
  | 'error';

export interface TunerFrameSample {
  /** Smoothed detected pitch or null when no clear single pitch is present */
  pitch: YinPitchDetectionResult | null;
  /** Raw RMS signal level (0..1) for input activity indicator */
  rms: number;
  /** True when room noise or polyphonic input is present without a clear periodic fundamental */
  isNoisyOrAmbiguous: boolean;
}

/**
 * Minimal interfaces allowing both real browser Web Audio / MediaDevices and
 * deterministic unit-test mocks to drive TunerAudioController.
 */
export interface MinimalMediaStreamTrack {
  stop: () => void;
  readyState?: string;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

export interface MinimalMediaStream {
  getTracks: () => MinimalMediaStreamTrack[];
  getAudioTracks?: () => MinimalMediaStreamTrack[];
}

export interface MinimalAnalyserNode {
  fftSize: number;
  smoothingTimeConstant?: number;
  getFloatTimeDomainData: (array: Float32Array<ArrayBuffer>) => void;
  disconnect: () => void;
}

export interface MinimalMediaStreamSourceNode {
  connect: (destination: MinimalAnalyserNode) => void;
  disconnect: () => void;
}

export interface MinimalAudioContext {
  sampleRate: number;
  state: 'suspended' | 'running' | 'closed' | string;
  resume: () => Promise<void>;
  close: () => Promise<void>;
  createAnalyser: () => MinimalAnalyserNode;
  createMediaStreamSource: (
    stream: MinimalMediaStream
  ) => MinimalMediaStreamSourceNode;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

export interface TunerBrowserEnvironment {
  isSecureContext: boolean;
  getUserMedia?: (
    constraints: MediaStreamConstraints
  ) => Promise<MinimalMediaStream>;
  createAudioContext?: () => MinimalAudioContext;
  requestInterval?: (callback: () => void, ms: number) => unknown;
  clearIntervalFn?: (handle: unknown) => void;
}

/**
 * Maps browser DOMException / getUserMedia errors to clear, user-facing recovery guidance.
 */
export function mapMicrophoneErrorToUserMessage(
  error: unknown
): TunerErrorState {
  const errObj = error as { name?: string; message?: string } | null;
  const name = errObj?.name ?? '';

  if (
    name === 'NotAllowedError' ||
    name === 'PermissionDeniedError' ||
    name === 'SecurityError'
  ) {
    return {
      code: 'PERMISSION_DENIED',
      title: 'Microphone access was denied',
      message:
        'Microphone access was denied. Check browser/site permissions and try again.',
      recoveryHint:
        'Click the lock or tune icon in your browser address bar, allow Microphone access for this site, and press Start Listening again.',
    };
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return {
      code: 'NO_MICROPHONE_FOUND',
      title: 'No microphone was found',
      message:
        'No microphone was found on this device. Connect a microphone or audio interface and try again.',
      recoveryHint:
        'Ensure your built-in or external microphone is connected and enabled in your operating system sound settings.',
    };
  }

  if (
    name === 'NotReadableError' ||
    name === 'TrackStartError' ||
    name === 'AbortError'
  ) {
    return {
      code: 'MICROPHONE_BUSY',
      title: 'Microphone could not start',
      message:
        'The microphone is being used by another application or could not start.',
      recoveryHint:
        'Close other apps that may have exclusive access to your microphone and press Start Listening again.',
    };
  }

  return {
    code: 'AUDIO_INIT_FAILED',
    title: 'Audio initialization failed',
    message:
      'Could not initialize microphone audio capture. Please check your audio device and try again.',
    recoveryHint:
      'Try refreshing the page or selecting a different input device in your browser settings.',
  };
}

/**
 * Checks whether the current browser environment supports secure microphone capture and Web Audio API.
 */
export function checkBrowserAudioSupport(
  env: TunerBrowserEnvironment
): TunerErrorState | null {
  if (!env.isSecureContext) {
    return {
      code: 'INSECURE_CONTEXT',
      title: 'Secure HTTPS connection required',
      message:
        'Microphone access requires a secure context (HTTPS or localhost).',
      recoveryHint:
        'Open this app over https:// or http://localhost to enable browser microphone access.',
    };
  }

  if (!env.getUserMedia || !env.createAudioContext) {
    return {
      code: 'UNSUPPORTED_BROWSER',
      title: 'Audio features not supported',
      message: 'Your browser does not support the required audio features.',
      recoveryHint:
        'Use a current version of Chrome, Edge, Firefox, or Safari on desktop or mobile.',
    };
  }

  return null;
}

export interface TunerControllerCallbacks {
  onLifecycleChange?: (
    state: TunerLifecycleState,
    error: TunerErrorState | null
  ) => void;
  onFrame?: (sample: TunerFrameSample) => void;
}

/**
 * Manages the Web Audio API pipeline, MediaStreamTracks, and pitch-detection interval loop.
 */
export class TunerAudioController {
  private readonly env: TunerBrowserEnvironment;
  private readonly callbacks: TunerControllerCallbacks;
  private readonly smoother = new PitchSmoother(5, 0.38);
  private readonly analysisIntervalMs: number;

  private lifecycleState: TunerLifecycleState = 'idle';
  private errorState: TunerErrorState | null = null;
  private isStarting = false;

  private mediaStream: MinimalMediaStream | null = null;
  private audioContext: MinimalAudioContext | null = null;
  private sourceNode: MinimalMediaStreamSourceNode | null = null;
  private analyserNode: MinimalAnalyserNode | null = null;
  private timeDomainBuffer: Float32Array<ArrayBuffer> | null = null;
  private intervalHandle: unknown = null;

  private boundTrackEndedListener: (() => void) | null = null;
  private boundContextStateListener: (() => void) | null = null;

  constructor(
    callbacks: TunerControllerCallbacks,
    env?: TunerBrowserEnvironment,
    analysisIntervalMs: number = 50 // 20 Hz UI/pitch update rate: responsive & battery-friendly
  ) {
    this.callbacks = callbacks;
    this.analysisIntervalMs = analysisIntervalMs;
    this.env = env ?? createDefaultBrowserEnvironment();
  }

  getState(): {
    lifecycleState: TunerLifecycleState;
    errorState: TunerErrorState | null;
  } {
    return {
      lifecycleState: this.lifecycleState,
      errorState: this.errorState,
    };
  }

  private updateLifecycle(
    nextState: TunerLifecycleState,
    nextError: TunerErrorState | null = null
  ): void {
    this.lifecycleState = nextState;
    this.errorState = nextError;
    this.callbacks.onLifecycleChange?.(nextState, nextError);
  }

  /**
   * Starts microphone capture and local time-domain pitch analysis.
   * Deduplicates rapid concurrent calls so multiple streams are never leaked.
   */
  async start(): Promise<boolean> {
    if (this.isStarting || this.lifecycleState === 'listening') {
      return this.lifecycleState === 'listening';
    }

    const supportError = checkBrowserAudioSupport(this.env);
    if (supportError) {
      this.updateLifecycle('error', supportError);
      return false;
    }

    this.isStarting = true;

    // Ensure any previous resources are completely torn down before starting
    await this.cleanupResources();
    this.smoother.reset();

    if (!this.isStarting) {
      return false;
    }

    this.updateLifecycle('requesting-permission', null);

    try {
      let stream: MinimalMediaStream;
      try {
        // Request raw musical audio without voice-call filters that distort guitar/bass sustain
        stream = await this.env.getUserMedia!({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
          video: false,
        });
      } catch (firstErr) {
        const errName = (firstErr as { name?: string } | null)?.name;
        // Fallback to basic audio: true only if a device rejects specific constraint keys
        if (errName === 'OverconstrainedError' || errName === 'TypeError') {
          stream = await this.env.getUserMedia!({ audio: true, video: false });
        } else {
          throw firstErr;
        }
      }

      // If stop() was called while awaiting permission, immediately release the acquired stream
      if (!this.isStarting) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        return false;
      }

      this.mediaStream = stream;
      const tracks = stream.getTracks();
      if (tracks.length === 0) {
        await this.cleanupResources();
        this.isStarting = false;
        this.updateLifecycle('error', {
          code: 'NO_MICROPHONE_FOUND',
          title: 'No audio track available',
          message: 'No microphone audio track was provided by the browser.',
          recoveryHint:
            'Check your microphone connection and browser input permissions.',
        });
        return false;
      }

      const ctx = this.env.createAudioContext!();
      this.audioContext = ctx;

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const analyser = ctx.createAnalyser();
      // fftSize 8192 provides 8192 time-domain samples (~170ms at 48kHz, ~185ms at 44.1kHz),
      // allowing accurate YIN lag correlation down to low Bass E1 (41.2 Hz).
      analyser.fftSize = 8192;
      if ('smoothingTimeConstant' in analyser) {
        analyser.smoothingTimeConstant = 0;
      }

      const source = ctx.createMediaStreamSource(stream);
      // Connect microphone source ONLY to the analyser node — NEVER to ctx.destination (speakers)
      source.connect(analyser);

      this.sourceNode = source;
      this.analyserNode = analyser;
      this.timeDomainBuffer = new Float32Array(
        new ArrayBuffer(analyser.fftSize * Float32Array.BYTES_PER_ELEMENT)
      );

      // Listen for unexpected microphone disconnection or OS audio interruption
      this.boundTrackEndedListener = () => {
        if (this.lifecycleState === 'listening') {
          void this.handleInterruption();
        }
      };
      for (const track of tracks) {
        track.addEventListener?.('ended', this.boundTrackEndedListener);
      }

      this.boundContextStateListener = () => {
        if (
          this.lifecycleState === 'listening' &&
          this.audioContext &&
          (this.audioContext.state === 'suspended' ||
            this.audioContext.state === 'interrupted')
        ) {
          void this.handleInterruption();
        }
      };
      ctx.addEventListener?.('statechange', this.boundContextStateListener);

      const setIntervalFn =
        this.env.requestInterval ??
        ((cb: () => void, ms: number) => globalThis.setInterval(cb, ms));
      this.intervalHandle = setIntervalFn(
        () => this.processAudioFrame(),
        this.analysisIntervalMs
      );

      this.isStarting = false;
      this.updateLifecycle('listening', null);
      return true;
    } catch (err) {
      await this.cleanupResources();
      this.isStarting = false;
      const mappedError = mapMicrophoneErrorToUserMessage(err);
      this.updateLifecycle('error', mappedError);
      return false;
    }
  }

  private async handleInterruption(): Promise<void> {
    await this.cleanupResources();
    this.isStarting = false;
    this.updateLifecycle('interrupted', {
      code: 'AUDIO_INTERRUPTED',
      title: 'Microphone listening paused',
      message:
        'Audio capture was interrupted (for example, when switching tabs, locking the screen, or unplugging a microphone).',
      recoveryHint: 'Press Start Listening to resume tuning.',
    });
  }

  private processAudioFrame(): void {
    if (
      this.lifecycleState !== 'listening' ||
      !this.analyserNode ||
      !this.audioContext ||
      !this.timeDomainBuffer
    ) {
      return;
    }

    this.analyserNode.getFloatTimeDomainData(this.timeDomainBuffer);
    const rms = calculateRms(this.timeDomainBuffer);

    const rawDetection = detectPitchYin(
      this.timeDomainBuffer,
      this.audioContext.sampleRate
    );

    if (!rawDetection) {
      // If RMS is noticeable (> 0.015) but YIN could not lock onto a single periodic pitch,
      // flag as noisy or multiple strings ringing simultaneously.
      const isNoisyOrAmbiguous = rms >= 0.015;
      this.callbacks.onFrame?.({
        pitch: null,
        rms,
        isNoisyOrAmbiguous,
      });
      return;
    }

    const smoothedHz = this.smoother.push(rawDetection.frequencyHz);
    this.callbacks.onFrame?.({
      pitch: {
        frequencyHz: smoothedHz,
        confidence: rawDetection.confidence,
        rms: rawDetection.rms,
      },
      rms,
      isNoisyOrAmbiguous: false,
    });
  }

  /**
   * Stops the tuner and immediately releases all microphone tracks, audio nodes, and timers.
   */
  async stop(): Promise<void> {
    this.isStarting = false;
    const wasActive =
      this.lifecycleState === 'listening' ||
      this.lifecycleState === 'requesting-permission';
    await this.cleanupResources();
    this.smoother.reset();
    if (wasActive || this.lifecycleState === 'interrupted') {
      this.updateLifecycle('stopped', null);
    }
  }

  private async cleanupResources(): Promise<void> {
    if (this.intervalHandle !== null) {
      const clearFn =
        this.env.clearIntervalFn ??
        ((handle: unknown) =>
          globalThis.clearInterval(handle as ReturnType<typeof setInterval>));
      clearFn(this.intervalHandle);
      this.intervalHandle = null;
    }

    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        if (this.boundTrackEndedListener) {
          track.removeEventListener?.('ended', this.boundTrackEndedListener);
        }
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
      this.mediaStream = null;
    }
    this.boundTrackEndedListener = null;

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        // ignore
      }
      this.sourceNode = null;
    }

    if (this.analyserNode) {
      try {
        this.analyserNode.disconnect();
      } catch {
        // ignore
      }
      this.analyserNode = null;
    }

    if (this.audioContext) {
      if (this.boundContextStateListener) {
        this.audioContext.removeEventListener?.(
          'statechange',
          this.boundContextStateListener
        );
      }
      if (this.audioContext.state !== 'closed') {
        try {
          await this.audioContext.close();
        } catch {
          // ignore
        }
      }
      this.audioContext = null;
    }
    this.boundContextStateListener = null;
    this.timeDomainBuffer = null;
  }
}

function createDefaultBrowserEnvironment(): TunerBrowserEnvironment {
  if (typeof window === 'undefined') {
    return { isSecureContext: false };
  }

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  const hasGetUserMedia = Boolean(
    typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function'
  );

  return {
    isSecureContext: Boolean(window.isSecureContext),
    getUserMedia: hasGetUserMedia
      ? (constraints) => navigator.mediaDevices.getUserMedia(constraints)
      : undefined,
    createAudioContext: AudioCtx
      ? () => new AudioCtx() as unknown as MinimalAudioContext
      : undefined,
    requestInterval: (cb, ms) => window.setInterval(cb, ms),
    clearIntervalFn: (handle) => window.clearInterval(handle as number),
  };
}
