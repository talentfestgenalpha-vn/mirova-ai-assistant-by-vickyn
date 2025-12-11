import React from 'react';
import { ConnectionStatus } from '../types';

interface ControlPanelProps {
  status: ConnectionStatus;
  onConnect: () => void;
  onDisconnect: () => void;
  error: string | null;
}

const ControlPanel: React.FC<ControlPanelProps> = ({ status, onConnect, onDisconnect, error }) => {
  const isConnected = status === ConnectionStatus.CONNECTED;
  const isConnecting = status === ConnectionStatus.CONNECTING;

  return (
    <div className="flex flex-col items-center gap-10 z-20 w-full animate-fade-in" style={{animationDelay: '0.2s'}}>
      
      {/* Enhanced Activation UI */}
      <div className="relative group flex flex-col items-center">
        <div className={`absolute -inset-4 rounded-full blur-2xl opacity-20 transition duration-700 ${isConnected ? 'bg-red-500 animate-pulse' : 'bg-cyan-500 group-hover:opacity-40'}`}></div>
        
        <button
          onClick={isConnected ? onDisconnect : onConnect}
          disabled={isConnecting}
          className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500 transform active:scale-90 shadow-2xl border-2 ${
            isConnected 
              ? 'bg-[#111827] border-red-500 text-red-500 hover:bg-red-500/5' 
              : 'bg-white border-white text-black hover:bg-white hover:shadow-[0_0_30px_rgba(255,255,255,0.3)]'
          }`}
        >
          {isConnected ? (
             <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/></svg>
          ) : isConnecting ? (
             <div className="w-8 h-8 border-4 border-slate-200 border-t-cyan-500 rounded-full animate-spin"></div>
          ) : (
            <svg className="w-8 h-8 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          )}
        </button>

        <p className={`mt-6 font-display text-[10px] tracking-[0.4em] uppercase font-bold transition-colors duration-500 ${isConnected ? 'text-red-500' : 'text-slate-400'}`}>
          {isConnecting ? 'Authenticating Core...' : isConnected ? 'Active Uplink' : 'Initialize Matrix'}
        </p>
      </div>

      {/* Elegant Error Notice */}
      {error && (
        <div className="px-8 py-3 bg-red-500/10 border border-red-500/20 text-red-200 rounded-2xl text-center backdrop-blur-xl animate-bounce-in">
          <p className="text-xs font-bold uppercase tracking-wider">{error}</p>
        </div>
      )}

      {/* Credit Footer */}
      <div className="text-center space-y-2 opacity-50 hover:opacity-100 transition-opacity duration-700 cursor-default">
        <p className="text-[9px] tracking-[0.4em] font-black text-slate-300 uppercase">Class 7th A • CBSE Excellence</p>
        <p className="text-[9px] text-cyan-500/60 tracking-[0.2em] uppercase font-bold">Saint John's School Talent Fest • Kasimkota</p>
      </div>
    </div>
  );
};

export default ControlPanel;
