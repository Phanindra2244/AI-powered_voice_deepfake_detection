import React, { useState, useEffect } from 'react';
import { ShieldAlert, AlertTriangle, CheckCircle2, X, Eye, Zap, Lock, Volume2 } from 'lucide-react';

export default function SecurityAlertBanner({ API_BASE, onOpenDrawer, onNavigateToReport }) {
  const [activeAlert, setActiveAlert] = useState(null);

  // Play synthetic alarm chime using Web Audio API
  const playAlertChime = (severity) => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = severity === 'CRITICAL' ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(severity === 'CRITICAL' ? 880 : 660, ctx.currentTime); // A5 or E5
      osc.frequency.exponentialRampToValueAtTime(severity === 'CRITICAL' ? 440 : 330, ctx.currentTime + 0.3);

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {}
  };

  // SSE Real-Time Incident Stream Listener
  useEffect(() => {
    let eventSource = null;
    try {
      const streamUrl = `${API_BASE}/alerts/stream`;
      eventSource = new EventSource(streamUrl);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.incident_id && (data.severity === 'CRITICAL' || data.severity === 'HIGH')) {
            setActiveAlert(data);
            playAlertChime(data.severity);
          } else if (data && data.alert_id && (data.severity === 'CRITICAL' || data.severity === 'HIGH')) {
            setActiveAlert(data);
            playAlertChime(data.severity);
          }
        } catch (e) {}
      };
    } catch (e) {
      console.warn('SSE banner listener fallback:', e);
    }

    return () => {
      if (eventSource) eventSource.close();
    };
  }, [API_BASE]);

  const handleAcknowledge = async (id) => {
    try {
      await fetch(`${API_BASE}/incidents/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ACKNOWLEDGED', analyst_notes: 'Acknowledged via real-time SOC alert banner.' })
      });
    } catch (e) {}
    setActiveAlert(null);
  };

  const handleBlockCaller = async (id) => {
    try {
      await fetch(`${API_BASE}/incidents/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'RESOLVED', analyst_notes: 'Caller blocked and isolated at VoIP gateway.' })
      });
      alert(`Caller isolated and incident ${id} resolved.`);
    } catch (e) {}
    setActiveAlert(null);
  };

  if (!activeAlert) return null;

  const incId = activeAlert.incident_id || activeAlert.alert_id || 'INC-2026-ALERT';
  const isCritical = activeAlert.severity === 'CRITICAL';

  return (
    <div className="fixed top-20 right-6 z-50 max-w-lg w-full font-mono text-xs animate-in slide-in-from-top-4 duration-300">
      <div className={`p-5 rounded-2xl backdrop-blur-2xl shadow-2xl border ${
        isCritical
          ? 'bg-rose-950/90 border-rose-500/80 text-rose-100 shadow-[0_0_35px_rgba(244,63,94,0.4)] animate-pulse'
          : 'bg-amber-950/90 border-amber-500/80 text-amber-100 shadow-[0_0_30px_rgba(245,158,11,0.3)]'
      }`}>
        
        {/* Banner Header */}
        <div className="flex items-center justify-between pb-3 border-b border-rose-500/30">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-xl ${isCritical ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'}`}>
              <ShieldAlert className="w-5 h-5 animate-bounce" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white uppercase tracking-wider">{activeAlert.severity} THREAT INCIDENT DETECTED</span>
                <Volume2 className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
              </div>
              <p className="text-[10px] text-slate-300">Ref ID: {incId} • Score: {activeAlert.risk_score || activeAlert.composite_score}%</p>
            </div>
          </div>

          <button
            onClick={() => setActiveAlert(null)}
            className="text-slate-400 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Incident Content */}
        <div className="py-3 space-y-2">
          <div className="flex justify-between items-center bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
            <div>
              <span className="text-[10px] text-slate-400 block uppercase">Target Profile</span>
              <span className="font-bold text-white text-xs">{activeAlert.target_identity || 'Executive Profile'}</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 block uppercase">Caller Origin</span>
              <span className="font-bold text-cyan-300 text-xs">{activeAlert.caller_id}</span>
            </div>
          </div>

          <div className="space-y-1 pt-1">
            <span className="text-[10px] text-slate-400 block uppercase">Triggered Threat Indicators:</span>
            {activeAlert.threat_indicators?.slice(0, 3).map((ind, idx) => (
              <div key={idx} className="flex items-start gap-1.5 text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1 shrink-0"></span>
                <span className="text-slate-200">{ind}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="pt-3 border-t border-rose-500/30 flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={() => handleAcknowledge(incId)}
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-850 text-slate-200 border border-slate-700 font-bold transition-all flex items-center gap-1"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Acknowledge</span>
          </button>

          <button
            onClick={() => {
              setActiveAlert(null);
              if (onOpenDrawer) onOpenDrawer();
            }}
            className="px-3 py-1.5 rounded-xl bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/80 font-bold transition-all flex items-center gap-1"
          >
            <Eye className="w-3.5 h-3.5 text-cyan-400" />
            <span>Full Dossier</span>
          </button>

          <button
            onClick={() => handleBlockCaller(incId)}
            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold tracking-wider shadow-[0_0_15px_rgba(244,63,94,0.4)] transition-all flex items-center gap-1"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Block Caller</span>
          </button>
        </div>

      </div>
    </div>
  );
}
