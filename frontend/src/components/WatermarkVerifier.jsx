import React, { useState } from 'react';
import { Fingerprint, Upload, CheckCircle2, AlertOctagon, HelpCircle, RefreshCw, Lock, Key } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function WatermarkVerifier({ API_BASE }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setVerificationResult(null);
    }
  };

  const runWatermarkScan = async () => {
    if (!selectedFile) {
      alert('Please select an audio file to verify!');
      return;
    }

    setScanning(true);
    setVerificationResult(null);

    const formData = new FormData();
    formData.append('audio', selectedFile);

    try {
      const res = await fetch(`${API_BASE}/verify-watermark`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setVerificationResult(data.verification);
        if (data.verification.found && data.verification.verified) {
          confetti({
            particleCount: 90,
            spread: 80,
            origin: { y: 0.6 }
          });
        }
      } else {
        alert('Verification failed: ' + data.error);
      }
    } catch (err) {
      alert('Network error during scan: ' + err.message);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="cyber-panel p-6 backdrop-blur-xl bg-slate-900/70 border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2.5">
              <Fingerprint className="w-5 h-5 text-cyan-400" />
              <h2 className="text-xl font-bold text-white">Digital Watermark & Source Provenance Scanner</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Verify whether an audio clip was produced by VoiceGuard AI Studio by extracting steganographic metadata signatures.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-slate-950 px-4 py-2 rounded-xl border border-slate-800 text-xs font-mono text-cyan-300">
            <Lock className="w-4 h-4 text-cyan-400" />
            <span>HMAC SHA-256 VERIFICATION</span>
          </div>
        </div>

        {/* File Drag & Drop Scanner */}
        <div className="pt-6 space-y-4">
          <label className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-700 hover:border-cyan-400 bg-slate-950 rounded-2xl cursor-pointer transition-all duration-200 group">
            <Fingerprint className="w-12 h-12 text-cyan-400 group-hover:scale-110 transition-transform mb-3" />
            <span className="text-sm font-semibold font-mono text-slate-200">
              {selectedFile ? selectedFile.name : 'Drop Audio File Here or Click to Browse'}
            </span>
            <span className="text-xs text-slate-400 mt-1 font-mono">Supports WAV, MP3, WebM audio formats</span>
            <input type="file" accept="audio/*" onChange={handleFileChange} className="hidden" />
          </label>

          <div className="flex justify-end">
            <button
              onClick={runWatermarkScan}
              disabled={scanning || !selectedFile}
              className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold font-mono text-xs tracking-wider shadow-[0_0_20px_rgba(6,182,212,0.35)] transition-all hover:scale-105 disabled:opacity-50"
            >
              {scanning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
              <span>{scanning ? 'Scanning Steganography...' : 'Scan Digital Watermark'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Verification Result Card */}
      {verificationResult && (
        <div className={`cyber-panel p-6 space-y-6 backdrop-blur-xl bg-slate-900/80 border ${
          verificationResult.found && verificationResult.verified ? 'cyber-panel-emerald' :
          verificationResult.found ? 'cyber-panel-danger' : 'border-slate-800'
        }`}>
          
          <div className="flex items-center gap-4 pb-4 border-b border-slate-800">
            {verificationResult.found && verificationResult.verified ? (
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/40 text-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.3)]">
                <CheckCircle2 className="w-10 h-10" />
              </div>
            ) : verificationResult.found ? (
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/40 text-rose-400 shadow-[0_0_25px_rgba(244,63,94,0.3)]">
                <AlertOctagon className="w-10 h-10" />
              </div>
            ) : (
              <div className="p-3.5 rounded-2xl bg-slate-800 text-slate-400 border border-slate-700">
                <HelpCircle className="w-10 h-10" />
              </div>
            )}

            <div>
              <h3 className={`text-xl font-bold font-mono tracking-tight ${
                verificationResult.found && verificationResult.verified ? 'text-emerald-400' :
                verificationResult.found ? 'text-rose-400' : 'text-slate-300'
              }`}>
                {verificationResult.found && verificationResult.verified
                  ? 'VERIFIED VOICEGUARD PLATFORM AUDIO'
                  : verificationResult.found
                  ? 'TAMPERED / CORRUPTED WATERMARK DETECTED'
                  : 'NO EMBEDDED VOICEGUARD WATERMARK DETECTED'}
              </h3>
              <p className="text-xs text-slate-400 font-mono mt-1">
                Audio SHA-256 Hash: <span className="text-cyan-300 font-bold">{verificationResult.sha256}</span>
              </p>
            </div>
          </div>

          {verificationResult.found && verificationResult.payload ? (
            <div className="space-y-4 font-mono text-xs">
              <h4 className="font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
                <Key className="w-4 h-4 text-cyan-400" />
                AUTHENTICATED WATERMARK PAYLOAD METADATA
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex justify-between"><span className="text-slate-400">Platform Origin:</span><span className="text-slate-100 font-bold">{verificationResult.payload.platform}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Watermark ID:</span><span className="text-cyan-300 font-bold">{verificationResult.payload.watermarkId}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Engine Version:</span><span className="text-slate-300">{verificationResult.payload.version}</span></div>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex justify-between"><span className="text-slate-400">Voice Persona ID:</span><span className="text-purple-300 font-bold">{verificationResult.payload.voiceId}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Generation Date:</span><span className="text-slate-300">{new Date(verificationResult.payload.timestamp).toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Script Digest:</span><span className="text-emerald-300 font-bold">{verificationResult.payload.textHash}</span></div>
                </div>
              </div>

              {verificationResult.payload.textPrompt && (
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block mb-1 text-[11px]">Original Text Prompt Script:</span>
                  <p className="text-slate-200 italic font-sans">"{verificationResult.payload.textPrompt}"</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs text-slate-400 font-mono">
              <p>Reason: {verificationResult.reason || 'This audio clip does not contain VoiceGuard steganographic watermark headers.'}</p>
            </div>
          )}

        </div>
      )}

    </div>
  );
}
