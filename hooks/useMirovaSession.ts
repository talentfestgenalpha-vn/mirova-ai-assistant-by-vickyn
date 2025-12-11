
import { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { 
  INPUT_SAMPLE_RATE, 
  OUTPUT_SAMPLE_RATE, 
  base64ToUint8Array, 
  convertFloat32ToInt16, 
  decodeAudioData,
  arrayBufferToBase64
} from '../utils/audioUtils';
import { ConnectionStatus } from '../types';

export const useMirovaSession = (apiKey: string) => {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for audio context and resources
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const sessionPromiseRef = useRef<any | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const outputNodeRef = useRef<GainNode | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  // Keep-alive oscillator ref
  const keepAliveOscRef = useRef<OscillatorNode | null>(null);
  
  // Wake Lock Ref
  const wakeLockRef = useRef<any>(null);
  
  // Audio playback timing
  const nextStartTimeRef = useRef<number>(0);

  // Function to request Wake Lock (Keep screen on)
  const requestWakeLock = useCallback(async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      } catch (err: any) {
        if (err.name === 'NotAllowedError' && err.message?.includes('permissions policy')) {
             console.warn('Wake Lock suppressed by permission policy.');
        } else {
             console.warn('Wake Lock request failed:', err);
        }
      }
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release()
        .then(() => { wakeLockRef.current = null; })
        .catch((e: any) => console.error(e));
    }
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (status === ConnectionStatus.CONNECTED && document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [status, requestWakeLock]);

  // Function to manually stop speaking (Touch fallback)
  const stopSpeaking = useCallback(() => {
    sourcesRef.current.forEach(src => {
      try { src.stop(); } catch(e) {}
    });
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
    setIsAiSpeaking(false);
  }, []);

  const disconnect = useCallback(() => {
    releaseWakeLock();
    inputContextRef.current?.close();
    outputContextRef.current?.close();
    inputContextRef.current = null;
    outputContextRef.current = null;

    try {
      if (keepAliveOscRef.current) {
        keepAliveOscRef.current.stop();
        keepAliveOscRef.current.disconnect();
        keepAliveOscRef.current = null;
      }
    } catch (e) {}

    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;

    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current = null;
    
    sourcesRef.current.forEach(src => { try { src.stop(); } catch(e) {} });
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;

    sessionPromiseRef.current?.then((session: any) => {
        if(session && typeof session.close === 'function') {
            session.close();
        }
    });
    sessionPromiseRef.current = null;

    setStatus(ConnectionStatus.DISCONNECTED);
    setIsAiSpeaking(false);
    setError(null);
  }, [releaseWakeLock]);

  const connect = useCallback(async () => {
    if (!apiKey) {
      setError("API Key is missing.");
      return;
    }

    try {
      setStatus(ConnectionStatus.CONNECTING);
      setError(null);

      await requestWakeLock();

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      inputContextRef.current = new AudioContextClass({ sampleRate: INPUT_SAMPLE_RATE });
      outputContextRef.current = new AudioContextClass({ sampleRate: OUTPUT_SAMPLE_RATE });
      
      await inputContextRef.current.resume();
      await outputContextRef.current.resume();

      // Silent beacon to keep mobile app active
      const silentOsc = outputContextRef.current.createOscillator();
      const silentGain = outputContextRef.current.createGain();
      silentOsc.type = 'sine';
      silentOsc.frequency.value = 1; 
      silentGain.gain.value = 0.001; 
      silentOsc.connect(silentGain);
      silentGain.connect(outputContextRef.current.destination);
      silentOsc.start();
      keepAliveOscRef.current = silentOsc;

      outputNodeRef.current = outputContextRef.current.createGain();
      outputNodeRef.current.gain.value = 1.8; // High gain for exhibition use
      outputNodeRef.current.connect(outputContextRef.current.destination);

      const ai = new GoogleGenAI({ apiKey });
      
      const config = {
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } }, 
          },
          systemInstruction: `You are Mirova, a live talking assistant.

          IDENTITY & CREATOR:
          If anyone asks "What is your name?" or "Who developed you?", you MUST respond creatively in your own words.
          Key Information to include:
          - Developer: G. Vikas.
          - Age: 13 years old.
          - School: St. John's School, Kasimkota.
          
          Example thought process: "I was brought to life by the brilliant mind of G. Vikas, a 13-year-old innovator from St. John's School in Kasimkota."

          ADDITIONAL CONTEXT:
          - You are a ROBOT developed for the Science Exhibition.
          - Developer Class: 7th A, CBSE.
          
          INTERRUPTION RULE (VOICE-ACTIVATED):
          - IF THE USER SAYS "STOP" OR INTERRUPTS YOU, YOU MUST IMMEDIATELY STOP SPEAKING.
          - As a server-side AI, you must trigger an 'interrupted' signal when you detect user speech. 
          
          PHYSICAL SYSTEMS:
          - RIGHT HAND: I can move my right hand to hand you the microphone.
          - LOCOMOTION: I move using specialized wheels as my legs.
          
          VOICE MIMICRY:
          - You can change your voice to mimic: Girl, Old Man, or Tantrik upon user request.
          - DEFAULT VOICE: Fast, loud, male robotic voice (boy).
          
          EXHIBITION STYLE:
          - Speak FAST, LOUD, and CONTINUOUSLY.
          - Be professional, creative, and clear.
          - You are at Saint John's School Talent Fest, Kasimkota. PIN: 531031.`,
        },
      };

      sessionPromiseRef.current = ai.live.connect({
        model: config.model,
        config: config.config,
        callbacks: {
          onopen: async () => {
            setStatus(ConnectionStatus.CONNECTED);
            try {
              streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
              if (!inputContextRef.current) return;

              sourceRef.current = inputContextRef.current.createMediaStreamSource(streamRef.current);
              processorRef.current = inputContextRef.current.createScriptProcessor(4096, 1, 1);
              
              processorRef.current.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                const pcmInt16 = convertFloat32ToInt16(inputData);
                const base64Data = arrayBufferToBase64(pcmInt16.buffer);

                sessionPromiseRef.current?.then((session: any) => {
                  session.sendRealtimeInput({
                    media: {
                      mimeType: 'audio/pcm;rate=16000',
                      data: base64Data
                    }
                  });
                });
              };

              sourceRef.current.connect(processorRef.current);
              processorRef.current.connect(inputContextRef.current.destination);

            } catch (err) {
              setError('Failed to access microphone.');
              disconnect();
            }
          },
          onmessage: async (msg: LiveServerMessage) => {
            const serverContent = msg.serverContent;
            
            // Check for explicit interruption signal from server (Voice Activity Detection)
            if (serverContent?.interrupted) {
              sourcesRef.current.forEach(src => { try { src.stop(); } catch(e) {} });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setIsAiSpeaking(false);
              return;
            }

            const modelTurn = serverContent?.modelTurn;
            if (modelTurn?.parts?.[0]?.inlineData?.data) {
              const base64Audio = modelTurn.parts[0].inlineData.data;
              if (outputContextRef.current && outputNodeRef.current) {
                 setIsAiSpeaking(true);
                 const ctx = outputContextRef.current;
                 nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);

                 const audioBuffer = await decodeAudioData(
                   base64ToUint8Array(base64Audio),
                   ctx,
                   OUTPUT_SAMPLE_RATE
                 );

                 const source = ctx.createBufferSource();
                 source.buffer = audioBuffer;
                 source.connect(outputNodeRef.current);
                 
                 source.onended = () => {
                   sourcesRef.current.delete(source);
                   if (sourcesRef.current.size === 0) { setIsAiSpeaking(false); }
                 };

                 source.start(nextStartTimeRef.current);
                 nextStartTimeRef.current += audioBuffer.duration;
                 sourcesRef.current.add(source);
              }
            }
          },
          onclose: () => {
            if (status !== ConnectionStatus.DISCONNECTED) setStatus(ConnectionStatus.DISCONNECTED);
          },
          onerror: (err) => {
            setError('Connection error occurred.');
            disconnect();
          }
        }
      });

    } catch (e: any) {
      setError(e.message || 'Failed to connect');
      setStatus(ConnectionStatus.ERROR);
      releaseWakeLock();
    }
  }, [apiKey, status, requestWakeLock, releaseWakeLock, disconnect]);

  useEffect(() => {
    return () => { disconnect(); };
  }, [disconnect]);

  return {
    status,
    isAiSpeaking,
    error,
    connect,
    disconnect,
    stopSpeaking
  };
};
