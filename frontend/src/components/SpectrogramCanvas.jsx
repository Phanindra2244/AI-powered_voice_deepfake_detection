import React, { useEffect, useRef } from 'react';

export default function SpectrogramCanvas({
  analyserNode,
  isRecording,
  isPlaying,
  segmentHeatmap = [],
  activeSegmentId = null,
  onSelectSegment = () => {}
}) {
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const width = canvas.width = canvas.parentElement.clientWidth || 800;
    const height = canvas.height = 200;

    let bufferLength = 128;
    let dataArray = new Uint8Array(bufferLength);

    if (analyserNode) {
      bufferLength = analyserNode.frequencyBinCount;
      dataArray = new Uint8Array(bufferLength);
    }

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      // Deep Obsidian background
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, width, height);

      // Cyber Grid Mesh Overlay
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
      ctx.lineWidth = 0.5;
      
      // Vertical grid lines
      for (let x = 0; x < width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Horizontal grid lines
      for (let y = 0; y < height; y += 25) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Render Audio Visualizer when playing or recording
      if (analyserNode && (isRecording || isPlaying)) {
        analyserNode.getByteFrequencyData(dataArray);

        const barWidth = (width / bufferLength) * 2.2;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * (height * 0.8);

          // Neon Cyan-Purple gradient
          const grad = ctx.createLinearGradient(0, height, 0, height - barHeight);
          grad.addColorStop(0, 'rgba(6, 182, 212, 0.2)');
          grad.addColorStop(0.5, 'rgba(6, 182, 212, 0.8)');
          grad.addColorStop(1, 'rgba(168, 85, 247, 0.95)');

          ctx.fillStyle = grad;
          ctx.fillRect(x, height - barHeight, barWidth, barHeight);

          // Top neon glow cap
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(x, height - barHeight - 2, barWidth, 2);

          x += barWidth + 1.5;
        }

        // Oscilloscope Waveform overlay
        analyserNode.getByteTimeDomainData(dataArray);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#06b6d4';
        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = 10;
        ctx.beginPath();

        const sliceWidth = width * 1.0 / bufferLength;
        let wx = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const wy = (v * height) / 2;

          if (i === 0) ctx.moveTo(wx, wy);
          else ctx.lineTo(wx, wy);

          wx += sliceWidth;
        }
        ctx.stroke();
        ctx.shadowBlur = 0; // reset shadow
      } else {
        // Idle state: Smooth ambient animated cyber sine wave
        const time = Date.now() * 0.0025;
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.5)';
        ctx.shadowColor = 'rgba(6, 182, 212, 0.6)';
        ctx.shadowBlur = 8;
        ctx.beginPath();

        for (let x = 0; x < width; x += 2) {
          const y = height / 2 + Math.sin(x * 0.015 + time) * 20 * Math.cos(x * 0.004);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Render Segment Heatmap Overlays (if available)
      if (segmentHeatmap && segmentHeatmap.length > 0) {
        const totalSegs = segmentHeatmap.length;
        const segWidth = width / totalSegs;

        segmentHeatmap.forEach((seg, idx) => {
          const sx = idx * segWidth;
          const isHighRisk = seg.status === 'HIGH_RISK';
          const isSuspicious = seg.status === 'SUSPICIOUS';
          const isSelected = activeSegmentId === seg.id;

          // Fill color
          if (isHighRisk) {
            ctx.fillStyle = isSelected ? 'rgba(244, 63, 94, 0.5)' : 'rgba(244, 63, 94, 0.22)';
          } else if (isSuspicious) {
            ctx.fillStyle = isSelected ? 'rgba(245, 158, 11, 0.5)' : 'rgba(245, 158, 11, 0.18)';
          } else {
            ctx.fillStyle = isSelected ? 'rgba(16, 185, 129, 0.4)' : 'rgba(16, 185, 129, 0.08)';
          }

          ctx.fillRect(sx + 1, 0, segWidth - 2, height);

          // Top indicator bar (Crimson for Deepfake, Emerald for Real)
          ctx.fillStyle = isHighRisk ? '#f43f5e' : isSuspicious ? '#f59e0b' : '#10b981';
          ctx.fillRect(sx + 1, 0, segWidth - 2, 4);

          // Timestamp text label in JetBrains Mono
          ctx.font = '10px "JetBrains Mono", monospace';
          ctx.fillStyle = isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.65)';
          ctx.fillText(`${seg.startTime}s`, sx + 4, 18);

          if (isHighRisk) {
            ctx.fillStyle = '#fca5a5';
            ctx.fillText(`🚨 ${seg.score}%`, sx + 4, height - 8);
          } else if (!isSuspicious) {
            ctx.fillStyle = '#6ee7b7';
            ctx.fillText(`🛡️ REAL`, sx + 4, height - 8);
          }

          if (isSelected) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.strokeRect(sx + 1, 1, segWidth - 2, height - 2);
          }
        });
      }

      animFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [analyserNode, isRecording, isPlaying, segmentHeatmap, activeSegmentId]);

  const handleCanvasClick = (e) => {
    if (!segmentHeatmap || segmentHeatmap.length === 0) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const totalSegs = segmentHeatmap.length;
    const segWidth = rect.width / totalSegs;

    const segIndex = Math.floor(clickX / segWidth);
    if (segIndex >= 0 && segIndex < totalSegs) {
      onSelectSegment(segmentHeatmap[segIndex]);
    }
  };

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-2 shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]">
      <div className="absolute top-3 right-4 z-10 flex items-center gap-2 font-mono text-[11px] text-slate-400 bg-slate-900/90 px-3 py-1 rounded-lg border border-slate-800 backdrop-blur-md">
        <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
        <span className="text-cyan-300 font-semibold">MEL-SPECTROGRAM & OSCILLOSCOPE</span>
      </div>
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="w-full h-48 cursor-pointer rounded-xl"
      />
    </div>
  );
}
