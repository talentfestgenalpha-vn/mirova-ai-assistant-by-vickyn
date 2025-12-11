
import React, { useState, useRef, useEffect } from 'react';
import { useMirovaSession } from './hooks/useMirovaSession';
import Visualizer from './components/Visualizer';
import ControlPanel from './components/ControlPanel';
import SplashScreen from './components/SplashScreen';
import { ConnectionStatus, Message, ChatSession } from './types';
import { GoogleGenAI, Modality, GenerateContentResponse } from '@google/genai';
import { fileToGenerativePart } from './utils/fileUtils';
import { decodeAudioData, base64ToUint8Array } from './utils/audioUtils';

type Mode = 'LIVE' | 'CHAT';

// Attractive text renderer for bot responses
const FormattedText: React.FC<{ text: string }> = ({ text }) => {
  const renderFormatted = (content: string) => {
    // Process Bold (**text**)
    let processed = content.split(/(\*\*.*?\*\*)/g).map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <b key={i} className="text-cyan-400 font-black">{part.slice(2, -2)}</b>;
      }
      return part;
    });

    // Process Italics (*text*)
    let final: React.ReactNode[] = [];
    processed.forEach((part, i) => {
      if (typeof part === 'string') {
        const italicParts = part.split(/(\*.*?\*)/g).map((sub, j) => {
          if (sub.startsWith('*') && sub.endsWith('*')) {
            return <i key={`${i}-${j}`} className="text-indigo-400 font-semibold italic">{sub.slice(1, -1)}</i>;
          }
          return sub;
        });
        final.push(...italicParts);
      } else {
        final.push(part as React.ReactNode);
      }
    });

    return final;
  };

  return (
    <div className="leading-relaxed whitespace-pre-wrap font-sans tracking-wide">
      {renderFormatted(text)}
    </div>
  );
};

// Gemini Style Loader
const GeminiLoader = () => (
  <div className="flex flex-col gap-2 w-full max-w-[200px] animate-fade-in">
    <div className="h-1.5 w-full rounded-full overflow-hidden bg-white/5 relative">
      <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,#22d3ee,#818cf8,transparent)] animate-[shimmer_1.5s_infinite] w-[50%]"></div>
    </div>
    <div className="h-1.5 w-[70%] rounded-full overflow-hidden bg-white/5 relative">
      <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,#22d3ee,#818cf8,transparent)] animate-[shimmer_1.5s_infinite] w-[50%]" style={{ animationDelay: '0.2s' }}></div>
    </div>
    <div className="h-1.5 w-[40%] rounded-full overflow-hidden bg-white/5 relative">
      <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,#22d3ee,#818cf8,transparent)] animate-[shimmer_1.5s_infinite] w-[50%]" style={{ animationDelay: '0.4s' }}></div>
    </div>
    <style>{`
      @keyframes shimmer {
        0% { transform: translateX(-150%); }
        100% { transform: translateX(250%); }
      }
    `}</style>
  </div>
);

function App() {
  // Environment variable safety check (essential for blank page fixes on static hosts)
  const apiKey = (typeof process !== 'undefined' && process.env && process.env.API_KEY) ? process.env.API_KEY : '';
  const { status, isAiSpeaking, error, connect, disconnect, stopSpeaking } = useMirovaSession(apiKey);
  
  const [showSplash, setShowSplash] = useState(true);
  const [mode, setMode] = useState<Mode>('LIVE');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [menuOpen, setMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  
  const chatAudioContextRef = useRef<AudioContext | null>(null);
  const currentChatSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [playingMsgIndex, setPlayingMsgIndex] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load history from local storage
  useEffect(() => {
    const saved = localStorage.getItem('mirova_vault_persistent');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setSessions(parsed);
          if (parsed.length > 0) setCurrentSessionId(parsed[0].id);
        }
      } catch (e) {
        console.warn("Mirova Neural Data corrupt. Initializing clean slate.");
      }
    }
  }, []);

  // Sync history to local storage
  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem('mirova_vault_persistent', JSON.stringify(sessions));
    }
  }, [sessions]);

  // Auto scroll logic
  useEffect(() => {
    if (mode === 'CHAT') {
      const timeoutId = setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [sessions, currentSessionId, mode, isProcessing]);

  const currentSession = sessions.find(s => s.id === currentSessionId);
  const chatHistory = currentSession?.messages || [];

  const startNewSession = () => {
    const newId = `session_${Date.now()}`;
    const newSession: ChatSession = { 
      id: newId, 
      title: 'Neural Log #' + (sessions.length + 1), 
      messages: [], 
      lastUpdated: Date.now() 
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newId);
    setHistoryOpen(false);
    stopChatAudio();
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = confirm("Erase neural record permanently?");
    if (!confirmed) return;
    
    setSessions(prev => prev.filter(s => s.id !== id));
    if (currentSessionId === id) {
      const remaining = sessions.filter(s => s.id !== id);
      setCurrentSessionId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const updateCurrentSession = (messages: Message[]) => {
    setSessions(prev => prev.map(s => {
      if (s.id === currentSessionId) {
        return { ...s, messages, lastUpdated: Date.now() };
      }
      return s;
    }));
  };

  const stopChatAudio = () => {
    if (currentChatSourceRef.current) {
      try { currentChatSourceRef.current.stop(); } catch (e) {}
      currentChatSourceRef.current = null;
    }
    setPlayingMsgIndex(null);
  };

  const playBotAudio = async (base64: string, index: number) => {
    stopChatAudio();
    if (!chatAudioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      chatAudioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
    }
    const ctx = chatAudioContextRef.current;
    if (ctx.state === 'suspended') await ctx.resume();

    try {
      const buffer = await decodeAudioData(base64ToUint8Array(base64), ctx, 24000);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => {
        setPlayingMsgIndex(current => current === index ? null : current);
      };
      currentChatSourceRef.current = source;
      source.start();
      setPlayingMsgIndex(index);
    } catch (e) {
      console.error("Audio protocol failed: Buffer allocation error.");
    }
  };

  const generateHighQualityTTS = async (text: string): Promise<string | null> => {
    if (!apiKey) return null;
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        // Prompt adjusted for natural, smooth delivery
        contents: [{ parts: [{ text: text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            // 'Puck' is generally smoother and more natural than Fenrir
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
          },
        },
      });
      return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
    } catch (e) {
      return null;
    }
  };

  const handleSendMessage = async (isImageGen = false) => {
    if (!inputValue && attachments.length === 0) return;
    if (!apiKey) {
      alert("Missing Neural Access Key. Set your API key environment variable.");
      return;
    }
    
    let activeSessionId = currentSessionId;
    if (!activeSessionId) {
       const newId = `session_${Date.now()}`;
       const newSession: ChatSession = { id: newId, title: 'Neural Record Alpha', messages: [], lastUpdated: Date.now() };
       setSessions(p => [newSession, ...p]);
       activeSessionId = newId;
       setCurrentSessionId(newId);
    }

    setIsProcessing(true);
    const currentInput = inputValue;
    const currentFiles = [...attachments];
    setInputValue('');
    setAttachments([]);
    setMenuOpen(false);

    const newUserMsg: Message = { 
      role: 'user', 
      text: currentInput, 
      timestamp: Date.now(), 
      files: currentFiles.map(f => ({ name: f.name, type: f.type })) 
    };
    let currentHistory = [...chatHistory, newUserMsg];
    updateCurrentSession(currentHistory);

    try {
      const ai = new GoogleGenAI({ apiKey });
      if (isImageGen) {
          const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: `Cinematic 8k hyper-realistic: ${currentInput}`,
            config: { numberOfImages: 1, aspectRatio: aspectRatio as any }
          });
          const imageUrl = `data:image/png;base64,${response.generatedImages[0].image.imageBytes}`;
          updateCurrentSession([...currentHistory, { 
            role: 'bot', 
            text: 'I have successfully **materialized** your visual request. Ratio set to: *' + aspectRatio + '*. View below.', 
            image: imageUrl, 
            timestamp: Date.now() 
          }]);
      } else {
        const fileParts = await Promise.all(currentFiles.map(fileToGenerativePart));
        // Using flash-lite for maximum speed as requested
        const result = await ai.models.generateContentStream({
          model: 'gemini-flash-lite-latest',
          contents: { parts: [...fileParts, { text: currentInput }] },
          config: {
            systemInstruction: `You are Mirova, an advanced AI. 
            
            DEVELOPER IDENTITY:
            If asked "Who developed you?" or "What is your name?", you must answer creatively that you were developed by G. Vikas, a 13-year-old student from St. John's School, Kasimkota.
            
            Keep responses concise, intelligent, and helpful. Do not use markdown headers (#).`
          }
        });

        let botText = "";
        const botIndex = currentHistory.length;
        currentHistory = [...currentHistory, { role: 'bot', text: "", timestamp: Date.now() }];
        
        // Wait for full text to generate audio for smoother playback
        for await (const chunk of result) {
          const c = chunk as GenerateContentResponse;
          botText += c.text;
          currentHistory[botIndex].text = botText;
          updateCurrentSession([...currentHistory]);
        }

        const audio = await generateHighQualityTTS(botText.replace(/[^\w\s,.!?]/g, ''));
        if (audio) {
          currentHistory[botIndex].audioBase64 = audio;
          updateCurrentSession([...currentHistory]);
          playBotAudio(audio, botIndex);
        }
      }
    } catch (err: any) {
      console.error(err);
      updateCurrentSession([...currentHistory, { 
        role: 'bot', 
        text: "🚨 **Matrix Error**: Internal core failure during synthesis. Attempt manual reset.", 
        timestamp: Date.now() 
      }]);
    } finally { 
      setIsProcessing(false); 
    }
  };

  if (showSplash) return <SplashScreen onComplete={() => setShowSplash(false)} />;

  return (
    <div className="relative min-h-screen w-full flex flex-col bg-[#000] text-white font-sans overflow-hidden">
      
      {/* Dynamic Background Mesh */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(34,211,238,0.03)_0%,_transparent_70%)] pointer-events-none overflow-hidden">
         <div className="absolute top-0 left-0 w-full h-full opacity-20 bg-[url('https://www.transparenttextures.com/patterns/black-linen-2.png')]"></div>
      </div>

      {/* Persistence Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-[100] w-full sm:w-80 bg-[#05080c] border-r border-white/5 shadow-[20px_0_60px_rgba(0,0,0,0.8)] transition-transform duration-500 transform ${historyOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full flex flex-col p-6">
          <div className="flex justify-between items-center mb-10 pt-4">
            <h2 className="font-display text-[11px] tracking-widest uppercase text-cyan-500 font-bold">Neural Bank</h2>
            <button onClick={() => setHistoryOpen(false)} className="w-10 h-10 flex items-center justify-center bg-white/5 rounded-xl hover:bg-white/10 text-slate-400">✕</button>
          </div>
          <button onClick={startNewSession} className="w-full py-4 mb-6 rounded-2xl bg-cyan-500 text-black text-[10px] tracking-[0.3em] uppercase font-black hover:bg-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.2)] transition-all">New Neural Stream</button>
          
          <div className="flex-1 overflow-y-auto space-y-3 scrollbar-hide pr-1">
            {sessions.map(s => (
              <div key={s.id} onClick={() => { setCurrentSessionId(s.id); setHistoryOpen(false); stopChatAudio(); }} className={`p-4 rounded-xl border flex items-center gap-3 cursor-pointer group transition-all ${s.id === currentSessionId ? 'bg-cyan-500/10 border-cyan-500/30 shadow-[inset_0_0_15px_rgba(34,211,238,0.05)]' : 'bg-white/5 border-transparent hover:border-white/10'}`}>
                <div className={`w-2 h-2 rounded-full transition-colors ${s.id === currentSessionId ? 'bg-cyan-500 shadow-[0_0_8px_#22d3ee]' : 'bg-slate-700'}`}></div>
                <p className="text-[11px] font-bold flex-1 truncate uppercase tracking-wider">{s.title}</p>
                <button onClick={(e) => deleteSession(s.id, e)} className="p-2 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-500 transition-opacity">🗑️</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* App Shell Header */}
      <header className="relative z-20 flex flex-col items-center pt-8 px-8 animate-fade-in">
        <div className="w-full flex justify-between items-center absolute top-8 left-0 px-8 pointer-events-none">
           <button onClick={() => setHistoryOpen(true)} className="p-4 bg-[#0a0f16] rounded-2xl border border-white/5 pointer-events-auto hover:border-cyan-500/30 transition-all active:scale-95 shadow-lg">
             <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7"/></svg>
           </button>
           <div className="pointer-events-none opacity-40 flex flex-col items-end">
             <span className="text-[9px] font-display uppercase tracking-widest text-cyan-500">Mirova Core OS</span>
             <span className="text-[7px] text-white/40 uppercase tracking-[0.5em] mt-1">GINNE VIKAS INNOVATION</span>
           </div>
        </div>

        <div className="flex bg-[#0a0f16] p-1.5 rounded-2xl border border-white/5 shadow-2xl relative">
          <button 
            onClick={() => { setMode('LIVE'); disconnect(); stopChatAudio(); }} 
            className={`px-10 py-2.5 rounded-xl text-[10px] tracking-widest font-display uppercase transition-all duration-300 ${mode === 'LIVE' ? 'bg-cyan-500 text-black shadow-[0_0_20px_#22d3ee55] font-black' : 'text-slate-500 hover:text-slate-300'}`}
          >
            LIVE Sync
          </button>
          <button 
            onClick={() => { setMode('CHAT'); stopSpeaking(); }} 
            className={`px-10 py-2.5 rounded-xl text-[10px] tracking-widest font-display uppercase transition-all duration-300 ${mode === 'CHAT' ? 'bg-indigo-600 text-white shadow-[0_0_20px_#4f46e555] font-black' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Chatting
          </button>
        </div>
      </header>

      {/* Main Experience View */}
      <main className="relative z-10 flex-1 flex flex-col w-full overflow-hidden mt-6">
        {mode === 'LIVE' ? (
          <div className="flex-1 flex flex-col items-center justify-center p-4">
             <Visualizer isActive={status === ConnectionStatus.CONNECTED} isSpeaking={isAiSpeaking} />
             <div className="w-full max-w-sm mt-8 animate-fade-in" style={{animationDelay: '0.4s'}}><ControlPanel status={status} onConnect={connect} onDisconnect={disconnect} error={error} /></div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col w-full px-4 max-w-5xl mx-auto overflow-hidden">
            <div className="flex-1 overflow-y-auto space-y-6 py-10 px-2 scrollbar-hide">
              {chatHistory.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-slate-800 pointer-events-none">
                  <div className="w-20 h-20 border-2 border-dashed border-slate-800 rounded-full flex items-center justify-center mb-6">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  </div>
                  <p className="font-display tracking-[0.5em] text-[8px] uppercase">Initializing Chamber Protocol</p>
                </div>
              )}
              {chatHistory.map((msg, i) => (
                <div key={i} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                  <div className={`relative p-6 rounded-3xl transition-all border border-white/5 shadow-2xl flex flex-col gap-4 ${msg.role === 'user' ? 'max-w-[80%] bg-white/5 rounded-tr-none' : 'max-w-[85%] bg-[#05080c] rounded-tl-none'}`}>
                    
                    {msg.role === 'bot' && msg.audioBase64 && (
                      <button onClick={() => playingMsgIndex === i ? stopChatAudio() : playBotAudio(msg.audioBase64!, i)} className={`absolute top-4 right-4 p-2 rounded-full bg-white/5 border border-white/5 transition-all ${playingMsgIndex === i ? 'text-red-500' : 'text-cyan-400 hover:scale-110'}`}>
                        {playingMsgIndex === i ? (
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><rect width="24" height="24"/></svg>
                        ) : (
                          <svg className="w-3 h-3 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                        )}
                      </button>
                    )}

                    {msg.image && (
                      <div className="relative group/img rounded-2xl overflow-hidden border border-white/10 mb-2 shadow-[0_15px_40px_rgba(0,0,0,0.8)]">
                         <img src={msg.image} className="w-full object-cover" alt="Matrix Synthesis Output" />
                         <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-all">
                            <a href={msg.image} download={`mirova_art_${Date.now()}.png`} className="bg-white text-black px-8 py-2.5 rounded-xl font-black text-[9px] tracking-[0.3em] uppercase hover:bg-cyan-500 transition-colors">Export Node</a>
                         </div>
                      </div>
                    )}

                    <div className="text-[14px] leading-relaxed break-words text-slate-100 font-sans tracking-wide">
                       <FormattedText text={msg.text} />
                    </div>

                    {msg.files && msg.files.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                        {msg.files.map((f, idx) => (
                          <span key={idx} className="bg-cyan-500/10 border border-cyan-500/10 px-3 py-1 rounded-lg text-[8px] text-cyan-400 uppercase font-black tracking-widest">📎 {f.name}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {/* Gemini Style Loading Animation */}
              {isProcessing && (
                <div className="flex w-full justify-start animate-fade-in">
                  <div className="relative p-6 rounded-3xl rounded-tl-none border border-white/5 bg-[#05080c] max-w-[85%]">
                     <GeminiLoader />
                  </div>
                </div>
              )}
              
              <div ref={chatEndRef} />
            </div>

            {/* Matrix Console Input */}
            <div className="pb-10 pt-4 w-full relative">
              {attachments.length > 0 && (
                <div className="mb-4 flex gap-2 overflow-x-auto px-2 pb-2 scrollbar-hide">
                  {attachments.map((f, idx) => (
                    <div key={idx} className="bg-[#0a0f16] border border-white/10 p-2 rounded-xl text-[9px] flex items-center gap-2 group shadow-lg">
                      <span className="truncate max-w-[120px] text-cyan-500 font-bold uppercase">{f.name}</span>
                      <button onClick={() => setAttachments(p => p.filter((_, x) => x !== idx))} className="text-slate-600 hover:text-white">✕</button>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="bg-[#0a0f16] border border-white/10 p-2.5 rounded-[2rem] flex items-center shadow-[0_20px_60px_rgba(0,0,0,0.8)] focus-within:ring-2 focus-within:ring-cyan-500/30 transition-all">
                <button onClick={() => setMenuOpen(!menuOpen)} className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all bg-white/5 hover:bg-white/10 ${menuOpen ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>
                   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                </button>
                
                {menuOpen && (
                  <div className="absolute bottom-28 left-0 bg-[#0a0f16] border border-white/5 p-6 rounded-3xl w-72 shadow-[0_20px_80px_rgba(0,0,0,0.9)] z-[100] animate-fade-in">
                    <p className="text-[9px] tracking-[0.4em] text-slate-500 uppercase mb-4 font-bold">Neural Uplink</p>
                    <button onClick={() => { fileInputRef.current?.click(); setMenuOpen(false); }} className="w-full p-4 rounded-xl bg-cyan-500 text-black text-[10px] tracking-widest font-black uppercase mb-6 flex items-center justify-center gap-3 transition-transform active:scale-95">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                      Files
                    </button>
                    <p className="text-[9px] tracking-[0.4em] text-slate-500 uppercase mb-4 font-bold">Aspect Matrix</p>
                    <div className="grid grid-cols-2 gap-2">
                      {['1:1', '16:9', '9:16', '4:3'].map(r => (
                        <button key={r} onClick={() => setAspectRatio(r)} className={`p-3 rounded-lg text-[9px] font-black tracking-widest border transition-all ${aspectRatio === r ? 'bg-indigo-600 text-white border-transparent' : 'border-white/5 text-slate-500 hover:border-white/20'}`}>{r}</button>
                      ))}
                    </div>
                  </div>
                )}
                
                <textarea 
                  rows={1} 
                  value={inputValue} 
                  onChange={e => setInputValue(e.target.value)} 
                  className="flex-1 bg-transparent border-none text-[14px] px-5 h-12 py-3.5 overflow-hidden focus:ring-0 placeholder-slate-700 font-sans" 
                  placeholder="Transmit protocol..." 
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSendMessage()} 
                />
                
                <div className="flex gap-2">
                  <button onClick={() => handleSendMessage(true)} className="px-5 text-[9px] uppercase font-black tracking-widest text-cyan-500 hover:text-white transition-colors">Synthesis</button>
                  <button onClick={() => handleSendMessage()} className={`w-12 h-12 rounded-2xl bg-cyan-500 text-black flex items-center justify-center transition-all ${isProcessing ? 'cursor-not-allowed opacity-50' : 'hover:scale-105 active:scale-95 shadow-[0_0_20px_#22d3ee55]'}`} disabled={isProcessing}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                  </button>
                </div>
              </div>
            </div>
            <input type="file" multiple ref={fileInputRef} className="hidden" onChange={e => setAttachments(p => [...p, ...Array.from(e.target.files || [])])} />
          </div>
        )}
      </main>

      {/* Persistent Speaker Indicator */}
      {isAiSpeaking && (
        <div className="fixed bottom-32 right-8 z-[50] animate-fade-in">
          <button onClick={stopSpeaking} className="w-16 h-16 bg-[#05080c] border-2 border-red-500 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(239,68,68,0.3)] animate-pulse">
            <svg className="w-6 h-6 text-red-500" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12"/></svg>
          </button>
        </div>
      )}

    </div>
  );
}

export default App;
