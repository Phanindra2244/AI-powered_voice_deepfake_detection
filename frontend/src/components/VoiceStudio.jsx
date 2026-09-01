import React, { useState, useRef } from 'react';
import { Sparkles, Mic, Play, Pause, Download, Fingerprint, RefreshCw, Upload, CheckCircle2, Volume2, ShieldCheck, Lock } from 'lucide-react';

export default function VoiceStudio({ API_BASE, onVoiceGenerated }) {
  const [promptText, setPromptText] = useState('TRUETONE AI security validation audio. This voice synthesis clip is protected with an embedded digital watermark signature.');
  const [selectedVoice, setSelectedVoice] = useState('synth-adam');
  const [pitch, setPitch] = useState(180);
  const [speed, setSpeed] = useState(1.0);
  
  // Voice Cloning State
  const [cloneMode, setCloneMode] = useState(false);
  const [referenceFile, setReferenceFile] = useState(null);
  const [cloning, setCloning] = useState(false);
  const [clonedProfile, setClonedProfile] = useState(null);

  // Generation State
  const [generating, setGenerating] = useState(false);
  const [generatedAudio, setGeneratedAudio] = useState(null);
  const [generatedMetadata, setGeneratedMetadata] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const audioPlayerRef = useRef(null);

  const voiceOptions = [
    { id: 'synth-adam', name: 'Adam (US Male Analyst)', desc: 'Authoritative, Deep Tone' },
    { id: 'synth-sarah', name: 'Sarah (US Female Lead)', desc: 'Articulate, Crisp Tone' },
    { id: 'synth-nexus', name: 'Nexus-9 (Cyber Synthetic)', desc: 'Monotone, Precision Speech' },
    { id: 'synth-elena', name: 'Elena (UK Female Lead)', desc: 'Expressive, Natural Pitch' }
  ];

  const handleReferenceChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setReferenceFile(file);
    }
  };

  const runVoiceClone = async () => {
    if (!referenceFile) {
      alert('Please upload a reference audio sample to clone!');
      return;
    }

    setCloning(true);
    const formData = new FormData();
    formData.append('referenceAudio', referenceFile);

    try {
      const res = await fetch(`${API_BASE}/clone-voice`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setClonedProfile(data.cloneProfile);
        setCloneMode(true);
      } else {
        alert('Cloning failed: ' + data.error);
      }
    } catch (err) {
      alert('Network error during cloning: ' + err.message);
    } finally {
      setCloning(false);
    }
  };

  const handleGenerateVoice = async () => {
    if (!promptText.trim()) return;

    setGenerating(true);
    setGeneratedAudio(null);

    try {
      const res = await fetch(`${API_BASE}/generate-voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promptText,
          voiceId: selectedVoice,
          pitch,
          speed,
          cloneProfile: cloneMode ? clonedProfile : null
        })
      });
      const data = await res.json();
      if (data.success) {
        setGeneratedAudio(data.audioBase64);
        setGeneratedMetadata(data.metadata);
        if (onVoiceGenerated) onVoiceGenerated(data);
      } else {
        alert('Synthesis failed: ' + data.error);
      }
    } catch (err) {
      alert('Network error during speech synthesis: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  const togglePlayAudio = () => {
    if (!audioPlayerRef.current) return;
    if (isPlaying) {
      audioPlayerRef.current.pause();
      setIsPlaying(false);
    } else {
      audioPlayerRef.current.play();
      setIsPlaying(true);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Studio Header Card */}
      <div className="cyber-panel p-6 backdrop-blur-xl bg-slate-900/70 border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-cyan-400" />
              <h2 className="text-xl font-bold tracking-tight text-white">Voice Generation & Cloning Studio</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Synthesize neural speech, clone vocal timbre profiles from reference clips, and automatically inject 256-bit steganographic digital watermarks.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-emerald-950/60 px-4 py-2 rounded-xl border border-emerald-800/60 text-xs font-mono text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>STEGO WATERMARKING ACTIVE</span>
          </div>
        </div>

        {/* Text Input Prompt */}
        <div className="pt-6 space-y-4">
          <label className="block text-xs font-mono font-bold text-slate-300 uppercase tracking-widest">
            Speech Script / Prompt Text
          </label>
          <textarea
            rows={3}
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            placeholder="Type the text script to synthesize into audio..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-slate-100 text-sm focus:outline-none focus:border-cyan-400 transition-colors font-sans"
          />

          <div className="flex flex-wrap gap-2 text-xs font-mono">
            <span className="text-slate-500 self-center">Presets:</span>
            <button
              onClick={() => setPromptText("Security Notice: This is an automated TRUETONE synthetic audio verification broadcast.")}
              className="px-3 py-1 rounded-lg bg-slate-950 text-slate-300 hover:text-cyan-300 border border-slate-800 hover:border-cyan-500/40 transition-colors"
            >
              Security Notice
            </button>
            <button
              onClick={() => setPromptText("Welcome to the digital audio forensics laboratory. Authentication in progress.")}
              className="px-3 py-1 rounded-lg bg-slate-950 text-slate-300 hover:text-cyan-300 border border-slate-800 hover:border-cyan-500/40 transition-colors"
            >
              Lab Welcome
            </button>
          </div>
        </div>
      </div>

      {/* Voice Selection & Voice Cloning Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left: Persona Selector & Tuning Controls (7 Cols) */}
        <div className="lg:col-span-7 cyber-panel p-6 space-y-6 backdrop-blur-xl bg-slate-900/70 border border-slate-800">
          <h3 className="text-xs font-bold text-white font-mono uppercase tracking-widest flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-cyan-400" />
            SELECT VOICE PERSONA & TUNING
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {voiceOptions.map((v) => {
              const isSelected = !cloneMode && selectedVoice === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => {
                    setSelectedVoice(v.id);
                    setCloneMode(false);
                  }}
                  className={`p-4 rounded-xl text-left border transition-all duration-200 ${
                    isSelected
                      ? 'bg-slate-950 border-cyan-500/60 shadow-[0_0_20px_rgba(6,182,212,0.2)]'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold font-mono text-slate-200">{v.name}</span>
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-cyan-400" />}
                  </div>
                  <span className="text-[11px] text-slate-400 block mt-1">{v.desc}</span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-6 pt-4 border-t border-slate-800 font-mono text-xs">
            <div className="space-y-2">
              <div className="flex justify-between text-slate-400">
                <span>Base Pitch</span>
                <span className="text-cyan-300 font-bold">{pitch} Hz</span>
              </div>
              <input
                type="range"
                min="80"
                max="300"
                value={pitch}
                onChange={(e) => setPitch(Number(e.target.value))}
                className="w-full accent-cyan-400 bg-slate-950 h-2 rounded-lg cursor-pointer border border-slate-800"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-slate-400">
                <span>Speed Rate</span>
                <span className="text-cyan-300 font-bold">{speed}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="w-full accent-cyan-400 bg-slate-950 h-2 rounded-lg cursor-pointer border border-slate-800"
              />
            </div>
          </div>

        </div>

        {/* Right: Voice Cloning Module (5 Cols) */}
        <div className="lg:col-span-5 cyber-panel p-6 space-y-6 flex flex-col justify-between backdrop-blur-xl bg-slate-900/70 border border-slate-800">
          
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-white font-mono uppercase tracking-widest flex items-center gap-2">
                <Mic className="w-4 h-4 text-purple-400" />
                VOICE CLONING FROM REFERENCE
              </h3>
              {clonedProfile && (
                <span className="px-2 py-0.5 text-[10px] font-mono bg-purple-950 text-purple-300 border border-purple-800 rounded">
                  CLONED
                </span>
              )}
            </div>

            <p className="text-xs text-slate-400 mb-4">
              Upload a 3-10 second audio clip of any reference voice to extract vocal timbre, formants, and harmonic profile.
            </p>

            <label className="flex flex-col items-center justify-center p-5 border-2 border-dashed border-slate-700 hover:border-purple-400 bg-slate-950 rounded-xl cursor-pointer transition-all group">
              <Upload className="w-6 h-6 text-purple-400 group-hover:scale-110 transition-transform mb-2" />
              <span className="text-xs font-mono text-slate-300 text-center truncate max-w-xs">
                {referenceFile ? referenceFile.name : 'Choose Reference Audio Clip'}
              </span>
              <input type="file" accept="audio/*" onChange={handleReferenceChange} className="hidden" />
            </label>

            <div className="mt-4">
              <button
                onClick={runVoiceClone}
                disabled={cloning || !referenceFile}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-950 border border-purple-500/40 text-xs font-mono font-bold text-purple-300 hover:bg-purple-950/40 transition-all disabled:opacity-50"
              >
                {cloning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-purple-400" />}
                <span>{cloning ? 'Extracting Timbre...' : 'Extract & Clone Voice Profile'}</span>
              </button>
            </div>
          </div>

          {clonedProfile && (
            <div className="bg-slate-950 p-4 rounded-xl border border-purple-800/60 text-xs font-mono space-y-1">
              <div className="flex justify-between text-purple-300 font-bold">
                <span>{clonedProfile.profileName}</span>
                <span>{clonedProfile.estimatedPitch} Hz</span>
              </div>
              <p className="text-[11px] text-slate-400">Harmonic Clarity: {clonedProfile.harmonicClarity}</p>
            </div>
          )}

          {/* Generate Speech CTA */}
          <div className="pt-4 border-t border-slate-800">
            <button
              onClick={handleGenerateVoice}
              disabled={generating || !promptText.trim()}
              className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold font-mono tracking-wider shadow-[0_0_20px_rgba(6,182,212,0.35)] transition-all hover:scale-[1.01] disabled:opacity-50"
            >
              {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>{generating ? 'Synthesizing & Watermarking...' : 'Generate Watermarked Speech'}</span>
            </button>
          </div>

        </div>

      </div>

      {/* Generated Audio Card */}
      {generatedAudio && (
        <div className="cyber-panel p-6 space-y-4 backdrop-blur-xl bg-slate-900/90 border border-cyan-500/50 shadow-[0_0_30px_rgba(6,182,212,0.2)]">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white font-mono">SYNTHESIZED SPEECH READY</h3>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">
                Duration: {generatedMetadata?.duration || 2.5}s • Watermark ID: {generatedMetadata?.watermark?.watermarkId}
              </p>
            </div>

            <div className="flex items-center gap-3 font-mono text-xs">
              <button
                onClick={togglePlayAudio}
                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-slate-200 hover:border-cyan-400 transition-all"
              >
                {isPlaying ? <Pause className="w-4 h-4 text-amber-400" /> : <Play className="w-4 h-4 text-cyan-400" />}
                <span>{isPlaying ? 'Pause' : 'Play Audio'}</span>
              </button>

              <a
                href={generatedAudio}
                download={`voiceguard_watermarked_${Date.now()}.wav`}
                className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 text-white font-bold shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all hover:scale-105"
              >
                <Download className="w-4 h-4" />
                <span>Download Watermarked WAV</span>
              </a>
              <audio ref={audioPlayerRef} src={generatedAudio} onEnded={() => setIsPlaying(false)} className="hidden" />
            </div>
          </div>

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs space-y-2">
            <div className="flex items-center gap-2 text-cyan-400 font-bold border-b border-slate-900 pb-2">
              <Fingerprint className="w-4 h-4" />
              EMBEDDED DIGITAL WATERMARK PAYLOAD MANIFEST
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-slate-300 pt-1">
              <div>
                <span className="text-slate-500 block text-[10px]">Platform Signature</span>
                <span className="font-semibold text-slate-200">{generatedMetadata?.watermark?.platform}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Voice Persona</span>
                <span className="font-semibold text-cyan-300">{generatedMetadata?.watermark?.voiceId}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Script SHA-256 Digest</span>
                <span className="font-semibold text-purple-300">{generatedMetadata?.watermark?.textHash}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">HMAC Signature</span>
                <span className="font-semibold text-emerald-300 truncate block">{generatedMetadata?.watermark?.signature?.substring(0, 16)}...</span>
              </div>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
