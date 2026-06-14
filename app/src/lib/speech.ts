// speech.ts — a tiny wrapper over the browser Web Speech API for voice food logging.
// Web-only: native builds and browsers without it (notably iOS Safari) report `supported: false`
// so the caller can hide the Speak mode and fall back to Describe — same no-op seam as
// lib/notifications.ts.

import { useCallback, useEffect, useRef, useState } from 'react';

// Minimal shape of the bits of SpeechRecognition we use (the lib DOM types aren't always present).
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

function getCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export const speechSupported = (): boolean => getCtor() != null;

export interface UseSpeech {
  supported: boolean;
  listening: boolean;
  /** Finalized text so far. */
  transcript: string;
  /** Words still being recognized (shown faintly). */
  interim: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

export function useSpeech(): UseSpeech {
  const ref = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef('');
  const [supported] = useState(speechSupported);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      try {
        ref.current?.abort();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return;
    try {
      ref.current?.abort();
    } catch {
      /* ignore */
    }
    const rec = new Ctor();
    rec.lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0]?.transcript ?? '';
        if (e.results[i].isFinal) finalRef.current = `${finalRef.current} ${chunk}`.trim();
        else interimText += chunk;
      }
      setTranscript(finalRef.current);
      setInterim(interimText);
    };
    rec.onerror = (e: any) => {
      setError(e?.error === 'not-allowed' ? 'Microphone access was blocked.' : 'Didn’t catch that — try again.');
      setListening(false);
    };
    rec.onend = () => {
      setInterim('');
      setListening(false);
    };
    ref.current = rec;
    finalRef.current = '';
    setTranscript('');
    setInterim('');
    setError(null);
    setListening(true);
    rec.start();
  }, []);

  const stop = useCallback(() => {
    try {
      ref.current?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  }, []);

  const reset = useCallback(() => {
    finalRef.current = '';
    setTranscript('');
    setInterim('');
    setError(null);
  }, []);

  return { supported, listening, transcript, interim, error, start, stop, reset };
}
