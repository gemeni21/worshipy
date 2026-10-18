'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

// Browser Web Speech API interfaces for TypeScript compatibility
interface SpeechRecognitionEventLike extends Event {
  results: {
    length: number;
    item(index: number): {
      length: number;
      item(index: number): { transcript: string; confidence: number };
      isFinal: boolean;
      [index: number]: { transcript: string; confidence: number };
    };
    [index: number]: {
      length: number;
      item(index: number): { transcript: string; confidence: number };
      isFinal: boolean;
      [index: number]: { transcript: string; confidence: number };
    };
  };
  resultIndex: number;
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onresult: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionErrorEventLike) => void) | null;
  onend: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export interface VoiceSearchHookReturn {
  isSupported: boolean;
  isListening: boolean;
  transcript: string;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  abortListening: () => void;
  reset: () => void;
}

/**
 * Normalizes speech recognition output (removes terminal punctuation and trims)
 */
export function cleanSpokenTranscript(raw: string): string {
  return raw
    .trim()
    .replace(/[.,?!]+$/, '') // Strip trailing sentence punctuation
    .trim();
}

function subscribeToSpeechSupport() {
  return () => {};
}

function getSpeechSupportSnapshot(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function getSpeechSupportServerSnapshot(): boolean {
  return false;
}

export function useVoiceSearch(onFinalResult?: (result: string) => void): VoiceSearchHookReturn {
  const isSupported = useSyncExternalStore(
    subscribeToSpeechSupport,
    getSpeechSupportSnapshot,
    getSpeechSupportServerSnapshot
  );
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const onFinalResultRef = useRef(onFinalResult);

  useEffect(() => {
    onFinalResultRef.current = onFinalResult;
  }, [onFinalResult]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore if already stopped
      }
    }
    setIsListening(false);
  }, []);

  const abortListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // Ignore if already aborted
      }
    }
    setIsListening(false);
  }, []);

  const reset = useCallback(() => {
    abortListening();
    setTranscript('');
    setError(null);
  }, [abortListening]);

  const startListening = useCallback(async () => {
    if (typeof window === 'undefined') return;

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      setError('Voice recognition is not supported in this browser. You can type in the search box below.');
      return;
    }

    // Abort previous instance if active
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // Ignore
      }
    }

    // Request audio stream permission via getUserMedia first if available,
    // which prompts the user with the browser's native permission modal if not already granted.
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Immediately release tracks so speech recognition can access the audio device cleanly
        stream.getTracks().forEach((track) => track.stop());
      } catch (err: unknown) {
        const errorName = (err as { name?: string })?.name;
        if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
          setError('Microphone access was denied. Please allow microphone permissions or use the search box below.');
          return;
        }
      }
    }

    try {
      const recognition = new SpeechRec();
      recognitionRef.current = recognition;

      recognition.continuous = false;
      recognition.interimResults = true;
      // Many worship songs are in English or Filipino/Tagalog. Leaving default allows browser's system language,
      // or we can fallback to navigator.language.
      recognition.lang = typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US';

      setTranscript('');
      setError(null);

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: SpeechRecognitionEventLike) => {
        let currentTranscript = '';
        let isFinal = false;

        for (let i = 0; i < event.results.length; i++) {
          const res = event.results[i];
          currentTranscript += res[0].transcript;
          if (res.isFinal) {
            isFinal = true;
          }
        }

        const cleaned = cleanSpokenTranscript(currentTranscript);
        setTranscript(cleaned);

        if (isFinal && cleaned && onFinalResultRef.current) {
          onFinalResultRef.current(cleaned);
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
        setIsListening(false);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setError('Microphone access was denied. Please allow microphone permissions in your browser or type your search below.');
        } else if (event.error === 'no-speech') {
          setError('No voice detected. Tap the microphone to try speaking again.');
        } else if (event.error === 'network') {
          setError('Network issue detected with speech recognition service. You can type your search below.');
        } else if (event.error === 'aborted') {
          // Intentional user cancellation, don't show error
          setError(null);
        } else {
          setError(`Speech recognition note: ${event.error}. You can search by typing below.`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (err: unknown) {
      setIsListening(false);
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Could not activate microphone: ${msg}. You can search by typing below.`);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore
        }
      }
    };
  }, []);

  return {
    isSupported,
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
    abortListening,
    reset,
  };
}
