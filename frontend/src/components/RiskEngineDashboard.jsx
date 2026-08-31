import React, { useState, useEffect } from 'react';
import {
  ShieldAlert, ShieldCheck, AlertTriangle, Zap, Activity, Sliders,
  RefreshCw, CheckCircle2, AlertCircle, ArrowUpRight, Lock, DollarSign,
  PhoneCall, Mic, Info, BarChart3, Layers, Plus, Trash2, X
} from 'lucide-react';

const DEFAULT_PRESET_SCENARIOS = [
  { id: 'scen-1', title: '🚨 Critical Wire Fraud (₹50k)', df: 94, spkSim: 0.15, intent: 90, ch: 'Inbound VoIP / Untrusted Gateway', amt: 50000, theme: 'rose' },
  { id: 'scen-2', title: '⚠️ High Suspicious Helpdesk', df: 75, spkSim: 0.45, intent: 60, ch: 'External Mobile Network', amt: 12000, theme: 'amber' },
  { id: 'scen-3', title: '⚡ Medium OTP Step-Up', df: 40, spkSim: 0.70, intent: 30, ch: 'External Mobile Network', amt: 2500, theme: 'yellow' },
  { id: 'scen-4', title: '✅ Low Risk Authentic Inquiry', df: 5, spkSim: 0.96, intent: 10, ch: 'Internal SIP Extension', amt: 800, theme: 'emerald' }
];

export default function RiskEngineDashboard({ API_BASE }) {
  // Simulator Telemetry State
  const [deepfakeRisk, setDeepfakeRisk] = useState(85);
  const [speakerSimilarity, setSpeakerSimilarity] = useState(0.22); // 22% similarity = 78% mismatch
  const [intentRisk, setIntentRisk] = useState(80);
  const [callChannel, setCallChannel] = useState('Inbound VoIP / Untrusted Gateway');
  const [transactionAmount, setTransactionAmount] = useState(50000);

  // Scenarios State
  const [scenarios, setScenarios] = useState(() => {
    try {
      const saved = localStorage.getItem('voiceguard_custom_scenarios');
      return saved ? JSON.parse(saved) : DEFAULT_PRESET_SCENARIOS;
    } catch (e) {
      return DEFAULT_PRESET_SCENARIOS;
    }
  });

  // Modal State for Adding New Threat Scenario
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDf, setNewDf] = useState(80);
  const [newSpkSim, setNewSpkSim] = useState(30);
  const [newIntent, setNewIntent] = useState(75);
  const [newChannel, setNewChannel] = useState('Inbound VoIP / Untrusted Gateway');
  const [newAmount, setNewAmount] = useState(100000);

  // Read dynamic active telemetry from current inspect session if available
  useEffect(() => {
    try {
      const savedAudio = localStorage.getItem('voiceguard_latest_analysis_result');
      const savedIntent = localStorage.getItem('voiceguard_latest_intent_result');

      let dfScore = 15;
      let spkSim = 0.95;
      let intScore = 0;
      let amount = 0;

      if (savedAudio) {
        const parsed = JSON.parse(savedAudio);
        const data = parsed.analysisResult || parsed;
        if (data.confidenceScore !== undefined) {
          dfScore = data.confidenceScore;
        }
        if (data.speakerVerification && data.speakerVerification.similarity_score !== undefined) {
          spkSim = data.speakerVerification.similarity_score;
        }
      }

      if (savedIntent) {
        const parsedIntent = JSON.parse(savedIntent);
        if (parsedIntent.intent_risk_score !== undefined) {
          intScore = parsedIntent.intent_risk_score;
        }
        if (parsedIntent.caller_context?.transactionAmount !== undefined) {
          amount = Number(parsedIntent.caller_context.transactionAmount);
        }
        if (parsedIntent.caller_context?.callChannel) {
          setCallChannel(parsedIntent.caller_context.callChannel);
        }
      }

      setDeepfakeRisk(dfScore);
      setSpeakerSimilarity(spkSim);
      setIntentRisk(intScore);
      setTransactionAmount(amount);
    } catch (e) {}
  }, []);

  // Save scenarios to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('voiceguard_custom_scenarios', JSON.stringify(scenarios));
    } catch (e) {}
  }, [scenarios]);

  // Evaluated Result State
  const [loading, setLoading] = useState(false);
  const [riskData, setRiskData] = useState(null);

  // High Risk Incident Trigger Handler
  const triggerIncidentIfHighRisk = async (riskData) => {
    if (!riskData) return;
    
    const compositeScore = riskData.composite_risk_score ?? riskData.risk_score ?? 0;
    const isHighOrCritical = compositeScore >= 65 || riskData.risk_tier === "HIGH" || riskData.risk_tier === "CRITICAL";

    if (isHighOrCritical) {
      try {
        const endpoint = API_BASE ? `${API_BASE}/incidents` : '/api/incidents';
        await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            severity: compositeScore >= 85 ? 'CRITICAL' : 'HIGH',
            risk_score: compositeScore,
            target_identity: riskData.target_identity || 'Unknown Caller',
            threat_indicators: riskData.primary_threat_drivers || riskData.threat_indicators || []
          })
        });
      } catch (err) {
        console.error('Failed to dispatch high risk incident alert:', err);
      }
    }
  };

  const evaluateRisk = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/risk/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deepfake_risk: deepfakeRisk,
          speaker_similarity: speakerSimilarity,
          intent_urgency_risk: intentRisk,
          callChannel: callChannel,
          transactionAmount: transactionAmount
        })
      });
      const data = await res.json();
      
      if (data && data.success && data.data) {
        setRiskData(data.data);
        
        // Defensive check: invoke auxiliary callback without breaking primary evaluation pipeline
        try {
          if (typeof triggerIncidentIfHighRisk === 'function') {
            await triggerIncidentIfHighRisk(data.data);
          }
        } catch (auxErr) {
          console.warn('Auxiliary notification callback error:', auxErr);
        }
      } else if (data && data.data) {
        // Fallback: update risk state if payload is present
        setRiskData(data.data);
      } else {
        console.warn('Risk evaluation returned warning/error:', data?.error || 'Unknown evaluation error');
      }
    } catch (err) {
      console.error('Failed to evaluate risk:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    evaluateRisk();
  }, [deepfakeRisk, speakerSimilarity, intentRisk, callChannel, transactionAmount]);

  // Preset Scenario Quick Loaders
  const loadScenario = (df, spkSim, intent, ch, amt) => {
    setDeepfakeRisk(df);
    setSpeakerSimilarity(spkSim);
    setIntentRisk(intent);
    setCallChannel(ch);
    setTransactionAmount(amt);
  };

  // Handle Add New Custom Scenario
  const handleAddScenario = (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const newScenarioObj = {
      id: `scen-${Date.now()}`,
      title: newTitle.trim(),
      df: newDf,
      spkSim: newSpkSim / 100,
      intent: newIntent,
      ch: newChannel,
      amt: newAmount,
      custom: true
    };

    setScenarios((prev) => [...prev, newScenarioObj]);
    loadScenario(newScenarioObj.df, newScenarioObj.spkSim, newScenarioObj.intent, newScenarioObj.ch, newScenarioObj.amt);

    // Reset Form
    setNewTitle('');
    setShowAddModal(false);
  };

  const handleDeleteScenario = (id, e) => {
    e.stopPropagation();
    setScenarios((prev) => prev.filter((s) => s.id !== id));
  };

  // Helper for Speedometer Arc Calculation
  const score = riskData ? riskData.composite_risk_score : 0;
  const radius = 80;
  const strokeWidth = 14;
  const circumference = Math.PI * radius; // Semi-circle arc length
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="space-y-6">
      
      {/* Header Card */}
      <div className="cyber-panel p-6 backdrop-blur-xl bg-slate-900/70 border border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div>
            <div className="flex items-center gap-2.5">
              <Activity className="w-6 h-6 text-cyan-400" />
              <h2 className="text-xl font-bold tracking-tight text-white">
                Dynamic Combined Threat Posture & Risk Engine
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Fuses voice spoofing probabilities (40%), speaker biometrics (25%), conversation intent (20%), context origin (10%), and financial exposure (5%).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 text-xs font-mono font-bold rounded-lg bg-rose-950 text-rose-400 border border-rose-800">
              1.25x HIGH-THREAT MULTIPLIER ACTIVE
            </span>
          </div>
        </div>

        {/* Dynamic Preset Scenarios Bar with Add Custom Scenario Option */}
        <div className="pt-4 flex flex-wrap items-center gap-2 font-mono text-xs">
          <span className="text-[11px] text-slate-400 uppercase mr-1">THREAT PRESETS:</span>

          {scenarios.map((scen) => (
            <div key={scen.id} className="relative group">
              <button
                onClick={() => loadScenario(scen.df, scen.spkSim, scen.intent, scen.ch, scen.amt)}
                className={`px-3 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 ${
                  scen.theme === 'rose' || (scen.df >= 80)
                    ? 'bg-rose-950/80 hover:bg-rose-900 text-rose-300 border-rose-800'
                    : scen.theme === 'amber' || (scen.df >= 60)
                    ? 'bg-amber-950/80 hover:bg-amber-900 text-amber-300 border-amber-800'
                    : scen.theme === 'yellow' || (scen.df >= 35)
                    ? 'bg-yellow-950/80 hover:bg-yellow-900 text-yellow-300 border-yellow-800'
                    : 'bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border-emerald-800'
                }`}
              >
                <span>{scen.title}</span>
                {scen.custom && (
                  <span
                    onClick={(e) => handleDeleteScenario(scen.id, e)}
                    className="p-0.5 hover:text-white hover:bg-slate-800 rounded transition-all"
                    title="Delete Custom Scenario"
                  >
                    <Trash2 className="w-3 h-3 text-rose-400" />
                  </span>
                )}
              </button>
            </div>
          ))}

          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 rounded-xl bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/80 transition-all flex items-center gap-1.5 font-bold shadow-[0_0_10px_rgba(6,182,212,0.2)]"
          >
            <Plus className="w-3.5 h-3.5 text-cyan-400" />
            <span>+ Add Custom Scenario</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Threat Posture Gauge & Vectors (7 Cols) vs Simulator Controls (5 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Speedometer Radial Gauge & Factor Matrix (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Speedometer Radial Gauge Card */}
          <div className="cyber-panel p-6 backdrop-blur-xl bg-slate-900/70 border border-slate-800 flex flex-col items-center justify-center relative space-y-4">
            
            <span className="text-xs font-mono uppercase tracking-widest text-slate-400 self-start flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-cyan-400" />
              COMPOSITE THREAT POSTURE SPEEDOMETER
            </span>

            {/* SVG Speedometer Gauge */}
            <div className="relative w-64 h-36 flex items-center justify-center mt-2">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 200 110">
                {/* Background Track Arc */}
                <path
                  d="M 20 100 A 80 80 0 0 1 180 100"
                  fill="none"
                  stroke="#1e293b"
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                />

                {/* Animated Gradient Value Arc */}
                <path
                  d="M 20 100 A 80 80 0 0 1 180 100"
                  fill="none"
                  stroke={riskData?.color_hex || '#06b6d4'}
                  strokeWidth={strokeWidth}
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  className="transition-all duration-1000 ease-out"
                  style={{
                    filter: `drop-shadow(0 0 10px ${riskData?.color_hex || '#06b6d4'})`
                  }}
                />
              </svg>

              {/* Center Score Readout */}
              <div className="absolute bottom-2 flex flex-col items-center">
                <span
                  className="text-4xl font-black font-mono tracking-tight"
                  style={{ color: riskData?.color_hex || '#ffffff' }}
                >
                  {score}%
                </span>
                <span
                  className={`px-2.5 py-0.5 text-[10px] font-mono font-bold rounded uppercase tracking-widest mt-1 border ${
                    riskData?.risk_tier === 'CRITICAL'
                      ? 'bg-rose-950 text-rose-300 border-rose-700'
                      : riskData?.risk_tier === 'HIGH'
                      ? 'bg-orange-950 text-orange-300 border-orange-700'
                      : riskData?.risk_tier === 'MEDIUM'
                      ? 'bg-amber-950 text-amber-300 border-amber-700'
                      : 'bg-emerald-950 text-emerald-300 border-emerald-700'
                  }`}
                >
                  {riskData?.risk_tier || 'LOW'} RISK POSTURE
                </span>
              </div>
            </div>

            {/* High Threat Multiplier Alert Tag */}
            {riskData?.multiplier_applied && (
              <div className="w-full flex items-center justify-center gap-2 bg-rose-950/60 border border-rose-800/80 py-2 px-4 rounded-xl font-mono text-xs text-rose-300 animate-pulse">
                <Zap className="w-4 h-4 fill-rose-400 text-rose-400" />
                <span>HIGH-THREAT MULTIPLIER APPLIED (1.25x Boost: Deepfake &gt; 80% & Intent &gt; 70%)</span>
              </div>
            )}

            {/* Recommended Action Trigger Banner */}
            {riskData && (
              <div
                className={`w-full p-4 rounded-xl border font-mono text-xs space-y-1 ${
                  riskData.severity === 'danger'
                    ? 'bg-rose-950/40 border-rose-800 text-rose-300'
                    : riskData.severity === 'warning'
                    ? 'bg-amber-950/40 border-amber-800 text-amber-300'
                    : 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                }`}
              >
                <div className="flex items-center justify-between font-bold">
                  <span className="uppercase tracking-wider">ACTION TRIGGER: {riskData.recommended_action}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-950 border border-current uppercase">
                    AUTOMATED ENFORCEMENT
                  </span>
                </div>
                <p className="text-xs font-sans text-slate-200">{riskData.action_description}</p>
              </div>
            )}
          </div>

          {/* 5 Contributing Risk Vectors Breakdown Matrix */}
          <div className="cyber-panel p-6 backdrop-blur-xl bg-slate-900/70 border border-slate-800 space-y-4">
            <h3 className="text-xs font-bold text-slate-200 font-mono uppercase tracking-widest flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              5-VECTOR CONTRIBUTING RISK WEIGHT MATRIX
            </h3>

            {riskData?.factor_breakdown && (
              <div className="space-y-3 font-mono text-xs">
                
                {/* Vector 1: Deepfake (40%) */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-slate-300">
                    <span>1. AI Synthetic Deepfake Probability (40% Weight)</span>
                    <span className="font-bold text-cyan-400">{riskData.factor_breakdown.deepfake_risk}%</span>
                  </div>
                  <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden p-0.5 border border-slate-800">
                    <div
                      className="bg-cyan-400 h-full rounded-full transition-all duration-700"
                      style={{ width: `${riskData.factor_breakdown.deepfake_risk}%` }}
                    ></div>
                  </div>
                </div>

                {/* Vector 2: Speaker Discrepancy (25%) */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-slate-300">
                    <span>2. Speaker Biometric Discrepancy (25% Weight)</span>
                    <span className="font-bold text-purple-400">{riskData.factor_breakdown.speaker_mismatch_risk}%</span>
                  </div>
                  <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden p-0.5 border border-slate-800">
                    <div
                      className="bg-purple-400 h-full rounded-full transition-all duration-700"
                      style={{ width: `${riskData.factor_breakdown.speaker_mismatch_risk}%` }}
                    ></div>
                  </div>
                </div>

                {/* Vector 3: Intent & Urgency (20%) */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-slate-300">
                    <span>3. Conversation Intent & Urgency (20% Weight)</span>
                    <span className="font-bold text-amber-400">{riskData.factor_breakdown.intent_urgency_risk}%</span>
                  </div>
                  <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden p-0.5 border border-slate-800">
                    <div
                      className="bg-amber-400 h-full rounded-full transition-all duration-700"
                      style={{ width: `${riskData.factor_breakdown.intent_urgency_risk}%` }}
                    ></div>
                  </div>
                </div>

                {/* Vector 4: Context Anomaly (10%) */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-slate-300">
                    <span>4. Caller Context Origin Anomaly (10% Weight)</span>
                    <span className="font-bold text-rose-400">{riskData.factor_breakdown.context_anomaly_risk}%</span>
                  </div>
                  <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden p-0.5 border border-slate-800">
                    <div
                      className="bg-rose-400 h-full rounded-full transition-all duration-700"
                      style={{ width: `${riskData.factor_breakdown.context_anomaly_risk}%` }}
                    ></div>
                  </div>
                </div>

                {/* Vector 5: Financial Stake (5%) */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-slate-300">
                    <span>5. Transaction Stake Exposure (5% Weight)</span>
                    <span className="font-bold text-emerald-400">{riskData.factor_breakdown.transaction_stake_risk}%</span>
                  </div>
                  <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden p-0.5 border border-slate-800">
                    <div
                      className="bg-emerald-400 h-full rounded-full transition-all duration-700"
                      style={{ width: `${riskData.factor_breakdown.transaction_stake_risk}%` }}
                    ></div>
                  </div>
                </div>

              </div>
            )}
          </div>

          {/* Primary Threat Drivers List Card */}
          {riskData?.primary_threat_drivers && (
            <div className="cyber-panel p-6 backdrop-blur-xl bg-slate-900/70 border border-slate-800 space-y-3">
              <h3 className="text-xs font-bold text-slate-200 font-mono uppercase tracking-widest flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400" />
                PRIMARY IDENTIFIED THREAT DRIVERS
              </h3>

              <div className="space-y-2 font-mono text-xs">
                {riskData.primary_threat_drivers.map((driver, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2.5 bg-slate-950 p-3 rounded-xl border border-slate-850 text-slate-200"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 shrink-0"></span>
                    <span className="font-sans text-xs">{driver}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Right Column: Interactive Telemetry Simulator Sliders (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          <div className="cyber-panel p-6 backdrop-blur-xl bg-slate-900/70 border border-slate-800 space-y-5">
            <h3 className="text-xs font-bold text-slate-200 font-mono uppercase tracking-widest flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" />
              INTERACTIVE THREAT VECTOR TELEMETRY SIMULATOR
            </h3>

            <div className="space-y-5 font-mono text-xs">
              
              {/* Slider 1: Deepfake Probability */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-slate-400">1. Deepfake Probability Score</label>
                  <span className="font-bold text-cyan-400">{deepfakeRisk}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={deepfakeRisk}
                  onChange={(e) => setDeepfakeRisk(Number(e.target.value))}
                  className="w-full accent-cyan-400 bg-slate-950 cursor-pointer"
                />
              </div>

              {/* Slider 2: Speaker Similarity */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-slate-400">2. Speaker Biometric Match Similarity</label>
                  <span className="font-bold text-purple-400">{Math.round(speakerSimilarity * 100)}% Match</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={Math.round(speakerSimilarity * 100)}
                  onChange={(e) => setSpeakerSimilarity(Number(e.target.value) / 100)}
                  className="w-full accent-purple-400 bg-slate-950 cursor-pointer"
                />
                <span className="text-[10px] text-slate-500 block">
                  Discrepancy Mismatch Risk: {Math.round((1 - speakerSimilarity) * 100)}%
                </span>
              </div>

              {/* Slider 3: Intent & Urgency */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-slate-400">3. Intent Urgency Risk Score</label>
                  <span className="font-bold text-amber-400">{intentRisk}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={intentRisk}
                  onChange={(e) => setIntentRisk(Number(e.target.value))}
                  className="w-full accent-amber-400 bg-slate-950 cursor-pointer"
                />
              </div>

              {/* Input 4: Call Channel */}
              <div className="space-y-2">
                <label className="text-slate-400 block">4. Call Channel Origin</label>
                <select
                  value={callChannel}
                  onChange={(e) => setCallChannel(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:border-cyan-400 focus:outline-none"
                >
                  <option value="Inbound VoIP / Untrusted Gateway">Inbound VoIP / Untrusted Gateway (High Risk)</option>
                  <option value="External Mobile Network">External Mobile Network (Medium Risk)</option>
                  <option value="International PSTN Trunk">International PSTN Trunk (High Risk)</option>
                  <option value="Internal SIP Extension">Internal SIP Extension (Low Risk)</option>
                </select>
              </div>

              {/* Input 5: Transaction Amount */}
              <div className="space-y-2">
                <label className="text-slate-400 block">5. Transaction Amount (₹ INR)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-500">₹</span>
                  <input
                    type="number"
                    value={transactionAmount}
                    onChange={(e) => setTransactionAmount(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-7 pr-3 py-2 text-slate-200 focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>

            </div>
          </div>

        </div>

      </div>

      {/* Modal Dialog: Create Custom Threat Scenario */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="cyber-panel p-6 max-w-lg w-full bg-slate-900 border border-slate-800 space-y-5 relative">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                  CREATE CUSTOM THREAT SCENARIO PRESET
                </h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white font-mono text-xs p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddScenario} className="space-y-4 font-mono text-xs">
              
              <div>
                <label className="text-slate-400 block mb-1">Scenario Title / Name</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="🔥 CEO Urgent Wire Transfer (₹2.5L)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-slate-400">Deepfake Risk %</label>
                    <span className="font-bold text-cyan-400">{newDf}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={newDf}
                    onChange={(e) => setNewDf(Number(e.target.value))}
                    className="w-full accent-cyan-400 bg-slate-950 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-slate-400">Speaker Match %</label>
                    <span className="font-bold text-purple-400">{newSpkSim}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={newSpkSim}
                    onChange={(e) => setNewSpkSim(Number(e.target.value))}
                    className="w-full accent-purple-400 bg-slate-950 cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-slate-400">Intent & Urgency Risk %</label>
                  <span className="font-bold text-amber-400">{newIntent}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={newIntent}
                  onChange={(e) => setNewIntent(Number(e.target.value))}
                  className="w-full accent-amber-400 bg-slate-950 cursor-pointer"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Call Channel Origin</label>
                <select
                  value={newChannel}
                  onChange={(e) => setNewChannel(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:border-cyan-400 focus:outline-none"
                >
                  <option value="Inbound VoIP / Untrusted Gateway">Inbound VoIP / Untrusted Gateway (High Risk)</option>
                  <option value="External Mobile Network">External Mobile Network (Medium Risk)</option>
                  <option value="International PSTN Trunk">International PSTN Trunk (High Risk)</option>
                  <option value="Internal SIP Extension">Internal SIP Extension (Low Risk)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Transaction Exposure (₹ INR)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-500">₹</span>
                  <input
                    type="number"
                    value={newAmount}
                    onChange={(e) => setNewAmount(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-7 pr-3 py-2 text-slate-200 focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold tracking-wider shadow-[0_0_15px_rgba(6,182,212,0.3)] flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>SAVE & ACTIVATE SCENARIO</span>
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}
