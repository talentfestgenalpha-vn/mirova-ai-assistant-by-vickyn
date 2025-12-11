import React, { useEffect, useState } from 'react';

const SplashScreen: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setStage(1), 500),   // Wake up
      setTimeout(() => setStage(2), 1500),  // Logo Reveal
      setTimeout(() => setStage(3), 4000),  // Fade Out
      setTimeout(onComplete, 4800)          // Finish
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, [onComplete]);

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center bg-[#020617] transition-opacity duration-1000 ${stage === 3 ? 'opacity-0' : 'opacity-100'}`}>
      
      {/* Immersive Starfield */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_#0f172a_0%,_#000_100%)]"></div>
      
      <div className="relative flex flex-col items-center">
        {/* Futuristic Core Logo */}
        <div className={`relative transition-all duration-1000 transform ${stage >= 1 ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}`}>
          <div className="w-32 h-32 rounded-full border-4 border-white/5 flex items-center justify-center relative shadow-[0_0_80px_rgba(34,211,238,0.1)]">
            {/* Spinning Rings */}
            <div className={`absolute inset-[-10px] rounded-full border-2 border-t-cyan-500/40 animate-spin transition-opacity duration-1000 ${stage >= 2 ? 'opacity-100' : 'opacity-0'}`} style={{ animationDuration: '4s' }}></div>
            <div className={`absolute inset-[-20px] rounded-full border-2 border-b-indigo-500/30 animate-spin transition-opacity duration-1000 ${stage >= 2 ? 'opacity-100' : 'opacity-0'}`} style={{ animationDuration: '6s', animationDirection: 'reverse' }}></div>
            
            {/* Inner Core */}
            <div className="w-14 h-14 bg-gradient-to-tr from-cyan-400 to-indigo-600 rounded-full animate-pulse shadow-[0_0_40px_#22d3ee]"></div>
          </div>
        </div>

        {/* Brand Reveal */}
        <div className="mt-12 overflow-hidden text-center space-y-2">
          <h1 className={`font-display text-5xl font-black tracking-[0.5em] transition-all duration-1000 transform ${stage >= 2 ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
            MIROVA
          </h1>
          <div className={`flex items-center justify-center gap-4 transition-all duration-1000 delay-300 ${stage >= 2 ? 'opacity-100' : 'opacity-0'}`}>
             <div className="h-[1px] w-8 bg-cyan-500/40"></div>
             <p className="font-display text-[9px] tracking-[0.6em] text-cyan-400 font-bold uppercase">Advanced Nexus</p>
             <div className="h-[1px] w-8 bg-cyan-500/40"></div>
          </div>
        </div>

        {/* Loading Indicator */}
        <div className="absolute bottom-20 w-48 h-[1px] bg-white/10 rounded-full overflow-hidden">
           <div className={`h-full bg-cyan-500 shadow-[0_0_10px_#22d3ee] transition-all duration-3000 ease-out ${stage >= 1 ? 'w-full' : 'w-0'}`}></div>
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;
