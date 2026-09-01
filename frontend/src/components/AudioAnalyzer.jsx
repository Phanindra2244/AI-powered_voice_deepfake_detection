import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Upload, Play, Pause, AlertTriangle, ShieldCheck, ShieldAlert, Sparkles, FileText, Info, RefreshCw, BarChart2, Radio, CheckCircle2, Trash2 } from 'lucide-react';
import SpectrogramCanvas from './SpectrogramCanvas';

export default function AudioAnalyzer({ API_BASE, onNavigateToReport }) {
  const [mode, setMode] = useState('upload'); // 'upload' | 'live'
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [analyserNode, setAnalyserNode] = useState(null);
  
  const [selectedFile, setSelectedFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const [analyzing, setAnalyzing] = useState(false);

  // Restore persisted analysis result from localStorage if available
  const [analysisResult, setAnalysisResult] = useState(() => {
    try {
      const saved = localStorage.getItem('voiceguard_latest_analysis_result');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed && parsed.analysisResult ? parsed.analysisResult : parsed;
      }
    } catch (e) {
      console.warn("Failed to load saved analysis result:", e);
    }
    return null;
  });

  const [selectedSegment, setSelectedSegment] = useState(() => {
    try {
      const saved = localStorage.getItem('voiceguard_latest_analysis_result');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed ? parsed.selectedSegment : null;
      }
    } catch (e) {}
    return null;
  });

  const [savedFileName, setSavedFileName] = useState(() => {
    try {
      const saved = localStorage.getItem('voiceguard_latest_analysis_result');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed ? parsed.selectedFileName : null;
      }
    } catch (e) {}
    return null;
  });

  // Speaker Claim State
  const [speakersList, setSpeakersList] = useState([]);
  const [claimedSpeakerId, setClaimedSpeakerId] = useState(() => {
    try {
      const saved = localStorage.getItem('voiceguard_latest_analysis_result');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed ? parsed.claimedSpeakerId || '' : '';
      }
    } catch (e) {}
    return '';
  });

  // Audio Context & Mic refs
  const audioCtxRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioPlayerRef = useRef(null);
  const timerRef = useRef(null);

  // Helper to persist current result state to localStorage
  const persistAnalysisState = (resultData, segmentData = null, fileNameStr = null) => {
    try {
      if (!resultData) {
        localStorage.removeItem('voiceguard_latest_analysis_result');
      } else {
        const payload = {
          analysisResult: resultData,
          selectedSegment: segmentData,
          selectedFileName: fileNameStr || (selectedFile ? selectedFile.name : (resultData.filename || 'inspected_audio.wav')),
          claimedSpeakerId: claimedSpeakerId || ''
        };
        localStorage.setItem('voiceguard_latest_analysis_result', JSON.stringify(payload));
      }
    } catch (e) {
      console.warn("Failed to persist analysis result:", e);
    }
  };

  const handleClearResult = () => {
    setAnalysisResult(null);
    setSelectedSegment(null);
    setSelectedFile(null);
    setAudioUrl(null);
    setSavedFileName(null);
    try {
      localStorage.removeItem('voiceguard_latest_analysis_result');
    } catch (e) {}
  };

  useEffect(() => {
    fetch(`${API_BASE}/speakers`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.speakers) {
          setSpeakersList(data.speakers);
        }
      })
      .catch(() => {});

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [API_BASE]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setSavedFileName(file.name);
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
      setAnalysisResult(null);
      setSelectedSegment(null);
      runAnalysis(file);
    }
  };

  const [realtimeMetrics, setRealtimeMetrics] = useState(null);

  const startRecording = async () => {
    try {
      setRealtimeMetrics(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtxRef.current.createMediaStreamSource(stream);
      const analyser = audioCtxRef.current.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      setAnalyserNode(analyser);

      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = async (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);

          // Perform Near-Real-Time Chunk Analysis
          try {
            const currentBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
            const formData = new FormData();
            formData.append('audio', currentBlob, 'realtime_chunk.wav');
            if (claimedSpeakerId) formData.append('claimedSpeakerId', claimedSpeakerId);
            
            const res = await fetch(`${API_BASE}/analyze-voice`, { method: 'POST', body: formData });
            const chunkResult = await res.json();
            if (chunkResult.success) {
              setRealtimeMetrics({
                aiProb: chunkResult.ai_probability,
                humanProb: chunkResult.human_probability,
                prediction: chunkResult.prediction,
                score: chunkResult.confidenceScore || Math.round(chunkResult.ai_probability * 100)
              });
            }
          } catch (err) {}
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const file = new File([audioBlob], 'live_mic_recording.wav', { type: 'audio/wav' });
        setSelectedFile(file);
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        
        await runAnalysis(file);
      };

      mediaRecorderRef.current.start(1000); // 1-second timeslice for Near Real-Time updates
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
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
    }
  };

  const runAnalysis = async (fileToAnalyze = selectedFile, forceOption = null) => {
    setAnalyzing(true);

    const formData = new FormData();
    if (fileToAnalyze) {
      formData.append('audio', fileToAnalyze);
    } else {
      formData.append('audioBase64', 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=');
    }

    if (forceOption === 'deepfake') formData.append('forceDeepfake', 'true');
    if (forceOption === 'authentic') formData.append('forceAuthentic', 'true');
    if (claimedSpeakerId) formData.append('claimedSpeakerId', claimedSpeakerId);

    try {
      const res = await fetch(`${API_BASE}/analyze`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        const newResult = data.data;
        setAnalysisResult(newResult);
        let defaultSeg = null;
        if (newResult.segmentHeatmap && newResult.segmentHeatmap.length > 0) {
          const highRisk = newResult.segmentHeatmap.find(s => s.status === 'HIGH_RISK');
          defaultSeg = highRisk || newResult.segmentHeatmap[0];
        }
        setSelectedSegment(defaultSeg);
        const fileNameStr = fileToAnalyze ? fileToAnalyze.name : (newResult.filename || 'inspected_audio.wav');
        setSavedFileName(fileNameStr);

        persistAnalysisState(newResult, defaultSeg, fileNameStr);
      } else {
        alert('Analysis Error: ' + data.error);
      }
    } catch (err) {
      alert('Network Error during analysis: ' + err.message);
    } finally {
      setAnalyzing(false);
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
      
      {/* Top Cyberpunk Command Card */}
      <div className="cyber-panel p-6 backdrop-blur-xl bg-slate-900/70 border border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
          <div>
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-cyan-400" />
              <h2 className="text-xl font-bold tracking-tight text-white">Audio Deepfake Forensic Inspection</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Upload recordings or stream live microphone audio for instant acoustic feature extraction and temporal deepfake anomaly callouts.
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center bg-slate-950 p-1.5 rounded-xl border border-slate-800 shadow-inner self-start lg:self-auto font-mono text-xs">
            <button
              onClick={() => setMode('upload')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-200 ${
                mode === 'upload' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.2)]' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Recording
            </button>
            <button
              onClick={() => setMode('live')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-200 ${
                mode === 'live' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.2)]' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Radio className="w-3.5 h-3.5 text-rose-400" />
              Live Microphone Stream
            </button>
          </div>
        </div>

        {/* Action Panel Controls */}
        <div className="pt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          
          {mode === 'upload' ? (
            <div className="lg:col-span-8 flex flex-col sm:flex-row items-center gap-4">
              <label className="w-full sm:w-auto flex-1 cursor-pointer flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl border-2 border-dashed border-slate-700 hover:border-cyan-400 bg-slate-950/80 hover:bg-slate-900 transition-all duration-200 group">
                <Upload className="w-5 h-5 text-cyan-400 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-mono text-slate-300 truncate max-w-xs">
                  {selectedFile ? selectedFile.name : (savedFileName || 'Select or Drag Audio File (WAV, MP3, WebM)')}
                </span>
                <input type="file" accept="audio/*" onChange={handleFileChange} className="hidden" />
              </label>

              {audioUrl && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={togglePlayAudio}
                    className="flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200 hover:border-cyan-400 transition-all"
                  >
                    {isPlaying ? <Pause className="w-4 h-4 text-amber-400" /> : <Play className="w-4 h-4 text-cyan-400" />}
                    <span>{isPlaying ? 'Pause' : 'Play Clip'}</span>
                  </button>
                  <audio ref={audioPlayerRef} src={audioUrl} onEnded={() => setIsPlaying(false)} className="hidden" />
                </div>
              )}
            </div>
          ) : (
            <div className="lg:col-span-8 flex items-center gap-4">
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  className="flex items-center gap-2 px-5 py-3.5 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 text-white text-xs font-bold font-mono tracking-wider shadow-[0_0_20px_rgba(244,63,94,0.4)] hover:brightness-110 transition-all"
                >
                  <Mic className="w-4 h-4 animate-pulse" />
                  <span>START LIVE MIC CAPTURE</span>
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="flex items-center gap-2 px-5 py-3.5 rounded-xl bg-slate-900 border border-rose-500/60 text-rose-300 text-xs font-bold font-mono hover:bg-rose-950/40 transition-all"
                >
                  <Square className="w-4 h-4 fill-rose-500 text-rose-500" />
                  <span>STOP & ANALYZING ({recordingTime}s)</span>
                </button>
              )}

              {isRecording && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 text-xs font-mono text-rose-400 bg-rose-950/60 px-4 py-3 rounded-xl border border-rose-800/60">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                    <span>Near Real-Time Analysis:</span>
                  </div>
                  {realtimeMetrics ? (
                    <div className="flex items-center gap-2 text-cyan-300 font-bold">
                      <span>P(AI): {(realtimeMetrics.aiProb * 100).toFixed(1)}%</span>
                      <span>•</span>
                      <span>P(Human): {(realtimeMetrics.humanProb * 100).toFixed(1)}%</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] ${realtimeMetrics.prediction === 'AI_GENERATED' ? 'bg-rose-900 text-rose-300' : 'bg-emerald-900 text-emerald-300'}`}>
                        {realtimeMetrics.prediction}
                      </span>
                    </div>
                  ) : (
                    <span className="text-slate-400">Capturing audio chunks...</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Quick Demos & Run Button */}
          <div className="lg:col-span-4 flex flex-col sm:flex-row items-center justify-end gap-2.5 font-mono text-xs">
            <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800 w-full sm:w-auto">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider pl-1">Claim:</span>
              <select
                value={claimedSpeakerId}
                onChange={(e) => setClaimedSpeakerId(e.target.value)}
                className="bg-transparent text-cyan-300 font-bold text-xs focus:outline-none max-w-[170px] truncate"
              >
                <option value="" className="bg-slate-950 text-slate-400">Optional Speaker</option>
                {speakersList.map((s) => (
                  <option key={s.speaker_id} value={s.speaker_id} className="bg-slate-950 text-slate-200">
                    {s.name} ({s.speaker_id})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                onClick={() => runAnalysis(null, 'deepfake')}
                disabled={analyzing}
                className="px-3 py-2.5 rounded-xl bg-rose-950/80 hover:bg-rose-900/90 text-rose-300 border border-rose-800/80 transition-all hover:scale-[1.02]"
              >
                Demo Synthetic
              </button>
              <button
                onClick={() => runAnalysis(null, 'authentic')}
                disabled={analyzing}
                className="px-3 py-2.5 rounded-xl bg-emerald-950/80 hover:bg-emerald-900/90 text-emerald-300 border border-emerald-800/80 transition-all hover:scale-[1.02]"
              >
                Demo Authentic
              </button>
              
              <button
                onClick={() => runAnalysis()}
                disabled={analyzing || (!selectedFile && mode === 'upload')}
                className="flex items-center gap-2 px-5 py-3.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold tracking-wider shadow-[0_0_20px_rgba(6,182,212,0.35)] transition-all hover:scale-[1.02] disabled:opacity-50"
              >
                {analyzing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>{analyzing ? 'Inspecting...' : 'Analyze Audio'}</span>
              </button>

              {analysisResult && (
                <button
                  onClick={handleClearResult}
                  title="Remove saved analysis result"
                  className="px-3 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-900 text-rose-400 border border-slate-800 hover:border-rose-700 transition-all flex items-center gap-1.5 font-mono text-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              )}
            </div>
          </div>

        </div>

      </div>

      {/* Spectrogram & Visualizer Box */}
      <div className="cyber-panel p-6 space-y-3 backdrop-blur-xl bg-slate-900/70 border border-slate-800">
        <div className="flex items-center justify-between font-mono">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-cyan-400" />
            SPECTROGRAM & TEMPORAL ANOMALY HEATMAP
          </h3>
          <span className="text-xs text-slate-400">
            {analysisResult ? `Duration: ${analysisResult.duration}s • Click segments below` : 'Awaiting Audio Signal'}
          </span>
        </div>

        <SpectrogramCanvas
          analyserNode={analyserNode}
          isRecording={isRecording}
          isPlaying={isPlaying}
          segmentHeatmap={analysisResult?.segmentHeatmap || []}
          activeSegmentId={selectedSegment?.id}
          onSelectSegment={(seg) => setSelectedSegment(seg)}
        />
      </div>

      {/* Analysis Results Grid */}
      {analysisResult && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Verdict Badge & Progress Confidence Meter (5 Cols) */}
          <div className="lg:col-span-5 cyber-panel p-6 flex flex-col justify-between space-y-6 backdrop-blur-xl bg-slate-900/70 border border-slate-800">
            
            <div>
              <span className="text-[11px] font-mono tracking-widest text-slate-400 uppercase">Analysis Verdict</span>
              <div className="mt-3 flex items-center gap-3">
                {analysisResult.verdict === 'DEEPFAKE' && (
                  <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/40 text-rose-400 shadow-[0_0_25px_rgba(244,63,94,0.3)]">
                    <ShieldAlert className="w-8 h-8" />
                  </div>
                )}
                {analysisResult.verdict === 'AUTHENTIC' && (
                  <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/40 text-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.3)]">
                    <ShieldCheck className="w-8 h-8" />
                  </div>
                )}
                {analysisResult.verdict === 'SUSPICIOUS' && (
                  <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/40 text-amber-400">
                    <AlertTriangle className="w-8 h-8" />
                  </div>
                )}

                <div>
                  <h3 className={`text-xl font-bold tracking-tight ${
                    analysisResult.verdict === 'DEEPFAKE' ? 'text-rose-400' :
                    analysisResult.verdict === 'AUTHENTIC' ? 'text-emerald-400' : 'text-amber-400'
                  }`}>
                    {analysisResult.verdictText}
                  </h3>
                  <p className="text-xs font-mono text-slate-400">Case Ref: #{analysisResult.analysisId}</p>
                </div>
              </div>
            </div>

            {/* Glowing Confidence Progress Meter */}
            <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800/90 space-y-3 font-mono">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">SYNTHETIC DEEPFAKE CONFIDENCE</span>
                <span className={`font-bold text-base ${analysisResult.confidenceScore >= 65 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {analysisResult.confidenceScore}%
                </span>
              </div>
              <div className="w-full bg-slate-900 h-3.5 rounded-full overflow-hidden p-0.5 border border-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${
                    analysisResult.confidenceScore >= 65
                      ? 'bg-gradient-to-r from-amber-500 to-rose-500 shadow-[0_0_15px_#f43f5e]'
                      : 'bg-gradient-to-r from-cyan-500 to-emerald-500 shadow-[0_0_15px_#10b981]'
                  }`}
                  style={{ width: `${analysisResult.confidenceScore}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>0% Real Human</span>
                <span>50% Suspicious</span>
                <span>100% Synthetic AI</span>
              </div>
            </div>

            {/* Optional Speaker Biometric Verification Result Card */}
            {analysisResult.speakerVerification && (
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/90 space-y-2 font-mono text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">SPEAKER IDENTITY MATCH</span>
                  <span className={`font-bold ${analysisResult.speakerVerification.severity === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {analysisResult.speakerVerification.match_percentage}% Cosine Match
                  </span>
                </div>

                <div className={`p-3 rounded-xl border text-xs flex items-center gap-2.5 ${
                  analysisResult.speakerVerification.severity === 'success'
                    ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
                    : analysisResult.speakerVerification.severity === 'warning'
                    ? 'bg-amber-950/40 border-amber-800/80 text-amber-300'
                    : 'bg-rose-950/40 border-rose-800/80 text-rose-300'
                }`}>
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <div>
                    <span className="font-bold block text-xs">{analysisResult.speakerVerification.status_text}</span>
                    <span className="text-[10px] text-slate-300 font-sans block">
                      Claimed: {analysisResult.speakerVerification.claimed_speaker?.name} ({analysisResult.speakerVerification.claimed_speaker?.speaker_id})
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Narrative Explanation */}
            <div className="text-xs text-slate-300 bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-1">
              <div className="font-semibold text-cyan-400 font-mono flex items-center gap-1.5 mb-1">
                <Info className="w-3.5 h-3.5" />
                ACOUSTIC SUMMARY
              </div>
              <p className="leading-relaxed text-slate-300">{analysisResult.explanationSummary}</p>
            </div>

            {/* Dynamic Security Insights Card */}
            {(analysisResult.evidence || analysisResult.recommendations) && (
              <div className="cyber-panel p-4 bg-slate-950/90 border border-slate-800 rounded-xl space-y-3 font-mono text-xs">
                <div className="font-semibold text-amber-400 flex items-center gap-2 border-b border-slate-800 pb-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  SECURITY INSIGHTS & EVIDENCE
                </div>

                {analysisResult.evidence && analysisResult.evidence.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[11px] text-slate-400 font-bold block">DETECTED EVIDENCE:</span>
                    {analysisResult.evidence.map((ev, i) => (
                      <div key={i} className="flex items-start gap-2 text-slate-200 text-xs">
                        <span className="text-amber-400 font-bold">✓</span>
                        <span>{ev.text || ev}</span>
                      </div>
                    ))}
                  </div>
                )}

                {analysisResult.recommendations && analysisResult.recommendations.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-900">
                    <span className="text-[11px] text-slate-400 font-bold block">RECOMMENDED ACTIONS:</span>
                    {analysisResult.recommendations.map((rec, i) => (
                      <div key={i} className="text-slate-300 text-xs pl-2 border-l-2 border-cyan-500">
                        {rec}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => onNavigateToReport(analysisResult)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-700 text-xs font-mono font-bold text-slate-200 hover:border-cyan-400 transition-all"
              >
                <FileText className="w-4 h-4 text-cyan-400" />
                <span>Open Chain of Custody Report</span>
              </button>
              <button
                onClick={handleClearResult}
                title="Clear persisted analysis result"
                className="px-4 py-3 rounded-xl bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-rose-700 text-xs font-mono text-rose-400 transition-all flex items-center gap-1.5 font-bold"
              >
                <Trash2 className="w-4 h-4" />
                <span>Clear</span>
              </button>
            </div>

          </div>

          {/* Segment Anomaly Explanation & Feature Metrics (7 Cols) */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Timestamp Callout */}
            <div className="cyber-panel p-6 backdrop-blur-xl bg-slate-900/70 border border-slate-800">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                <h4 className="text-xs font-bold text-white font-mono uppercase tracking-widest flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  TIMESTAMPED ANOMALY EXPLANATION
                </h4>
                {selectedSegment && (
                  <span className={`px-2.5 py-1 text-xs font-mono font-bold rounded-lg border ${
                    selectedSegment.status === 'HIGH_RISK' ? 'bg-rose-950/60 text-rose-300 border-rose-800' :
                    selectedSegment.status === 'SUSPICIOUS' ? 'bg-amber-950/60 text-amber-300 border-amber-800' : 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                  }`}>
                    Segment {selectedSegment.startTime}s - {selectedSegment.endTime}s
                  </span>
                )}
              </div>

              {selectedSegment ? (
                <div className="space-y-4 font-mono">
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="text-slate-400">Flagged Segment Score:</span>
                      <span className={`font-bold text-sm ${selectedSegment.score >= 65 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {selectedSegment.score}% Synthetic Anomaly
                      </span>
                    </div>
                    <p className="text-xs text-slate-200 font-sans leading-relaxed">
                      {selectedSegment.explanation || 'Natural human vocal envelope and smooth spectral harmonics observed throughout segment.'}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 block">Flatness</span>
                      <span className="text-sm font-bold text-cyan-300">{selectedSegment.features?.spectralFlatness || '0.28'}</span>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 block">Pitch Jitter</span>
                      <span className="text-sm font-bold text-purple-300">{selectedSegment.features?.pitchJitter || '0.024'}</span>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                      <span className="text-[10px] text-slate-400 block">Phase Glitch</span>
                      <span className="text-sm font-bold text-amber-300">{selectedSegment.features?.phaseDiscontinuity || 'Low'}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 font-mono italic">Select a timestamp segment on the heatmap above to view acoustic evidence breakdown.</p>
              )}
            </div>

            {/* Global Acoustic Features Matrix */}
            <div className="cyber-panel p-6 backdrop-blur-xl bg-slate-900/70 border border-slate-800">
              <h4 className="text-xs font-bold text-slate-200 font-mono uppercase tracking-widest mb-4">ACOUSTIC SPECTRAL EVIDENCE METRICS</h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex justify-between items-center">
                  <div>
                    <span className="text-slate-400 block text-[11px]">High Frequency Cutoff</span>
                    <span className="text-slate-300 text-[10px]">Vocoder brickwall limit</span>
                  </div>
                  <span className={`font-bold text-sm ${analysisResult.acousticMetrics.highFreqCutoffKHz < 16 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {analysisResult.acousticMetrics.highFreqCutoffKHz} kHz
                  </span>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex justify-between items-center">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Phase Coherence Index</span>
                    <span className="text-slate-300 text-[10px]">Harmonic continuity</span>
                  </div>
                  <span className="font-bold text-sm text-cyan-300">
                    {analysisResult.acousticMetrics.phaseCoherenceIndex} / 100
                  </span>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex justify-between items-center">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Pitch Jitter Variance</span>
                    <span className="text-slate-300 text-[10px]">Micro vocal shimmer</span>
                  </div>
                  <span className="font-bold text-sm text-purple-300">
                    {analysisResult.acousticMetrics.pitchJitterPercent}%
                  </span>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex justify-between items-center">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Digital Watermark Scan</span>
                    <span className="text-slate-300 text-[10px]">TRUETONE signature</span>
                  </div>
                  <span className={`font-bold text-[10px] px-2 py-0.5 rounded border ${
                    analysisResult.watermark?.found ? 'bg-rose-950/80 text-rose-300 border-rose-800' : 'bg-slate-900 text-slate-400 border-slate-800'
                  }`}>
                    {analysisResult.watermark?.found ? 'WATERMARKED SYNTHETIC' : 'NONE DETECTED'}
                  </span>
                </div>
              </div>
            </div>

          </div>

        </div>
      )}

    </div>
  );
}
