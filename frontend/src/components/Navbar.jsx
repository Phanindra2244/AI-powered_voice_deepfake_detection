import React from 'react';
import { ShieldCheck, Mic, Sparkles, Fingerprint, FileText, Activity, Lock, Cpu, Menu, X, LayoutGrid } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, apiStatus, sidebarOpen, setSidebarOpen }) {
  const tabs = [
    { id: 'analyzer', label: 'Deepfake & Live Analyzer', icon: Mic, badge: 'REAL-TIME' },
    { id: 'studio', label: 'Voice Studio & Cloning', icon: Sparkles, badge: 'ADMIN' },
    { id: 'watermark', label: 'Watermark Verifier', icon: Fingerprint, badge: 'STEVO' },
    { id: 'reports', label: 'Forensic Reports', icon: FileText, badge: 'AUDIT' }
  ];

  return (
    <header className="sticky top-0 z-50 w-full backdrop-blur-xl bg-slate-950/80 border-b border-slate-800/80 shadow-2xl shadow-cyan-950/20">
      <div className="max-w-[1700px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        
        {/* Left Brand Identity & Sidebar Toggle */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-cyan-400 hover:border-cyan-500/40 transition-all duration-200"
            title="Toggle SOC Dashboard Sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-500 to-purple-600 p-[1.5px] shadow-lg shadow-cyan-500/25">
              <div className="w-full h-full bg-slate-950 rounded-[10.5px] flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-cyan-400" />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-black tracking-wider text-white font-mono">
                  VOICEGUARD<span className="text-cyan-400">.SOC</span>
                </span>
                <span className="px-2 py-0.5 text-[10px] font-bold tracking-widest font-mono rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/80 uppercase shadow-inner">
                  ENTERPRISE v2.4
                </span>
              </div>
              <p className="text-[11px] text-slate-400 tracking-tight hidden sm:block">
                Cybersecurity Operations Center • Deepfake Forensics & Steganography Engine
              </p>
            </div>
          </div>
        </div>

        {/* Center Navigation Tabs with Glowing Active Indicators */}
        <nav className="hidden lg:flex items-center gap-1.5 bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800/90 shadow-inner">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-2.5 px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all duration-300 ${
                  isActive
                    ? 'bg-slate-950 text-cyan-300 border border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.25)]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/60'
                }`}
              >
                <Icon className={`w-4 h-4 transition-transform ${isActive ? 'text-cyan-400 scale-110' : 'text-slate-400'}`} />
                <span>{tab.label}</span>

                {tab.badge && (
                  <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded ${
                    isActive ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {tab.badge}
                  </span>
                )}

                {/* Glowing Bottom Indicator Bar */}
                {isActive && (
                  <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-gradient-to-r from-cyan-400 to-indigo-500 rounded-full shadow-[0_0_8px_#06b6d4]"></span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Right HUD Status Indicators */}
        <div className="flex items-center gap-3 font-mono text-xs">
          
          <div className="flex items-center gap-2 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-800/90">
            <span className={`w-2 h-2 rounded-full ${apiStatus ? 'bg-emerald-400 shadow-[0_0_10px_#10b981] animate-pulse' : 'bg-rose-500'}`}></span>
            <span className="text-slate-300 font-semibold">{apiStatus ? 'API: ONLINE' : 'API: OFF'}</span>
          </div>

          <div className="hidden sm:flex items-center gap-2 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-800/90 text-cyan-400">
            <Cpu className="w-3.5 h-3.5" />
            <span className="text-slate-300">NEURAL-2.4</span>
          </div>

          <div className="hidden xl:flex items-center gap-2 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-800/90 text-emerald-400">
            <Lock className="w-3.5 h-3.5" />
            <span className="text-slate-300">STEGO-256</span>
          </div>

        </div>

      </div>
    </header>
  );
}
