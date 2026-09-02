import React, { useState, useEffect, useRef } from 'react';
import {
  Users, UserPlus, ShieldCheck, ShieldAlert, AlertTriangle, Mic, Square, Upload,
  Play, Pause, RefreshCw, CheckCircle2, Search, UserCheck, Key, Cpu, Sparkles, Activity
} from 'lucide-react';
import { safeFetch } from '../services/api';

export default function SpeakerDirectory({ API_BASE }) {
  const [speakers, setSpeakers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Enrollment Form State
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [enrollId, setEnrollId] = useState('');
  const [enrollName, setEnrollName] = useState('');
  const [enrollRole, setEnrollRole] = useState('');
  const [enrollDept, setEnrollDept] = useState('Executive Leadership');
  const [enrollFile, setEnrollFile] = useState(null);
  const [enrollAudioUrl, setEnrollAudioUrl] = useState(null);
  const [isRecordingEnroll, setIsRecordingEnroll] = useState(false);
  const [enrollRecTime, setEnrollRecTime] = useState(0);
  const [enrolling, setEnrolling] = useState(false);

  // Direct Verification Workbench State
  const [verifySpeakerId, setVerifySpeakerId] = useState('');
  const [verifyFile, setVerifyFile] = useState(null);
  const [verifyAudioUrl, setVerifyAudioUrl] = useState(null);
  const [isRecordingVerify, setIsRecordingVerify] = useState(false);
  const [verifyRecTime, setVerifyRecTime] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);

  // Refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  const fetchSpeakers = async () => {
    setLoading(true);
    try {
      const data = await safeFetch(`${API_BASE}/speakers`);
      if (data.success) {
        setSpeakers(data.speakers);
        if (data.speakers.length > 0 && !verifySpeakerId) {
          setVerifySpeakerId(data.speakers[0].speaker_id);
        }
      }
    } catch (err) {
      console.error('Failed to load speakers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSpeakers();
  }, []);

  const handleEnrollSubmit = async (e) => {
    e.preventDefault();
    if (!enrollId || !enrollName || !enrollRole) {
      alert('Please fill out User ID, Full Name, and Role/Designation.');
      return;
    }

    setEnrolling(true);
    const formData = new FormData();
    formData.append('speakerId', enrollId);
    formData.append('name', enrollName);
    formData.append('role', enrollRole);
    formData.append('department', enrollDept);
    if (enrollFile) {
      formData.append('audio', enrollFile);
    }

    try {
      const data = await safeFetch(`${API_BASE}/speakers/enroll`, {
        method: 'POST',
        body: formData
      });
      if (data.success) {
        alert(`Speaker ${enrollName} enrolled successfully!`);
        setShowEnrollModal(false);
        setEnrollId('');
        setEnrollName('');
        setEnrollRole('');
        setEnrollFile(null);
        setEnrollAudioUrl(null);
        fetchSpeakers();
      } else {
        alert('Enrollment error: ' + data.error);
      }
    } catch (err) {
      alert('Network error during enrollment: ' + err.message);
    } finally {
      setEnrolling(false);
    }
  };

  const startEnrollRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const file = new File([audioBlob], 'enroll_voiceprint.wav', { type: 'audio/wav' });
        setEnrollFile(file);
        setEnrollAudioUrl(URL.createObjectURL(audioBlob));
      };

      mediaRecorderRef.current.start();
      setIsRecordingEnroll(true);
      setEnrollRecTime(0);

      timerRef.current = setInterval(() => {
        setEnrollRecTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      alert('Microphone access denied: ' + err.message);
    }
  };

  const stopEnrollRecording = () => {
    if (mediaRecorderRef.current && isRecordingEnroll) {
      mediaRecorderRef.current.stop();
      setIsRecordingEnroll(false);
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      }
    }
  };

  const runSpeakerVerification = async () => {
    if (!verifySpeakerId) {
      alert('Please select an enrolled speaker identity to verify against.');
      return;
    }

    setVerifying(true);
    setVerifyResult(null);

    const formData = new FormData();
    formData.append('speakerId', verifySpeakerId);
    if (verifyFile) {
      formData.append('audio', verifyFile);
    }

    try {
      const data = await safeFetch(`${API_BASE}/speakers/verify`, {
        method: 'POST',
        body: formData
      });
      if (data.success) {
        setVerifyResult(data.data);
      } else {
        alert('Verification error: ' + data.error);
      }
    } catch (err) {
      alert('Network error during verification: ' + err.message);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Cyberpunk SOC Header */}
      <div className="cyber-panel p-6 backdrop-blur-xl bg-slate-900/70 border border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div>
            <div className="flex items-center gap-2.5">
              <Users className="w-6 h-6 text-cyan-400" />
              <h2 className="text-xl font-bold tracking-tight text-white">
                Trusted Speaker Directory & Biometric Voiceprint Registry
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Store 192-dim normalized ECAPA-TDNN voiceprint embeddings in SQLite to verify caller identities and stop speaker impersonation.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowEnrollModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-mono font-bold tracking-wider shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all"
            >
              <UserPlus className="w-4 h-4" />
              <span>ENROLL NEW SPEAKER</span>
            </button>

            <button
              onClick={fetchSpeakers}
              className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-cyan-400 transition-colors"
              title="Refresh Directory"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Directory Stats Bar */}
        <div className="pt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-xs">
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center">
            <span className="text-slate-400">Enrolled Speakers</span>
            <span className="font-bold text-cyan-400 text-sm">{speakers.length} Profiles</span>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center">
            <span className="text-slate-400">Biometric Model</span>
            <span className="font-bold text-purple-300 text-xs">ECAPA-TDNN</span>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center">
            <span className="text-slate-400">Embedding Space</span>
            <span className="font-bold text-slate-200 text-xs">192-Dim Normalized</span>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center">
            <span className="text-slate-400">Store Engine</span>
            <span className="font-bold text-emerald-400 text-xs">SQLite Persistent</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Enrolled Directory (7 Cols) vs Direct Biometric Verifier (5 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Speaker Directory Cards Grid (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between font-mono">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-cyan-400" />
              AUTHORIZED SPEAKER PROFILES ({speakers.length})
            </h3>
            <span className="text-[11px] text-slate-400">Active Biometric Voiceprints</span>
          </div>

          {speakers.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {speakers.map((spk) => (
                <div
                  key={spk.speaker_id}
                  className="cyber-panel p-5 backdrop-blur-xl bg-slate-900/70 border border-slate-800 hover:border-cyan-500/40 transition-all flex flex-col justify-between space-y-4 group"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-indigo-500/20 border border-cyan-500/30 flex items-center justify-center font-mono font-bold text-cyan-300 shrink-0">
                      {spk.name.substring(0, 2).toUpperCase()}
                    </div>

                    <div className="overflow-hidden">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-white truncate">{spk.name}</span>
                        <span className="px-1.5 py-0.2 text-[9px] font-mono font-bold rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                          {spk.speaker_id}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 font-sans truncate">{spk.role}</p>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">{spk.department}</p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between font-mono text-[10px] text-slate-400">
                    <span className="flex items-center gap-1 text-emerald-400">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      TRUSTED VOICEPRINT
                    </span>
                    <button
                      onClick={() => setVerifySpeakerId(spk.speaker_id)}
                      className="text-cyan-400 hover:underline font-bold"
                    >
                      Test Verification &rarr;
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="cyber-panel p-12 text-center backdrop-blur-xl bg-slate-900/40 border border-slate-800 space-y-3">
              <Users className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-xs font-mono text-slate-400">No enrolled speaker profiles found. Click "ENROLL NEW SPEAKER" to create one.</p>
            </div>
          )}
        </div>

        {/* Right Column: Interactive Verification Tester Workbench (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          <div className="cyber-panel p-6 backdrop-blur-xl bg-slate-900/70 border border-slate-800 space-y-4">
            <h3 className="text-xs font-bold text-slate-200 font-mono uppercase tracking-widest flex items-center gap-2">
              <Activity className="w-4 h-4 text-purple-400" />
              BIOMETRIC COSINE SIMILARITY TESTER
            </h3>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Target Claimed Speaker Identity</label>
                <select
                  value={verifySpeakerId}
                  onChange={(e) => setVerifySpeakerId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:border-cyan-400 focus:outline-none"
                >
                  {speakers.map((s) => (
                    <option key={s.speaker_id} value={s.speaker_id}>
                      {s.name} ({s.speaker_id} - {s.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Audio Sample for Verification</label>
                <label className="w-full cursor-pointer flex items-center justify-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed border-slate-800 hover:border-cyan-400 bg-slate-950 hover:bg-slate-900 transition-all group">
                  <Upload className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-mono text-slate-300 truncate max-w-xs">
                    {verifyFile ? verifyFile.name : 'Upload Target Audio Clip (WAV)'}
                  </span>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(e) => {
                      if (e.target.files[0]) {
                        setVerifyFile(e.target.files[0]);
                        setVerifyAudioUrl(URL.createObjectURL(e.target.files[0]));
                      }
                    }}
                    className="hidden"
                  />
                </label>
              </div>

              <button
                onClick={runSpeakerVerification}
                disabled={verifying}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-mono font-bold text-xs tracking-wider shadow-[0_0_20px_rgba(168,85,247,0.3)] transition-all disabled:opacity-50"
              >
                {verifying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                <span>{verifying ? 'EXTRACTING BIOMETRICS...' : 'VERIFY SPEAKER IDENTITY'}</span>
              </button>
            </div>

            {/* Verification Result Card */}
            {verifyResult && (
              <div className="pt-4 border-t border-slate-800 space-y-4">
                <div className="flex items-center justify-between font-mono">
                  <span className="text-[10px] text-slate-400 uppercase">COSINE SIMILARITY MATCH RESULT</span>
                  <span className="text-xs font-bold text-cyan-400">{verifyResult.match_percentage}% Match Score</span>
                </div>

                {/* Progress Bar Meter */}
                <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden p-0.5 border border-slate-800">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${
                      verifyResult.severity === 'success'
                        ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 shadow-[0_0_15px_#10b981]'
                        : verifyResult.severity === 'warning'
                        ? 'bg-gradient-to-r from-cyan-500 to-amber-500'
                        : 'bg-gradient-to-r from-amber-500 to-rose-500 shadow-[0_0_15px_#f43f5e]'
                    }`}
                    style={{ width: `${verifyResult.match_percentage}%` }}
                  ></div>
                </div>

                {/* Status Badge per user requirements:
                    - Similarity >= 0.75: "Identity Verified (Match)"
                    - Similarity between 0.50 and 0.74: "Uncertain Identity Match"
                    - Similarity < 0.50: "Impersonation / Speaker Mismatch"
                */}
                <div
                  className={`p-4 rounded-xl border font-mono text-xs flex items-center gap-3 ${
                    verifyResult.severity === 'success'
                      ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                      : verifyResult.severity === 'warning'
                      ? 'bg-amber-950/40 border-amber-800 text-amber-300'
                      : 'bg-rose-950/40 border-rose-800 text-rose-300'
                  }`}
                >
                  {verifyResult.severity === 'success' && <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0" />}
                  {verifyResult.severity === 'warning' && <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0" />}
                  {verifyResult.severity === 'danger' && <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0" />}

                  <div>
                    <span className="font-bold block text-sm">{verifyResult.status_text}</span>
                    <span className="text-[11px] block mt-0.5 text-slate-300 font-sans">
                      Claimed: {verifyResult.claimed_speaker?.name} ({verifyResult.claimed_speaker?.speaker_id})
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Speaker Enrollment Modal / Drawer */}
      {showEnrollModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="cyber-panel p-6 max-w-lg w-full bg-slate-900 border border-slate-800 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-cyan-400" />
                ENROLL AUTHORIZED SPEAKER PROFILE
              </h3>
              <button
                onClick={() => setShowEnrollModal(false)}
                className="text-slate-400 hover:text-white font-mono text-xs p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEnrollSubmit} className="space-y-4 font-mono text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">User ID / Badge #</label>
                  <input
                    type="text"
                    required
                    value={enrollId}
                    onChange={(e) => setEnrollId(e.target.value)}
                    placeholder="USR-105"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={enrollName}
                    onChange={(e) => setEnrollName(e.target.value)}
                    placeholder="Marcus Vance"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Role / Designation</label>
                  <input
                    type="text"
                    required
                    value={enrollRole}
                    onChange={(e) => setEnrollRole(e.target.value)}
                    placeholder="VP of Enterprise Risk"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Department</label>
                  <select
                    value={enrollDept}
                    onChange={(e) => setEnrollDept(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:border-cyan-400 focus:outline-none"
                  >
                    <option value="Executive Leadership">Executive Leadership</option>
                    <option value="Finance & Accounting">Finance & Accounting</option>
                    <option value="Information Technology">Information Technology</option>
                    <option value="Cybersecurity SOC">Cybersecurity SOC</option>
                    <option value="Legal & Compliance">Legal & Compliance</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Enrollment Reference Voice Sample</label>
                <div className="flex items-center gap-3">
                  <label className="flex-1 cursor-pointer flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-slate-700 hover:border-cyan-400 bg-slate-950 text-slate-300">
                    <Upload className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="truncate max-w-[180px]">
                      {enrollFile ? enrollFile.name : 'Upload Voice Sample (WAV)'}
                    </span>
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={(e) => {
                        if (e.target.files[0]) {
                          setEnrollFile(e.target.files[0]);
                          setEnrollAudioUrl(URL.createObjectURL(e.target.files[0]));
                        }
                      }}
                      className="hidden"
                    />
                  </label>

                  {!isRecordingEnroll ? (
                    <button
                      type="button"
                      onClick={startEnrollRecording}
                      className="px-3 py-2.5 rounded-xl bg-rose-950 border border-rose-800 text-rose-300 font-bold flex items-center gap-1.5"
                    >
                      <Mic className="w-3.5 h-3.5 animate-pulse" />
                      <span>Record Mic</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopEnrollRecording}
                      className="px-3 py-2.5 rounded-xl bg-slate-900 border border-rose-500 text-rose-400 font-bold flex items-center gap-1.5"
                    >
                      <Square className="w-3.5 h-3.5 fill-rose-500" />
                      <span>Stop ({enrollRecTime}s)</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEnrollModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={enrolling}
                  className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold tracking-wider shadow-[0_0_15px_rgba(6,182,212,0.3)] disabled:opacity-50"
                >
                  {enrolling ? 'Enrolling Voiceprint...' : 'SAVE & ENROLL'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
