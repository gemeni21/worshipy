/**
 * Music-Optimized Audio Recording Engine for Practice & Rehearsal Review
 *
 * Captures clean, uncompressed instrument & vocal dynamics using Web Audio API + MediaRecorder.
 * Provides real-time VU meter levels and auto-generates waveform peaks for scrubbable playback.
 */

export interface PracticeRecorderState {
  status: 'idle' | 'recording' | 'paused';
  durationSeconds: number;
  volumeLevel: number; // 0..1 normalized for live VU/input meter
}

export interface PracticeRecordingResult {
  blob: Blob;
  mimeType: string;
  durationSeconds: number;
  waveformPeaks: number[]; // 64 normalized 0..1 points for waveform display
}

export type PracticeRecorderListener = (state: PracticeRecorderState) => void;

export class PracticeAudioRecorder {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animFrameId: number | null = null;
  private timerIntervalId: ReturnType<typeof setInterval> | null = null;

  private startTime: number = 0;
  private pausedDuration: number = 0;
  private pauseStartTime: number = 0;

  private rawPeaks: number[] = [];
  private status: 'idle' | 'recording' | 'paused' = 'idle';
  private currentVolume: number = 0;

  private listeners: Set<PracticeRecorderListener> = new Set();

  /**
   * Subscribes to real-time status, timer, and volume level updates.
   */
  public subscribe(listener: PracticeRecorderListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(): PracticeRecorderState {
    const elapsed = this.calculateElapsed();
    return {
      status: this.status,
      durationSeconds: elapsed,
      volumeLevel: this.currentVolume,
    };
  }

  private notify() {
    const state = this.getState();
    this.listeners.forEach((fn) => {
      try {
        fn(state);
      } catch {
        // ignore listener errors
      }
    });
  }

  private calculateElapsed(): number {
    if (this.status === 'idle') return 0;
    if (this.status === 'paused') {
      return Math.max(0, (this.pauseStartTime - this.startTime - this.pausedDuration) / 1000);
    }
    const now = Date.now();
    return Math.max(0, (now - this.startTime - this.pausedDuration) / 1000);
  }

  /**
   * Starts a new practice recording session with musical microphone constraints.
   */
  public async start(): Promise<void> {
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Audio recording is not supported in this browser.');
    }

    if (this.status !== 'idle') {
      await this.stop();
    }

    this.audioChunks = [];
    this.rawPeaks = [];
    this.pausedDuration = 0;
    this.startTime = Date.now();

    // 1. Obtain MediaStream with high-fidelity music settings
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    } catch {
      // Fallback: standard audio constraints if device rejects disabled preprocessing
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }

    // 2. Set up Web Audio Analyser for real-time volume meter & waveform sampling
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (AudioCtx) {
      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.5;
      source.connect(this.analyser);
    }

    // 3. Determine best supported mimeType
    const mimeType = this.getBestSupportedMimeType();
    const options: MediaRecorderOptions = mimeType ? { mimeType } : {};

    try {
      this.mediaRecorder = new MediaRecorder(this.mediaStream, options);
    } catch {
      this.mediaRecorder = new MediaRecorder(this.mediaStream);
    }

    this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    // Request data in chunks every 250ms for reliable stream aggregation
    this.mediaRecorder.start(250);
    this.status = 'recording';
    this.notify();

    // 4. Start visual level metering & peak sampling loops
    this.startMeteringLoop();
  }

  private getBestSupportedMimeType(): string {
    if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
      return '';
    }
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4;codecs=aac',
      'audio/mp4',
      'audio/aac',
      'audio/ogg;codecs=opus',
    ];
    for (const type of candidates) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return '';
  }

  private startMeteringLoop() {
    let lastPeakSampleTime = 0;

    const tick = () => {
      if (this.status !== 'recording') {
        this.currentVolume = 0;
        this.notify();
        return;
      }

      if (this.analyser) {
        const buffer = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteTimeDomainData(buffer);

        // Calculate RMS amplitude
        let sumSquares = 0;
        for (let i = 0; i < buffer.length; i++) {
          const norm = (buffer[i] - 128) / 128; // -1.0 .. 1.0
          sumSquares += norm * norm;
        }
        const rms = Math.sqrt(sumSquares / buffer.length);
        // Map 0..0.4 RMS to 0..1 volume with slight non-linear boost for responsiveness
        const level = Math.min(1, Math.pow(rms * 2.8, 0.75));
        this.currentVolume = Math.round(level * 100) / 100;

        // Sample peak for waveform history every 150ms
        const now = Date.now();
        if (now - lastPeakSampleTime >= 150) {
          lastPeakSampleTime = now;
          this.rawPeaks.push(Math.max(0.08, this.currentVolume));
        }
      }

      this.notify();
      this.animFrameId = requestAnimationFrame(tick);
    };

    this.animFrameId = requestAnimationFrame(tick);

    // Secondary interval to guarantee steady timer ticks even if tab loses focus
    this.timerIntervalId = setInterval(() => {
      this.notify();
    }, 250);
  }

  public pause() {
    if (this.status !== 'recording' || !this.mediaRecorder) return;
    try {
      this.mediaRecorder.pause();
      this.status = 'paused';
      this.pauseStartTime = Date.now();
      this.currentVolume = 0;
      this.notify();
    } catch {
      // ignore
    }
  }

  public resume() {
    if (this.status !== 'paused' || !this.mediaRecorder) return;
    try {
      this.mediaRecorder.resume();
      this.pausedDuration += Date.now() - this.pauseStartTime;
      this.status = 'recording';
      this.notify();
      this.startMeteringLoop();
    } catch {
      // ignore
    }
  }

  /**
   * Stops the recording, cleans up audio hardware tracks, and resolves the compiled audio Blob and waveform.
   */
  public async stop(): Promise<PracticeRecordingResult | null> {
    if (this.status === 'idle') return null;

    const finalDuration = this.calculateElapsed();
    this.cleanupMetering();

    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        this.cleanupHardware();
        this.status = 'idle';
        this.notify();
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = () => {
        const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
        const blob = new Blob(this.audioChunks, { type: mimeType });
        const waveformPeaks = this.normalizeWaveformPeaks(this.rawPeaks, 64);

        this.cleanupHardware();
        this.status = 'idle';
        this.currentVolume = 0;
        this.notify();

        resolve({
          blob,
          mimeType,
          durationSeconds: Math.max(1, Math.round(finalDuration)),
          waveformPeaks,
        });
      };

      try {
        try {
          this.mediaRecorder.requestData();
        } catch {
          // ignore
        }
        this.mediaRecorder.stop();
      } catch {
        this.cleanupHardware();
        this.status = 'idle';
        this.notify();
        resolve(null);
      }
    });
  }

  /**
   * Discards the recording immediately without compiling the result.
   */
  public discard() {
    this.cleanupMetering();
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        try {
          this.mediaRecorder.requestData();
        } catch {
          // ignore
        }
        this.mediaRecorder.stop();
      } catch {
        // ignore
      }
    }
    this.cleanupHardware();
    this.audioChunks = [];
    this.rawPeaks = [];
    this.status = 'idle';
    this.currentVolume = 0;
    this.notify();
  }

  private cleanupMetering() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.timerIntervalId !== null) {
      clearInterval(this.timerIntervalId);
      this.timerIntervalId = null;
    }
  }

  private cleanupHardware() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch {
        // ignore
      }
      this.audioContext = null;
    }

    this.analyser = null;
    this.mediaRecorder = null;
  }

  /**
   * Resamples collected raw peak points into an even fixed-count array (e.g. 64 bars)
   * normalized between 0.1 and 1.0.
   */
  public normalizeWaveformPeaks(raw: number[], targetCount: number = 64): number[] {
    if (!raw || raw.length === 0) {
      return Array(targetCount).fill(0.2);
    }

    const result: number[] = [];
    const step = raw.length / targetCount;

    for (let i = 0; i < targetCount; i++) {
      const startIdx = Math.floor(i * step);
      const endIdx = Math.min(raw.length, Math.floor((i + 1) * step));
      let maxVal = 0.1;

      for (let j = startIdx; j < endIdx; j++) {
        if (raw[j] > maxVal) {
          maxVal = raw[j];
        }
      }
      result.push(Math.round(Math.min(1.0, Math.max(0.12, maxVal)) * 100) / 100);
    }

    return result;
  }
}

// Global singleton instance for easy access across song chart components
export const practiceAudioRecorder = new PracticeAudioRecorder();
