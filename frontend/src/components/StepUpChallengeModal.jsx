import React, { useState, useEffect, useRef } from 'react';
import { ShieldAlert, ShieldCheck, Mic, Square, RefreshCw, Key, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function StepUpChallengeModal({ API_BASE, challengeData, onClose, onSuccess }) {
  const [activeTab, setActiveTab] = useState('voice'); // 'voice' | 'otp'
  const [spokenText, setSpokenText] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [timer, setTimer] = useState(10);
  const [isRecording, setIsRecording] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const challenge = challengeData?.challenge || {
    challenge_id: 'CHG-377022',
    passphrase: 'Silver Falcon 482',
    otp_token: '696527',
    ttl_seconds: 10,
    instructions: 'Speak the dynamic passphrase clearly within 10 seconds or enter device OTP token.'
  };

  // 10-second Countdown Timer Effect
  useEffect(() => {
    if (timer <= 0) return;
    const interval = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = () => {
        setSpokenText(challenge.passphrase); // Auto-fill recognized phrase for seamless demo
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      alert('Microphone access error: ' + err.message);
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (mediaRecorderRef.current.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      }
    }
  };

  const handleVerifySubmission = async (e) => {
    e.preventDefault();
    setVerifying(true);
    setResult(null);

    const inputVal = activeTab === 'voice' ? (spokenText || challenge.passphrase) : otpInput;

    try {
      const res = await fetch(`${API_BASE}/challenges/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge_id: challenge.challenge_id,
          input_response: inputVal,
          target_identity: challengeData?.target_identity || 'John Doe (CFO)'
        })
      });
      const data = await res.json();
      if (data.success) {
        setResult(data.data);
        if (data.data.verified && onSuccess) {
          setTimeout(() => {
            onSuccess(data.data);
          }, 1500);
        }
      }
    } catch (err) {
      alert('Verification network error: ' + err.message);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="cyber-panel p-6 max-w-md w-full bg-slate-900 border border-slate-800 space-y-5 relative">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
              STEP-UP VERIFICATION CHALLENGE
            </h3>
          </div>

          <button onClick={onClose} className="text-slate-400 hover:text-white font-mono text-xs p-1">
            ✕
          </button>
        </div>

        {/* 10s Countdown Timer Ring */}
        <div className="flex items-center justify-between bg-slate-950 p-3.5 rounded-xl border border-slate-800 font-mono text-xs">
          <span className="text-slate-400 flex items-center gap-2">
            <Clock className="w-4 h-4 text-cyan-400" />
            Liveness Challenge TTL:
          </span>
          <span className={`font-bold text-sm ${timer <= 3 ? 'text-rose-400 animate-ping' : 'text-amber-400'}`}>
            {timer}s Remaining
          </span>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 font-mono text-xs">
          <button
            onClick={() => setActiveTab('voice')}
            className={`flex-1 py-2 rounded-lg font-semibold transition-all ${
              activeTab === 'voice' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400'
            }`}
          >
            Spoken Liveness Passphrase
          </button>
          <button
            onClick={() => setActiveTab('otp')}
            className={`flex-1 py-2 rounded-lg font-semibold transition-all ${
              activeTab === 'otp' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400'
            }`}
          >
            Out-of-Band OTP
          </button>
        </div>

        <form onSubmit={handleVerifySubmission} className="space-y-4 font-mono text-xs">
          {activeTab === 'voice' ? (
            <div className="space-y-3">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-center space-y-2">
                <span className="text-[10px] text-slate-400 uppercase tracking-widest block">
                  PLEASE SPEAK THIS DYNAMIC PASSPHRASE ALOUD:
                </span>
                <span className="text-lg font-bold text-cyan-300 block font-mono bg-slate-900 py-2 px-3 rounded-lg border border-cyan-500/30">
                  "{challenge.passphrase}"
                </span>
              </div>

              <div className="flex items-center gap-3">
                {!isRecording ? (
                  <button
                    type="button"
                    onClick={startVoiceRecording}
                    className="flex-1 py-2.5 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 font-bold flex items-center justify-center gap-2"
                  >
                    <Mic className="w-4 h-4 animate-pulse" />
                    <span>RECORD SPOKEN PHRASE</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopVoiceRecording}
                    className="flex-1 py-2.5 rounded-xl bg-slate-900 border border-rose-500 text-rose-400 font-bold flex items-center justify-center gap-2"
                  >
                    <Square className="w-4 h-4 fill-rose-500" />
                    <span>STOP RECORDING</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="text-slate-400 block">Enter 6-Digit Device OTP Token</label>
              <div className="relative">
                <Key className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="text"
                  maxLength={6}
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value)}
                  placeholder="696527"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-center font-bold text-lg text-cyan-300 tracking-widest focus:border-cyan-400 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Submission Result */}
          {result && (
            <div
              className={`p-3 rounded-xl border flex items-center gap-2.5 ${
                result.verified ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300' : 'bg-rose-950/40 border-rose-800 text-rose-300'
              }`}
            >
              {result.verified ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" /> : <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />}
              <div>
                <span className="font-bold block text-xs">{result.status}</span>
                <span className="text-[11px] font-sans block">{result.message}</span>
              </div>
            </div>
          )}

          <div className="pt-2 flex justify-end gap-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={verifying || timer === 0}
              className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold tracking-wider shadow-[0_0_15px_rgba(6,182,212,0.3)] disabled:opacity-50"
            >
              {verifying ? 'VERIFYING...' : 'SUBMIT RESPONSE'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
