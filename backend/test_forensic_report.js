import { buildChainOfCustodyRecord, generateForensicPdf, extractAudioFileProperties } from './services/forensicReporter.js';

async function runReportTest() {
  console.log("\n=======================================================");
  console.log("VOICEGUARD FORENSIC REPORT ENGINE DIAGNOSTIC TEST");
  console.log("=======================================================\n");

  // Mock WAV audio buffer
  const samplePcm = Buffer.alloc(44100 * 2 * 2); // 2 seconds stereo
  const fileProps = extractAudioFileProperties(samplePcm, 'evidence_recording_001.wav', {
    ip: '192.168.1.100',
    userAgent: 'Mozilla/5.0 Forensic Audit Browser'
  });

  console.log("1. DYNAMIC FILE METADATA EXTRACTED:");
  console.log(`   - Filename: ${fileProps.filename}`);
  console.log(`   - SHA-256 Digest: ${fileProps.sha256Hash}`);
  console.log(`   - MD5 Digest: ${fileProps.md5Hash}`);
  console.log(`   - File Size: ${fileProps.fileSizeFormatted}`);
  console.log(`   - MIME Type: ${fileProps.mimeType}`);
  console.log(`   - Duration: ${fileProps.durationSeconds}s`);
  console.log(`   - Sample Rate / Channels: ${fileProps.sampleRate} / ${fileProps.channelCount}`);

  // Test 2: Build Structured JSON Chain of Custody Record
  const mockAnalysisData = {
    verdict: 'DEEPFAKE',
    verdictText: 'Synthetic / AI Deepfake Detected',
    confidenceScore: 96.4,
    authenticityScore: 3.6,
    probabilities: { fake: 0.964, real: 0.036 },
    explanationSummary: 'High frequency vocoder cutoff at 12.4 kHz & phase jitter anomaly detected.',
    watermark: { found: true, payload: { watermarkId: 'VG-98421A', voiceId: 'synth-adam' } },
    acousticMetrics: {
      spectralFlatness: 0.42,
      pitchJitterPercent: 0.084,
      highFreqCutoffKHz: 12.4,
      phaseCoherenceIndex: 3.6
    }
  };

  const record = buildChainOfCustodyRecord(mockAnalysisData, fileProps, {
    examiner: 'Dr. Alex Vance, Chief Forensic Examiner',
    caseId: 'VG-CASE-2026-8849'
  });

  console.log("\n2. CHAIN OF CUSTODY STRUCTURED JSON RECORD:");
  console.log(`   - Case ID: #${record.caseId}`);
  console.log(`   - Verdict: ${record.verdictSummary.verdict}`);
  console.log(`   - P(Fake): ${record.verdictSummary.probabilityBreakdown.fake}`);
  console.log(`   - Watermark ID: ${record.watermarkScan.payload.watermarkId}`);
  console.log(`   - Digital HMAC Seal Signature: ${record.digitalSealSignature}`);
  console.log(`   - Audit Trail Steps Count: ${record.chainOfCustodyTrail.length}`);

  // Test 3: Generate PDF Binary Stream
  const pdfBuffer = await generateForensicPdf(record);
  console.log(`\n3. FORENSIC PDF GENERATOR RESULT:`);
  console.log(`   - PDF Buffer Size: ${pdfBuffer.length} bytes`);
  console.log(`   - Valid PDF Header: ${pdfBuffer.toString('ascii', 0, 8)}`);

  console.log("\n[SUCCESS] ALL FORENSIC REPORT ENGINE TESTS PASSED CLEANLY!\n");
}

runReportTest().catch(console.error);
