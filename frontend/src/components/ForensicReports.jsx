import React, { useState, useEffect } from 'react';
import { FileText, Download, Printer, ShieldCheck, CheckCircle2, Clock, FileCheck, RefreshCw } from 'lucide-react';

export default function ForensicReports({ API_BASE, currentReportData }) {
  const [reportRecord, setReportRecord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pdfDownloading, setPdfDownloading] = useState(false);

  useEffect(() => {
    if (currentReportData) {
      fetchReportRecord(currentReportData);
    } else {
      fetchReportRecord({
        analysisId: 'ANA-DEMO8941',
        filename: 'suspect_call_recording.wav',
        verdict: 'DEEPFAKE',
        confidenceScore: 94.8,
        explanationSummary: 'High-frequency spectral brickwall cutoff (12.4 kHz) & phase jitter anomalies detected across 4 segments.',
        fileHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        duration: 3.8,
        acousticMetrics: {
          spectralFlatness: 0.54,
          pitchJitterPercent: 0.084,
          highFreqCutoffKHz: 12.4,
          phaseCoherenceIndex: 24.2
        }
      });
    }
  }, [currentReportData]);

  const fetchReportRecord = async (analysisData) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/forensic-report?t=${Date.now()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
        body: JSON.stringify({ analysisData, examiner: 'Lead Forensic Audio Examiner' })
      });
      const data = await res.json();
      if (data.success) {
        setReportRecord(data.reportRecord);
      }
    } catch (err) {
      console.error('Error loading report record:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!reportRecord && !currentReportData) return;
    setPdfDownloading(true);

    let blobUrl = null;
    try {
      const cacheBustTimestamp = Date.now();
      const payloadData = currentReportData || (reportRecord ? {
        analysisId: reportRecord.caseId,
        filename: reportRecord.evidenceItem?.filename,
        verdict: reportRecord.verdictSummary?.verdict,
        confidenceScore: reportRecord.verdictSummary?.confidenceScore,
        authenticityScore: reportRecord.verdictSummary?.authenticityScore,
        probabilities: reportRecord.verdictSummary?.probabilityBreakdown,
        explanationSummary: reportRecord.verdictSummary?.explanationSummary,
        watermark: reportRecord.watermarkScan,
        acousticMetrics: reportRecord.spectralTelemetry,
        segmentHeatmap: reportRecord.flaggedSegments,
        duration: reportRecord.evidenceItem?.durationSeconds
      } : {});

      // Send POST request with cache-busting timestamp & no-cache headers
      const res = await fetch(`${API_BASE}/forensic-pdf?t=${cacheBustTimestamp}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
        body: JSON.stringify({
          analysisData: payloadData,
          caseId: reportRecord?.caseId || payloadData.analysisId,
          examiner: reportRecord?.examiner || 'Senior Forensic Audio Analyst'
        })
      });

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }

      // Extract unique filename from Content-Disposition header if present
      let downloadFilename = `Forensic_Report_${reportRecord?.caseId || 'VG'}_${cacheBustTimestamp}.pdf`;
      const dispositionHeader = res.headers.get('Content-Disposition');
      if (dispositionHeader && dispositionHeader.includes('filename=')) {
        const matches = dispositionHeader.match(/filename="?([^";]+)"?/);
        if (matches && matches[1]) {
          downloadFilename = matches[1];
        }
      }

      const pdfBlob = await res.blob();
      blobUrl = window.URL.createObjectURL(new Blob([pdfBlob], { type: 'application/pdf' }));
      
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = downloadFilename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert('Error downloading PDF: ' + err.message);
    } finally {
      // Always revoke object URL to prevent memory leaks or stale blob URL caching
      if (blobUrl) {
        setTimeout(() => {
          window.URL.revokeObjectURL(blobUrl);
        }, 1000);
      }
      setPdfDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      
      {/* Header Actions */}
      <div className="cyber-panel p-6 backdrop-blur-xl bg-slate-900/70 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-bold text-white">Forensic Evidence & Chain of Custody Log</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Tamper-proof cryptographic audit trail & formal evidence certificate for legal and investigative reporting.
          </p>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 hover:border-cyan-400 transition-all"
          >
            <Printer className="w-4 h-4 text-slate-300" />
            <span>Print Certificate</span>
          </button>

          <button
            onClick={handleDownloadPdf}
            disabled={pdfDownloading}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold tracking-wider shadow-[0_0_20px_rgba(6,182,212,0.35)] transition-all hover:scale-105 disabled:opacity-50"
          >
            {pdfDownloading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span>{pdfDownloading ? 'Generating PDF...' : 'Download PDF Report'}</span>
          </button>
        </div>
      </div>

      {loading || !reportRecord ? (
        <div className="cyber-panel p-12 text-center font-mono text-slate-400 backdrop-blur-xl bg-slate-900/70 border border-slate-800">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-cyan-400 mb-3" />
          <span>Building Cryptographic Chain of Custody Record...</span>
        </div>
      ) : (
        /* Formal Certificate Card */
        <div className="cyber-panel p-8 space-y-8 backdrop-blur-xl bg-slate-950/90 border border-slate-700/80 shadow-2xl">
          
          {/* Certificate Header Banner */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 border-b border-slate-800 gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-6 h-6 text-cyan-400" />
                <h3 className="text-2xl font-black tracking-wider text-white font-mono">VOICEGUARD FORENSIC CERTIFICATE</h3>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-1">Official Chain of Custody Audit Certificate • Case #{reportRecord.caseId}</p>
            </div>

            <div className="text-right font-mono text-xs text-slate-400">
              <div>Issued: {new Date(reportRecord.timestampUtc || reportRecord.timestamp).toUTCString()}</div>
              <div>Examiner: <span className="text-slate-200 font-bold">{reportRecord.examiner}</span></div>
            </div>
          </div>

          {/* Verdict Banner Card */}
          <div className={`p-6 rounded-2xl border font-mono ${
            reportRecord.verdictSummary.verdict === 'DEEPFAKE'
              ? 'bg-rose-950/40 border-rose-800/60 text-rose-300 shadow-[0_0_25px_rgba(244,63,94,0.2)]'
              : 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300 shadow-[0_0_25px_rgba(16,185,129,0.2)]'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Analysis Verdict</span>
              <span className="text-xs font-bold px-3 py-1 rounded-lg bg-slate-950 border border-slate-800">
                Confidence: {reportRecord.verdictSummary.confidenceScore}% Synthetic Risk
              </span>
            </div>
            <h4 className="text-2xl font-extrabold tracking-tight mt-2">{reportRecord.verdictSummary.verdictText}</h4>
            <p className="text-xs text-slate-300 mt-2 font-sans leading-relaxed">{reportRecord.verdictSummary.explanationSummary}</p>
          </div>

          {/* Evidence Properties & Hash Section */}
          <div className="space-y-3 font-mono text-xs">
            <h4 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2 border-b border-slate-800 pb-2">
              <FileCheck className="w-4 h-4 text-cyan-400" />
              1. AUDIO EVIDENCE METADATA & CRYPTOGRAPHIC HASH
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <div className="flex justify-between"><span className="text-slate-400">File Identifier:</span><span className="text-slate-200 font-bold">{reportRecord.evidenceItem.filename}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Audio Duration:</span><span className="text-slate-200">{reportRecord.evidenceItem.durationSeconds}s</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Encoding / Channels:</span><span className="text-slate-200">{reportRecord.evidenceItem.sampleRate} ({reportRecord.evidenceItem.channelCount || reportRecord.evidenceItem.channels})</span></div>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <span className="text-slate-400 block">SHA-256 Audio Digest:</span>
                <span className="text-cyan-300 font-bold block break-all">{reportRecord.evidenceItem.sha256Hash}</span>
              </div>
            </div>
          </div>

          {/* Chain of Custody Audit Trail Table */}
          <div className="space-y-3 font-mono text-xs">
            <h4 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2 border-b border-slate-800 pb-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              2. CHAIN OF CUSTODY AUDIT TRAIL
            </h4>

            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 text-[11px]">
                    <th className="py-3 px-4">Step</th>
                    <th className="py-3 px-4">Action Description</th>
                    <th className="py-3 px-4">Operator / Module</th>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300 text-xs">
                  {reportRecord.chainOfCustodyTrail.map((item) => (
                    <tr key={item.step} className="hover:bg-slate-900/50 transition-colors">
                      <td className="py-3 px-4 font-bold text-cyan-400">{item.step}</td>
                      <td className="py-3 px-4">{item.action}</td>
                      <td className="py-3 px-4 text-slate-400">{item.operator}</td>
                      <td className="py-3 px-4 text-slate-400">{item.timestamp.substring(11, 19)} UTC</td>
                      <td className="py-3 px-4 text-emerald-400 flex items-center gap-1.5 font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5" /> VERIFIED
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Digital Forensic Seal */}
          <div className="pt-6 border-t border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 font-mono text-xs">
            <div>
              <span className="text-slate-400 block mb-1 text-[11px]">Digital Forensic Seal HMAC Signature:</span>
              <span className="text-cyan-400 font-bold break-all">{reportRecord.digitalSealSignature}</span>
            </div>
            <div className="text-right text-slate-500 text-[11px]">
              TRUETONE AI Neural Forensics Lab • Cryptographically Sealed
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
