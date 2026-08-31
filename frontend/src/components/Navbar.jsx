import React from 'react';
import { ShieldCheck, ShieldAlert, Users, Mic, Sparkles, Fingerprint, FileText, Activity, Lock, Cpu, Menu, X, Bell } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, apiStatus, sidebarOpen, setSidebarOpen, onOpenAlertDrawer, alertCount = 2 }) {
  const tabs = [
    { id: 'analyzer', label: 'Deepfake & Live Analyzer', icon: Mic, badge: 'REAL-TIME' },
    { id: 'risk', label: 'Threat Risk Engine', icon: Activity, badge: 'MULTI-VECTOR' },
    { id: 'speakers', label: 'Trusted Speakers', icon: Users, badge: 'VOICEPRINT' },
    { id: 'intent', label: 'Intent & Risk Engine', icon: ShieldAlert, badge: 'ASR+NLP' },
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

        {/* Right HUD Status Indicators & Bell Alert Trigger */}
        <div className="flex items-center gap-3 font-mono text-xs">
          
          {/* Bell Notification Trigger */}
          <button
            onClick={onOpenAlertDrawer}
            className="relative p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-rose-400 hover:border-rose-500/40 transition-all"
            title="Open Incident Alerts Stream"
          >
            <Bell className="w-4 h-4 text-rose-400" />
            {alertCount > 0 && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.2 text-[9px] font-bold rounded-full bg-rose-500 text-white animate-pulse">
                {alertCount}
              </span>
            )}
          </button>
          
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
