import React, { useState, useRef, useEffect } from 'react';
import {
  ShieldAlert, ShieldCheck, AlertTriangle, Sparkles, Mic, Square, Upload,
  Play, Pause, RefreshCw, FileText, PhoneCall, UserCheck, DollarSign,
  Radio, CheckCircle2, ChevronRight, Eye, Code, Zap, AlertCircle, Info,
  Plus, Trash2, X
} from 'lucide-react';
import { safeFetch } from '../services/api';

const DEFAULT_INTENT_SCENARIOS = [
  {
    id: 'intent-1',
    name: '⚠️ Urgent CEO Wire (₹50,000)',
    callerId: '+44 20 7946 0912 (UK VoIP)',
    claimedRole: 'CFO / Chief Financial Officer',
    transactionAmount: '50000',
    callChannel: 'Inbound VoIP / Untrusted Gateway',
    sampleText: 'Hello, this is the CFO calling regarding an emergency vendor payment. We require an immediate wire transfer of ₹50,000 to the updated bank account before 5 PM. Please do not hang up and keep this strictly confidential.'
  },
  {
    id: 'intent-2',
    name: '🚨 IT Helpdesk OTP Solicitation',
    callerId: '+1 (800) 555-0199 (External)',
    claimedRole: 'IT Helpdesk Lead Engineer',
    transactionAmount: '0',
    callChannel: 'External Mobile Network',
    sampleText: 'This is IT Security. We detected unauthorized login attempts on your workstation. Please dictate your 2FA verification code and OTP immediately so we can reset your passcode.'
  },
  {
    id: 'intent-3',
    name: '✅ Authentic Vendor Account Inquiry',
    callerId: '+1 (415) 555-2671 (Internal)',
    claimedRole: 'Accounts Payable Manager',
    transactionAmount: '1200',
    callChannel: 'Internal SIP Extension',
    sampleText: 'Hi Sarah, calling from accounting to double check invoice reference number 4029 for the monthly cloud hosting subscription. Everything looks standard, thanks!'
  }
];

export default function IntentRiskAnalyzer({ API_BASE }) {
  // Input Context State
  const [callerId, setCallerId] = useState('Inbound Caller / Unknown');
  const [claimedRole, setClaimedRole] = useState('Standard Caller');
  const [transactionAmount, setTransactionAmount] = useState('0');
  const [callChannel, setCallChannel] = useState('Inbound VoIP / Untrusted Gateway');

  // Dynamic Scenarios State
  const [presetScenarios, setPresetScenarios] = useState(() => {
    try {
      const saved = localStorage.getItem('voiceguard_intent_scenarios');
      return saved ? JSON.parse(saved) : DEFAULT_INTENT_SCENARIOS;
    } catch (e) {
      return DEFAULT_INTENT_SCENARIOS;
    }
  });

  // Modal State for Adding New Threat Scenario
  const [showAddModal, setShowAddModal] = useState(false);
  const [newScenTitle, setNewScenTitle] = useState('');
  const [newScenCaller, setNewScenCaller] = useState('+91 98765 43210 (VoIP)');
  const [newScenRole, setNewScenRole] = useState('CFO / Chief Financial Officer');
  const [newScenAmount, setNewScenAmount] = useState('150000');
  const [newScenChannel, setNewScenChannel] = useState('Inbound VoIP / Untrusted Gateway');
  const [newScenText, setNewScenText] = useState('Urgent authorization needed for immediate transaction transfer.');

  // Save presets to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('voiceguard_intent_scenarios', JSON.stringify(presetScenarios));
    } catch (e) {}
  }, [presetScenarios]);

  // Audio & Analysis State
  const [selectedFile, setSelectedFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  // Restore persisted intent analysis result from localStorage if available
  const [result, setResult] = useState(() => {
    try {
      const saved = localStorage.getItem('voiceguard_latest_intent_result');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn("Failed to load saved intent analysis result:", e);
    }
    return null;
  });

  const [activeTab, setActiveTab] = useState('insights'); // 'insights' | 'json'

  const persistIntentResult = (data) => {
    try {
      if (!data) {
        localStorage.removeItem('voiceguard_latest_intent_result');
      } else {
        localStorage.setItem('voiceguard_latest_intent_result', JSON.stringify(data));
      }
    } catch (e) {}
  };

  const handleClearIntentResult = () => {
    setResult(null);
    setSelectedFile(null);
    setAudioUrl(null);
    try {
      localStorage.removeItem('voiceguard_latest_intent_result');
    } catch (e) {}
  };

  // Refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioPlayerRef = useRef(null);
  const timerRef = useRef(null);

  const applyPreset = (preset) => {
    setCallerId(preset.callerId);
    setClaimedRole(preset.claimedRole);
    setTransactionAmount(preset.transactionAmount);
    setCallChannel(preset.callChannel);
    setSelectedFile(null);
    setAudioUrl(null);
    setResult(null);
  };

  const handleAddCustomScenario = (e) => {
    e.preventDefault();
    if (!newScenTitle.trim()) return;

    const newObj = {
      id: `intent-${Date.now()}`,
      name: newScenTitle.trim(),
      callerId: newScenCaller,
      claimedRole: newScenRole,
      transactionAmount: newScenAmount,
      callChannel: newScenChannel,
      sampleText: newScenText,
      custom: true
    };

    setPresetScenarios((prev) => [...prev, newObj]);
    applyPreset(newObj);
    setNewScenTitle('');
    setShowAddModal(false);
  };

  const handleDeleteScenario = (id, e) => {
    e.stopPropagation();
    setPresetScenarios((prev) => prev.filter((s) => s.id !== id));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setAudioUrl(URL.createObjectURL(file));
      setResult(null);
      runIntentAnalysis(file);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const file = new File([audioBlob], 'mic_call_capture.wav', { type: 'audio/wav' });
        setSelectedFile(file);
        setAudioUrl(URL.createObjectURL(audioBlob));
        runIntentAnalysis(file);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      alert('Could not access microphone: ' + err.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      }
    }
  };

  const runIntentAnalysis = async (overrideFile = null) => {
    setAnalyzing(true);
    setResult(null);

    const fileToUse = overrideFile || selectedFile;
    const formData = new FormData();
    if (fileToUse) {
      formData.append('audio', fileToUse);
    }
    formData.append('callerId', callerId);
    formData.append('claimedRole', claimedRole);
    formData.append('transactionAmount', transactionAmount);
    formData.append('callChannel', callChannel);

    try {
      const data = await safeFetch(`${API_BASE}/analyze-intent`, {
        method: 'POST',
        body: formData
      });
      if (data.success) {
        const payloadData = data.data || data;
        const intentObj = {
          ...payloadData,
          transcript: payloadData.transcript || data.transcription?.text || data.transcript || '',
          intent: payloadData.intent || data.intent || 'casual_inquiry',
          intent_risk_score: payloadData.intent_risk_score ?? data.social_engineering?.score ?? data.social_engineering_risk ?? 0,
          social_engineering_risk: payloadData.social_engineering_risk ?? data.social_engineering?.score ?? data.social_engineering_risk ?? 0,
          transaction_risk: payloadData.transaction_risk ?? data.transaction?.risk_score ?? data.transaction_risk ?? 0,
          risk_category: payloadData.risk_category || data.overall_risk?.level || data.risk_level || 'LOW',
          risk_level: payloadData.risk_level || data.overall_risk?.level || data.risk_level || 'LOW',
          flagged_keywords: payloadData.flagged_keywords || data.social_engineering?.indicators || data.flagged_keywords || [],
          detected_intents: payloadData.detected_intents || data.social_engineering?.detected_intents || [],
          timestamped_segments: payloadData.timestamped_segments || data.transcription?.segments || [],
          caller_context: payloadData.caller_context || {
            callerId: callerId,
            claimedRole: claimedRole,
            transactionAmount: Number(transactionAmount),
            callChannel: callChannel
          }
        };

        setResult(intentObj);
        persistIntentResult(intentObj);

        // Auto-Fill Metadata Form Inputs directly from Audio Intelligence
        if (intentObj.caller_context) {
          if (intentObj.caller_context.claimedRole) setClaimedRole(intentObj.caller_context.claimedRole);
          if (intentObj.caller_context.transactionAmount !== undefined) setTransactionAmount(String(intentObj.caller_context.transactionAmount));
          if (intentObj.caller_context.callChannel) setCallChannel(intentObj.caller_context.callChannel);
          if (intentObj.caller_context.callerId) setCallerId(intentObj.caller_context.callerId);
        }
      } else {
        alert('Intent Analysis Failed: ' + (data.error || 'Unable to process audio input.'));
      }
    } catch (err) {
      alert('Network Error during intent analysis: ' + err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  // Helper function to render text with highlighted keywords
  const renderHighlightedTranscript = (transcript, keywords = []) => {
    if (!keywords || keywords.length === 0) return transcript;

    // Build regex pattern matching any keyword case-insensitively
    const escapedKws = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`(${escapedKws.join('|')})`, 'gi');

    const parts = transcript.split(pattern);

    return parts.map((part, i) => {
      const isMatched = keywords.some((kw) => kw.toLowerCase() === part.toLowerCase());
      if (isMatched) {
        return (
          <mark
            key={i}
            className="bg-rose-500/20 text-rose-300 font-bold px-1.5 py-0.5 rounded border border-rose-500/40 shadow-[0_0_10px_rgba(244,63,94,0.3)] inline-block my-0.5"
          >
            {part}
          </mark>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header Card */}
      <div className="cyber-panel p-6 backdrop-blur-xl bg-slate-900/70 border border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div>
            <div className="flex items-center gap-2.5">
              <ShieldAlert className="w-6 h-6 text-cyan-400" />
              <h2 className="text-xl font-bold tracking-tight text-white">
                Speech-to-Text, Social Engineering & Transaction Risk Engine
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Automatic Speech Recognition (ASR), zero-shot intent extraction, caller context anomaly detection, and real-time transaction risk scoring.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 text-xs font-mono font-bold rounded-lg bg-cyan-950 text-cyan-400 border border-cyan-800">
              WHISPER ASR ENGINE
            </span>
            <span className="px-3 py-1 text-xs font-mono font-bold rounded-lg bg-purple-950 text-purple-400 border border-purple-800">
              ZERO-SHOT NLP RISK v2.4
            </span>
          </div>
        </div>

        {/* Dynamic Preset Scenarios Bar with Add Custom Scenario Option */}
        <div className="pt-4">
          <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-2">
            LOAD DEMO THREAT SCENARIOS:
          </span>
          <div className="flex flex-wrap gap-2">
            {presetScenarios.map((sc, idx) => (
              <button
                key={sc.id || idx}
                onClick={() => applyPreset(sc)}
                className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-850 text-xs font-mono text-slate-300 border border-slate-800 hover:border-cyan-500/50 transition-all flex items-center gap-1.5"
              >
                <span>{sc.name}</span>
                {sc.custom && (
                  <span
                    onClick={(e) => handleDeleteScenario(sc.id, e)}
                    className="p-0.5 hover:text-white hover:bg-slate-800 rounded transition-all"
                    title="Delete Custom Scenario"
                  >
                    <Trash2 className="w-3 h-3 text-rose-400" />
                  </span>
                )}
              </button>
            ))}

            <button
              onClick={() => setShowAddModal(true)}
              className="px-3 py-1.5 rounded-xl bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/80 transition-all flex items-center gap-1.5 font-bold shadow-[0_0_10px_rgba(6,182,212,0.2)] text-xs font-mono"
            >
              <Plus className="w-3.5 h-3.5 text-cyan-400" />
              <span>+ Add Custom Scenario</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Input Context Form & Audio Control (5 Cols) vs Results (7 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Context Parameters & Audio Source (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Caller Context Ingestion Form */}
          <div className="cyber-panel p-6 backdrop-blur-xl bg-slate-900/70 border border-slate-800 space-y-4">
            <h3 className="text-xs font-bold text-slate-200 font-mono uppercase tracking-widest flex items-center gap-2">
              <PhoneCall className="w-4 h-4 text-cyan-400" />
              CALLER & CONTEXT METADATA INGESTION
            </h3>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Caller ID / Phone / SIP Origin</label>
                <input
                  type="text"
                  value={callerId}
                  onChange={(e) => setCallerId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:border-cyan-400 focus:outline-none"
                  placeholder="+1 (555) 019-2834"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Claimed Role / Identity</label>
                <select
                  value={claimedRole}
                  onChange={(e) => setClaimedRole(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:border-cyan-400 focus:outline-none"
                >
                  <option value="CFO / Chief Financial Officer">CFO / Chief Financial Officer</option>
                  <option value="CEO / Chief Executive Officer">CEO / Chief Executive Officer</option>
                  <option value="IT Helpdesk Lead Engineer">IT Helpdesk Lead Engineer</option>
                  <option value="Law Enforcement / Federal Agent">Law Enforcement / Federal Agent</option>
                  <option value="Accounts Payable Manager">Accounts Payable Manager</option>
                  <option value="External Third-Party Vendor">External Third-Party Vendor</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Transaction Amount (₹ INR)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-500">₹</span>
                  <input
                    type="number"
                    value={transactionAmount}
                    onChange={(e) => setTransactionAmount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-7 pr-3 py-2 text-slate-200 focus:border-cyan-400 focus:outline-none"
                    placeholder="50000"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Call Channel Origin</label>
                <select
                  value={callChannel}
                  onChange={(e) => setCallChannel(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:border-cyan-400 focus:outline-none"
                >
                  <option value="Inbound VoIP / Untrusted Gateway">Inbound VoIP / Untrusted Gateway</option>
                  <option value="External Mobile Cellular">External Mobile Cellular</option>
                  <option value="International PSTN Gateway">International PSTN Gateway</option>
                  <option value="Internal SIP Extension">Internal SIP Extension</option>
                </select>
              </div>
            </div>
          </div>

          {/* Audio Input Box & Capture Controls */}
          <div className="cyber-panel p-6 backdrop-blur-xl bg-slate-900/70 border border-slate-800 space-y-4">
            <h3 className="text-xs font-bold text-slate-200 font-mono uppercase tracking-widest flex items-center gap-2">
              <Radio className="w-4 h-4 text-cyan-400" />
              AUDIO STREAM / RECORDING SELECTION
            </h3>

            <div className="space-y-3">
              <label className="w-full cursor-pointer flex items-center justify-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed border-slate-800 hover:border-cyan-400 bg-slate-950 hover:bg-slate-900 transition-all group">
                <Upload className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-mono text-slate-300 truncate max-w-xs">
                  {selectedFile ? selectedFile.name : 'Upload Call Recording (WAV, MP3)'}
                </span>
                <input type="file" accept="audio/*" onChange={handleFileChange} className="hidden" />
              </label>

              <div className="flex items-center gap-3">
                {!isRecording ? (
                  <button
                    onClick={startRecording}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-950/80 border border-rose-800/80 text-rose-300 text-xs font-mono font-bold hover:bg-rose-900 transition-all"
                  >
                    <Mic className="w-3.5 h-3.5 animate-pulse" />
                    <span>Record Call Mic</span>
                  </button>
                ) : (
                  <button
                    onClick={stopRecording}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-900 border border-rose-500 text-rose-400 text-xs font-mono font-bold hover:bg-rose-950 transition-all"
                  >
                    <Square className="w-3.5 h-3.5 fill-rose-500" />
                    <span>Stop Recording ({recordingTime}s)</span>
                  </button>
                )}

                {audioUrl && (
                  <button
                    onClick={() => {
                      if (!audioPlayerRef.current) return;
                      if (isPlaying) {
                        audioPlayerRef.current.pause();
                        setIsPlaying(false);
                      } else {
                        audioPlayerRef.current.play();
                        setIsPlaying(true);
                      }
                    }}
                    className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-slate-200 hover:border-cyan-400 transition-all"
                  >
                    {isPlaying ? <Pause className="w-3.5 h-3.5 text-amber-400" /> : <Play className="w-3.5 h-3.5 text-cyan-400" />}
                  </button>
                )}
                {audioUrl && <audio ref={audioPlayerRef} src={audioUrl} onEnded={() => setIsPlaying(false)} className="hidden" />}
              </div>

              {/* Execute Analysis Action Button */}
              <button
                onClick={runIntentAnalysis}
                disabled={analyzing}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-mono font-bold text-xs tracking-wider shadow-[0_0_20px_rgba(6,182,212,0.35)] transition-all disabled:opacity-50"
              >
                {analyzing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>{analyzing ? 'ANALYZING SPEECH & RISK...' : 'RUN INTENT & TRANSACTION RISK ENGINE'}</span>
              </button>
            </div>
          </div>

        </div>

        {/* Right Column: Analysis Results & Intent Breakdown (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          
          {result ? (
            <div className="space-y-6">
              
              {/* Risk Badge Header Card */}
              <div className="cyber-panel p-6 backdrop-blur-xl bg-slate-900/70 border border-slate-800 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 block">
                      TRANSACTION INTENT RISK SCORE
                    </span>
                    <div className="flex items-center gap-3 mt-1">
                      <span
                        className={`text-3xl font-black font-mono tracking-tight ${
                          result.risk_category === 'CRITICAL' || result.risk_category === 'HIGH'
                            ? 'text-rose-400'
                            : result.risk_category === 'MEDIUM'
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {result.intent_risk_score}%
                      </span>

                      <span
                        className={`px-3 py-1 text-xs font-mono font-bold rounded-lg border uppercase tracking-wider ${
                          result.risk_category === 'CRITICAL'
                            ? 'bg-rose-950/80 text-rose-300 border-rose-700 shadow-[0_0_15px_rgba(244,63,94,0.4)]'
                            : result.risk_category === 'HIGH'
                            ? 'bg-rose-900/60 text-rose-300 border-rose-800'
                            : result.risk_category === 'MEDIUM'
                            ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                            : 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                        }`}
                      >
                        {result.risk_category} RISK
                      </span>
                    </div>
                  </div>

                  {/* Tab switch & Clear button */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 font-mono text-xs">
                      <button
                        onClick={() => setActiveTab('insights')}
                        className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                          activeTab === 'insights' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400'
                        }`}
                      >
                        Security Insights
                      </button>
                      <button
                        onClick={() => setActiveTab('json')}
                        className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                          activeTab === 'json' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400'
                        }`}
                      >
                        JSON Payload
                      </button>
                    </div>

                    <button
                      onClick={handleClearIntentResult}
                      title="Clear intent analysis result"
                      className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-rose-700 text-xs font-mono text-rose-400 font-bold flex items-center gap-1 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear</span>
                    </button>
                  </div>
                </div>

                {/* Progress Bar Meter */}
                <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden p-0.5 border border-slate-800">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${
                      result.intent_risk_score >= 75
                        ? 'bg-gradient-to-r from-amber-500 to-rose-500 shadow-[0_0_15px_#f43f5e]'
                        : result.intent_risk_score >= 40
                        ? 'bg-gradient-to-r from-cyan-500 to-amber-500'
                        : 'bg-gradient-to-r from-emerald-500 to-cyan-500'
                    }`}
                    style={{ width: `${result.intent_risk_score}%` }}
                  ></div>
                </div>

                {/* Caller Context Anomaly Warning Banner */}
                {result.caller_context?.originAnomalyDetected && (
                  <div className="flex items-start gap-3 bg-rose-950/40 border border-rose-800/80 p-4 rounded-xl text-xs font-mono text-rose-300">
                    <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block uppercase tracking-wider">CALLER ORIGIN ANOMALY FLAG</span>
                      <p className="text-rose-200/90 font-sans mt-0.5">
                        {result.caller_context.anomalyDetails}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {activeTab === 'insights' ? (
                <div className="space-y-6">
                  
                  {/* Timestamped Live Transcript Card with Highlighted Keywords */}
                  <div className="cyber-panel p-6 backdrop-blur-xl bg-slate-900/70 border border-slate-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-slate-200 font-mono uppercase tracking-widest flex items-center gap-2">
                        <FileText className="w-4 h-4 text-cyan-400" />
                        SPEECH-TO-TEXT TRANSCRIPT & RISK HIGHLIGHTS
                      </h3>
                      <span className="text-[11px] font-mono text-slate-400">
                        {result.flagged_keywords?.length || 0} Keywords Flagged
                      </span>
                    </div>

                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs font-sans leading-relaxed text-slate-200 space-y-3">
                      <p className="text-sm">
                        {renderHighlightedTranscript(result.transcript, result.flagged_keywords)}
                      </p>
                    </div>

                    {/* Timestamped Segments */}
                    {result.timestamped_segments && (
                      <div className="space-y-2 pt-2 border-t border-slate-800">
                        <span className="text-[10px] font-mono text-slate-400 uppercase">TIMESTAMPED AUDIO SEGMENTS</span>
                        <div className="space-y-1.5 font-mono text-xs">
                          {result.timestamped_segments.map((seg) => (
                            <div
                              key={seg.id}
                              className="flex items-start gap-3 bg-slate-950/60 p-2.5 rounded-lg border border-slate-850"
                            >
                              <span className="text-cyan-400 font-bold shrink-0 text-[11px] px-2 py-0.5 bg-slate-900 rounded border border-slate-800">
                                [{seg.start}s - {seg.end}s]
                              </span>
                              <span className="text-slate-300 font-sans text-xs">
                                {renderHighlightedTranscript(seg.text, result.flagged_keywords)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Detected Social Engineering Intents Cards */}
                  <div className="cyber-panel p-6 backdrop-blur-xl bg-slate-900/70 border border-slate-800 space-y-4">
                    <h3 className="text-xs font-bold text-slate-200 font-mono uppercase tracking-widest flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-amber-400" />
                      DETECTED SOCIAL ENGINEERING INTENTS
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
                      {result.detected_intents?.map((intent, idx) => (
                        <div
                          key={idx}
                          className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-start gap-3"
                        >
                          <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 shrink-0">
                            <Zap className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-bold text-slate-200 block text-xs">{intent}</span>
                            <span className="text-[10px] text-slate-400 block mt-0.5">Threat Category Matched</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Transaction Risk Evaluation Card */}
                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                      <span className="text-[10px] font-mono text-slate-400 uppercase block">TRANSACTION RISK ASSESSMENT</span>
                      <div className="flex items-center justify-between">
                        {Number(result.caller_context?.transactionAmount) > 0 ? (
                          <div className="flex items-center gap-2 text-rose-400 font-mono font-bold text-sm">
                            <DollarSign className="w-4 h-4 text-rose-400" />
                            <span>Transaction Risk Detected: ₹{Number(result.caller_context.transactionAmount).toLocaleString()}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-emerald-400 font-mono font-bold text-sm">
                            <ShieldCheck className="w-4 h-4 text-emerald-400" />
                            <span>Transaction Risk: NOT DETECTED</span>
                          </div>
                        )}
                        <span className={`px-2.5 py-1 text-[10px] font-mono font-bold rounded border ${Number(result.caller_context?.transactionAmount) > 0 ? 'bg-rose-950 text-rose-300 border-rose-800' : 'bg-emerald-950 text-emerald-300 border-emerald-800'}`}>
                          {Number(result.caller_context?.transactionAmount) > 0 ? 'FINANCIAL RISK PRESENT' : 'NO TRANSACTION MENTIONED'}
                        </span>
                      </div>
                    </div>

                    {/* Flagged Keywords Chips */}
                    <div className="pt-2">
                      <span className="text-[10px] font-mono text-slate-400 uppercase block mb-2">FLAGGED TRIGGER KEYWORDS:</span>
                      <div className="flex flex-wrap gap-2">
                        {result.flagged_keywords?.map((kw, i) => (
                          <span
                            key={i}
                            className="px-2.5 py-1 text-xs font-mono font-semibold rounded-md bg-rose-950/80 text-rose-300 border border-rose-800/80"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                </div>
              ) : (
                /* JSON Payload Tab */
                <div className="cyber-panel p-6 backdrop-blur-xl bg-slate-900/70 border border-slate-800">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-mono font-bold text-slate-300">API DELIVERABLE JSON SCHEMA</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(JSON.stringify(result, null, 2))}
                      className="text-xs font-mono text-cyan-400 hover:underline"
                    >
                      Copy JSON
                    </button>
                  </div>
                  <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs font-mono text-cyan-300 overflow-x-auto max-h-96">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </div>
              )}

            </div>
          ) : (
            <div className="cyber-panel p-12 text-center backdrop-blur-xl bg-slate-900/40 border border-slate-800/80 space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center mx-auto text-slate-600">
                <ShieldCheck className="w-8 h-8 text-cyan-500/50" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-300 font-mono">Awaiting Conversation Data</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                  Configure caller parameters on the left or select a demo threat scenario, then click "RUN INTENT & TRANSACTION RISK ENGINE".
                </p>
              </div>
            </div>
          )}

        </div>

      </div>

      {/* Modal Dialog: Create Custom Intent Threat Scenario */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="cyber-panel p-6 max-w-lg w-full bg-slate-900 border border-slate-800 space-y-5 relative">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                  CREATE CUSTOM INTENT THREAT SCENARIO
                </h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white font-mono text-xs p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddCustomScenario} className="space-y-4 font-mono text-xs">
              
              <div>
                <label className="text-slate-400 block mb-1">Scenario Title / Name</label>
                <input
                  type="text"
                  required
                  value={newScenTitle}
                  onChange={(e) => setNewScenTitle(e.target.value)}
                  placeholder="🔥 Urgent Executive Wire (₹1.5L)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Caller ID / Phone / Origin</label>
                <input
                  type="text"
                  required
                  value={newScenCaller}
                  onChange={(e) => setNewScenCaller(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Claimed Role / Identity</label>
                  <select
                    value={newScenRole}
                    onChange={(e) => setNewScenRole(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:border-cyan-400 focus:outline-none"
                  >
                    <option value="CFO / Chief Financial Officer">CFO / Chief Financial Officer</option>
                    <option value="CEO / Chief Executive Officer">CEO / Chief Executive Officer</option>
                    <option value="IT Helpdesk Lead Engineer">IT Helpdesk Lead Engineer</option>
                    <option value="Law Enforcement / Federal Agent">Law Enforcement / Federal Agent</option>
                    <option value="Accounts Payable Manager">Accounts Payable Manager</option>
                    <option value="External Third-Party Vendor">External Third-Party Vendor</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Transaction Amount (₹ INR)</label>
                  <input
                    type="number"
                    value={newScenAmount}
                    onChange={(e) => setNewScenAmount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Call Channel Origin</label>
                <select
                  value={newScenChannel}
                  onChange={(e) => setNewScenChannel(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:border-cyan-400 focus:outline-none"
                >
                  <option value="Inbound VoIP / Untrusted Gateway">Inbound VoIP / Untrusted Gateway</option>
                  <option value="External Mobile Cellular">External Mobile Cellular</option>
                  <option value="International PSTN Gateway">International PSTN Gateway</option>
                  <option value="Internal SIP Extension">Internal SIP Extension</option>
                </select>
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
                  <span>SAVE & APPLY SCENARIO</span>
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}
