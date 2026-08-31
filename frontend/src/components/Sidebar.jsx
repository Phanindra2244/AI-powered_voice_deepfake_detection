import React from 'react';
import { Mic, Sparkles, Fingerprint, FileText, Activity, ShieldCheck, ShieldAlert, Users, Cpu, HardDrive, Zap, Radio, ChevronLeft } from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, sidebarOpen, setSidebarOpen }) {
  if (!sidebarOpen) return null;

  const navItems = [
    { id: 'analyzer', label: 'Deepfake & Live Analyzer', icon: Mic, desc: 'Real-time spectral inspection' },
    { id: 'risk', label: 'Threat Risk Engine', icon: Activity, desc: 'Dynamic multi-vector risk posture' },
    { id: 'speakers', label: 'Trusted Speakers', icon: Users, desc: 'Biometric voiceprint directory' },
    { id: 'intent', label: 'Intent & Risk Engine', icon: ShieldAlert, desc: 'Speech ASR & Social engineering risk' },
    { id: 'studio', label: 'Voice Studio & Cloning', icon: Sparkles, desc: 'TTS & Voice cloning workspace' },
    { id: 'watermark', label: 'Watermark Verifier', icon: Fingerprint, desc: 'Steganographic signature scanner' },
    { id: 'reports', label: 'Forensic Reports', icon: FileText, desc: 'Chain of custody audit certificates' }
  ];

  return (
    <aside className="w-72 shrink-0 backdrop-blur-xl bg-slate-950/90 border-r border-slate-800/80 p-5 flex flex-col justify-between min-h-[calc(100vh-65px)] transition-all duration-300 z-40">
      
      {/* Navigation Links */}
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <span className="text-xs font-mono font-bold uppercase tracking-widest text-slate-400">SOC Modules</span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="text-slate-400 hover:text-cyan-400 p-1 rounded hover:bg-slate-900 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        <nav className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-start gap-3 p-3 rounded-xl text-left transition-all duration-200 ${
                  isActive
                    ? 'bg-gradient-to-r from-cyan-950/60 to-slate-900 border border-cyan-500/50 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent'
                }`}
              >
                <div className={`p-2 rounded-lg ${isActive ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40' : 'bg-slate-900 text-slate-400'}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold font-mono tracking-wide block text-slate-200">{item.label}</span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">{item.desc}</span>
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom HUD Metrics Box */}
      <div className="space-y-4 pt-6 border-t border-slate-800/80 font-mono text-xs">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block">System Telemetry HUD</span>
        
        <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-slate-400 flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5 text-cyan-400" /> FFT Resolution</span>
            <span className="text-cyan-300 font-bold">256 Bins</span>
          </div>

          <div className="flex justify-between items-center text-[11px]">
            <span className="text-slate-400 flex items-center gap-1.5"><HardDrive className="w-3.5 h-3.5 text-purple-400" /> Sample Rate</span>
            <span className="text-slate-200 font-bold">44.1 kHz</span>
          </div>

          <div className="flex justify-between items-center text-[11px]">
            <span className="text-slate-400 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-emerald-400" /> Latency</span>
            <span className="text-emerald-400 font-bold">&lt; 14 ms</span>
          </div>

          <div className="flex justify-between items-center text-[11px]">
            <span className="text-slate-400 flex items-center gap-1.5"><Radio className="w-3.5 h-3.5 text-rose-400" /> Stream Buffer</span>
            <span className="text-rose-300 font-bold">LIVE STREAM</span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-950 border border-slate-850 text-[11px] text-slate-400 flex items-center justify-between">
          <span>Engine Status</span>
          <span className="text-emerald-400 font-bold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
            ACTIVE
          </span>
        </div>
      </div>

    </aside>
  );
}
