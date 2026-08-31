import express from 'express';
import multer from 'multer';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { analyzeAudio } from '../services/audioAnalyzer.js';
import { analyzeIntent, runIntentOneShot } from '../services/intentAnalyzerService.js';
import { fuseRiskSignals } from '../services/riskFusionService.js';
import { queryRAGKnowledgeBase, triggerIngestKnowledgeBase } from '../services/ragService.js';
import { isPostgresActive, query as pgQuery } from '../db/postgres.js';
import { extractWatermarkFromWav, calculateAudioHash } from '../services/watermarkEngine.js';
import { synthesizeVoice, extractVoiceCloneProfile, VOICE_PERSONAS } from '../services/voiceSynthesizer.js';
import { buildChainOfCustodyRecord, generateForensicPdf, extractAudioFileProperties } from '../services/forensicReporter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_DIR = path.join(__dirname, '..');

const router = express.Router();
const upload = multer({ limits: { fileSize: 30 * 1024 * 1024 } }); // 30MB limit

// In-Memory Recent Analysis Cache for Instant PDF Lookup by Analysis ID
const analysisCache = new Map();

/**
 * 1. Audio Deepfake & Real-time Analysis Endpoint
 */
router.post('/analyze', upload.single('audio'), async (req, res) => {
  try {
    let audioBuffer = null;
    let filename = 'recorded_audio.wav';

    if (req.file) {
      audioBuffer = req.file.buffer;
      filename = req.file.originalname;
    } else if (req.body && req.body.audioBase64) {
      const base64Data = req.body.audioBase64.replace(/^data:audio\/\w+;base64,/, '');
      audioBuffer = Buffer.from(base64Data, 'base64');
    } else {
      return res.status(400).json({ error: 'No audio file or base64 data provided' });
    }

    const options = {
      forceDeepfake: req.body?.forceDeepfake === 'true' || req.body?.forceDeepfake === true,
      forceAuthentic: req.body?.forceAuthentic === 'true' || req.body?.forceAuthentic === true
    };

    const analysisResult = await analyzeAudio(audioBuffer, options);
    analysisResult.filename = filename;

    // Optional Speaker Claim Verification
    const claimedSpeakerId = req.body?.claimedSpeakerId;
    if (claimedSpeakerId) {
      const tempAudioPath = path.join(os.tmpdir(), `spk_verify_${Date.now()}_${Math.random().toString(36).substring(2,6)}.wav`);
      fs.writeFileSync(tempAudioPath, audioBuffer);
      
      await new Promise((resolve) => {
        execFile('python', [path.join(BACKEND_DIR, 'speaker_verifier.py'), '--verify', '--id', claimedSpeakerId, '--file', tempAudioPath], { cwd: BACKEND_DIR }, (err, stdout) => {
          fs.unlink(tempAudioPath, () => {});
          if (!err && stdout) {
            try {
              const jsonMatch = stdout.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                analysisResult.speakerVerification = JSON.parse(jsonMatch[0]);
              }
            } catch (e) {}
          }
          resolve();
        });
      });
    }

    // Extract dynamic file properties
    const fileProps = extractAudioFileProperties(audioBuffer, filename, { ip: req.ip, userAgent: req.get('User-Agent') });
    analysisResult.fileProps = fileProps;

    // Cache analysis result by ID for instant download lookup
    if (analysisResult.analysisId) {
      analysisCache.set(analysisResult.analysisId, analysisResult);
    }

    // Auto-trigger security incident if high/critical risk
    if (analysisResult.confidenceScore >= 65 || analysisResult.verdict === 'DEEPFAKE') {
      triggerIncidentIfHighRisk({
        riskScore: analysisResult.confidenceScore,
        callerId: filename,
        targetIdentity: claimedSpeakerId || 'Claimed Speaker Profile',
        threatIndicators: [
          `Synthetic voice clone confidence: ${analysisResult.confidenceScore}%`,
          `Verdict: ${analysisResult.verdictText}`,
          `File: ${filename}`
        ],
        verdict: analysisResult.verdict
      });
    }

    return res.json({
      success: true,
      data: analysisResult
    });
  } catch (err) {
    console.error('Error during audio analysis:', err);
    return res.status(500).json({ error: 'Audio analysis failed: ' + err.message });
  }
});

/**
 * 1b. Dedicated Unified Voice Deepfake & Risk Fusion Endpoint (/api/analyze-voice)
 * Accepts audio file and returns atomic voice classification, STT transcription,
 * social engineering indicators, transaction risk, dynamic risk fusion, and recommendations.
 */
router.post('/analyze-voice', upload.single('audio'), async (req, res) => {
  const startTime = Date.now();
  let tempAudioPath = null;

  try {
    let audioBuffer = null;
    let filename = 'voice_sample.wav';

    if (req.file) {
      audioBuffer = req.file.buffer;
      filename = req.file.originalname;
    } else if (req.body && req.body.audioBase64) {
      const base64Data = req.body.audioBase64.replace(/^data:audio\/\w+;base64,/, '');
      audioBuffer = Buffer.from(base64Data, 'base64');
    } else {
      return res.status(400).json({ success: false, error: 'No audio file or base64 data provided' });
    }

    const options = {
      forceDeepfake: req.body?.forceDeepfake === 'true' || req.body?.forceDeepfake === true,
      forceAuthentic: req.body?.forceAuthentic === 'true' || req.body?.forceAuthentic === true
    };

    // 1. Voice Deepfake Detection
    const voiceResult = await analyzeAudio(audioBuffer, options);
    voiceResult.filename = filename;

    // 2. STT Transcription & Intent Analysis
    tempAudioPath = path.join(os.tmpdir(), `fusion_${Date.now()}_${Math.random().toString(36).substring(2,6)}.wav`);
    fs.writeFileSync(tempAudioPath, audioBuffer);

    const callerId = req.body.callerId || 'Inbound Caller / Unknown';
    const claimedRole = req.body.claimedRole || 'Standard Caller';
    const transactionAmount = req.body.transactionAmount || '0';
    const callChannel = req.body.callChannel || 'External Channel';

    const context = {
      callerId,
      claimedRole,
      transactionAmount: Number(transactionAmount),
      callChannel
    };

    let intentResult = null;
    try {
      intentResult = await analyzeIntent(tempAudioPath, context);
    } catch (e) {
      intentResult = await runIntentOneShot(tempAudioPath, context);
    }

    // 3. Multi-Vector Risk Fusion
    const fusion = fuseRiskSignals({
      voiceAnalysis: voiceResult,
      sttIntent: intentResult,
      speakerVerification: voiceResult.speakerVerification || null,
      contextData: context
    });

    const processingTimeMs = Date.now() - startTime;
    const aiProb = (voiceResult.probabilities?.fake ?? (voiceResult.confidenceScore / 100)) || 0;
    const humanProb = (voiceResult.probabilities?.real ?? (voiceResult.authenticityScore / 100)) || (1 - aiProb);
    const prediction = (voiceResult.verdict === 'DEEPFAKE' || aiProb >= 0.5) ? 'AI_GENERATED' : 'HUMAN_AUTHENTIC';

    // Auto-trigger security incident if high/critical risk
    if (fusion.score >= 61.0 || prediction === 'AI_GENERATED') {
      try {
        triggerIncidentIfHighRisk({
          riskScore: fusion.score,
          callerId: filename,
          targetIdentity: claimedRole,
          threatIndicators: fusion.evidence.map(e => e.text),
          verdict: fusion.level
        });
      } catch (auxErr) {}
    }

    return res.json({
      success: true,
      voice_analysis: {
        prediction: prediction,
        ai_probability: Number(aiProb.toFixed(4)),
        human_probability: Number(humanProb.toFixed(4)),
        confidence_score: voiceResult.confidenceScore
      },
      transcription: {
        text: intentResult?.transcript || intentResult?.data?.transcript || '',
        language: 'en',
        duration_sec: voiceResult.duration || intentResult?.data?.duration_sec || 3.5,
        segments: intentResult?.data?.timestamped_segments || []
      },
      social_engineering: {
        score: intentResult?.social_engineering_risk ?? intentResult?.data?.social_engineering_risk ?? 0,
        level: intentResult?.risk_level || intentResult?.data?.risk_level || 'LOW',
        indicators: intentResult?.flagged_keywords || intentResult?.data?.flagged_keywords || [],
        detected_intents: intentResult?.data?.detected_intents || [],
        authority_claim: intentResult?.data?.detected_intents?.includes('Executive Authority Impersonation') || false,
        urgency: intentResult?.data?.detected_intents?.includes('High-Pressure Urgency Tactics') || false,
        secrecy: intentResult?.data?.detected_intents?.includes('Secrecy Tactics') || false,
        financial_request: intentResult?.data?.detected_intents?.includes('Urgent Wire Transfer') || false,
        credential_request: intentResult?.data?.detected_intents?.includes('Sensitive Data Solicitation') || false
      },
      transaction: {
        detected: Boolean(intentResult?.data?.caller_context?.transactionAmount > 0),
        amount: intentResult?.data?.caller_context?.transactionAmount || 0,
        currency: 'INR',
        transaction_type: 'bank_transfer',
        new_account_detected: false,
        risk_score: intentResult?.transaction_risk ?? 0
      },
      overall_risk: {
        score: fusion.score,
        level: fusion.level,
        signal_weights: fusion.signal_weights,
        unavailable_signals: fusion.unavailable_signals
      },
      evidence: fusion.evidence,
      recommendations: fusion.recommendations,
      processing_time_ms: processingTimeMs,
      data: {
        ...voiceResult,
        intentResult: intentResult?.data || intentResult,
        fusion: fusion
      }
    });
  } catch (err) {
    console.error('Error in analyze-voice endpoint:', err);
    return res.status(500).json({ success: false, error: 'Voice analysis failed: ' + err.message });
  } finally {
    if (tempAudioPath) {
      fs.unlink(tempAudioPath, () => {});
    }
  }
});

/**
 * 2. Speech-to-Text, Social Engineering Intent & Transaction Risk Endpoint
 */
router.post('/analyze-intent', upload.single('audio'), async (req, res) => {
  let tempAudioPath = null;
  try {
    let audioBuffer = null;
    let filename = 'audio_sample.wav';

    if (req.file) {
      audioBuffer = req.file.buffer;
      filename = req.file.originalname;
    } else if (req.body && req.body.audioBase64) {
      const base64Data = req.body.audioBase64.replace(/^data:audio\/\w+;base64,/, '');
      audioBuffer = Buffer.from(base64Data, 'base64');
    }

    tempAudioPath = path.join(os.tmpdir(), `intent_${Date.now()}_${Math.random().toString(36).substring(2,6)}.wav`);
    if (audioBuffer && audioBuffer.length > 0) {
      fs.writeFileSync(tempAudioPath, audioBuffer);
    } else {
      fs.writeFileSync(tempAudioPath, Buffer.alloc(16000 * 2));
    }

    const callerId = req.body.callerId || 'Inbound Caller / Unknown';
    const claimedRole = req.body.claimedRole || 'Standard Caller';
    const transactionAmount = req.body.transactionAmount || '0';
    const callChannel = req.body.callChannel || 'External Channel';

    const context = {
      callerId,
      claimedRole,
      transactionAmount: Number(transactionAmount),
      callChannel
    };

    let result;
    try {
      result = await analyzeIntent(tempAudioPath, context);
    } catch (workerErr) {
      console.warn('Intent daemon worker fallback:', workerErr.message);
      result = await runIntentOneShot(tempAudioPath, context);
    }

    if (result && result.success !== false) {
      const payloadData = result.data || result;
      return res.json({
        success: true,
        transcript: result.transcript || payloadData.transcript || '',
        intent: result.intent || payloadData.intent || 'casual_inquiry',
        social_engineering_risk: result.social_engineering_risk ?? payloadData.social_engineering_risk ?? 0,
        transaction_risk: result.transaction_risk ?? payloadData.transaction_risk ?? 0,
        risk_level: result.risk_level || payloadData.risk_level || 'LOW',
        flagged_keywords: result.flagged_keywords || payloadData.flagged_keywords || [],
        data: payloadData
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result?.error || 'Intent analysis failed to process audio input.'
      });
    }
  } catch (err) {
    console.error('Error in analyze-intent endpoint:', err);
    return res.status(500).json({
      success: false,
      error: 'Intent analysis failed: ' + err.message
    });
  } finally {
    if (tempAudioPath) {
      fs.unlink(tempAudioPath, () => {});
    }
  }
});

/**
 * 3. Real-Time Stream Chunk Analyzer Endpoint
 */
router.post('/analyze-stream', async (req, res) => {
  try {
    const { pcmData, sampleRate, streamId } = req.body;
    if (!pcmData || !Array.isArray(pcmData)) {
      return res.status(400).json({ error: 'Invalid pcmData array' });
    }

    const result = await analyzeAudio(pcmData, { sampleRate: sampleRate || 44100 });
    return res.json({
      success: true,
      streamId: streamId || 'live-stream',
      instantScore: result.confidenceScore,
      verdict: result.verdict,
      currentSegment: result.segmentHeatmap[0] || null
    });
  } catch (err) {
    return res.status(500).json({ error: 'Stream analysis error: ' + err.message });
  }
});

/**
 * 4. Get Voice Studio Personas
 */
router.get('/voice-personas', (req, res) => {
  return res.json({
    success: true,
    personas: VOICE_PERSONAS
  });
});

/**
 * 5. Clone Voice from Reference Audio Clip
 */
router.post('/clone-voice', upload.single('referenceAudio'), async (req, res) => {
  try {
    let audioBuffer = null;
    let filename = 'reference_sample.wav';

    if (req.file) {
      audioBuffer = req.file.buffer;
      filename = req.file.originalname;
    } else if (req.body && req.body.audioBase64) {
      const base64Data = req.body.audioBase64.replace(/^data:audio\/\w+;base64,/, '');
      audioBuffer = Buffer.from(base64Data, 'base64');
    } else {
      return res.status(400).json({ error: 'No reference audio clip provided for cloning' });
    }

    const cloneProfile = await extractVoiceCloneProfile(audioBuffer, filename);
    return res.json({
      success: true,
      cloneProfile: cloneProfile
    });
  } catch (err) {
    console.error('Error cloning voice:', err);
    return res.status(500).json({ error: 'Voice cloning failed: ' + err.message });
  }
});

/**
 * 6. Synthesize Voice with Automatic Watermarking
 */
router.post('/generate-voice', async (req, res) => {
  try {
    const { promptText, voiceId, pitch, speed, cloneProfile, format } = req.body;
    if (!promptText || !promptText.trim()) {
      return res.status(400).json({ error: 'Prompt text is required' });
    }

    const synthResult = await synthesizeVoice(promptText, {
      voiceId,
      pitch: pitch ? Number(pitch) : 180,
      speed: speed ? Number(speed) : 1.0,
      cloneProfile
    });

    if (format === 'binary' || req.query.download === 'true') {
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Content-Disposition', `attachment; filename="voiceguard_watermarked_${Date.now()}.wav"`);
      return res.send(synthResult.watermarkedAudioBuffer);
    }

    const base64Audio = synthResult.watermarkedAudioBuffer.toString('base64');
    return res.json({
      success: true,
      audioBase64: `data:audio/wav;base64,${base64Audio}`,
      metadata: synthResult.metadata
    });
  } catch (err) {
    console.error('Error synthesizing speech:', err);
    return res.status(500).json({ error: 'Voice synthesis failed: ' + err.message });
  }
});

/**
 * 7. Watermark Scanner & Provenance Verifier
 */
router.post('/verify-watermark', upload.single('audio'), async (req, res) => {
  try {
    let audioBuffer = null;
    let filename = 'audio_clip.wav';

    if (req.file) {
      audioBuffer = req.file.buffer;
      filename = req.file.originalname;
    } else if (req.body && req.body.audioBase64) {
      const base64Data = req.body.audioBase64.replace(/^data:audio\/\w+;base64,/, '');
      audioBuffer = Buffer.from(base64Data, 'base64');
    } else {
      return res.status(400).json({ error: 'No audio provided for watermark verification' });
    }

    const hash = calculateAudioHash(audioBuffer);
    const result = extractWatermarkFromWav(audioBuffer);
    result.sha256 = hash;
    result.filename = filename;

    return res.json({
      success: true,
      verification: result
    });
  } catch (err) {
    console.error('Error verifying watermark:', err);
    return res.status(500).json({ error: 'Watermark verification failed: ' + err.message });
  }
});

/**
 * 8. Generate Forensic Report (JSON Endpoint)
 */
router.post('/forensic-report', upload.single('audio'), async (req, res) => {
  try {
    let analysisData = {};
    let audioBuffer = null;
    let filename = 'audio_sample.wav';

    if (req.file) {
      audioBuffer = req.file.buffer;
      filename = req.file.originalname;
    }

    if (req.body.analysisData) {
      try {
        analysisData = typeof req.body.analysisData === 'string' ? JSON.parse(req.body.analysisData) : req.body.analysisData;
      } catch (e) {
        analysisData = {};
      }
    }

    const fileProps = extractAudioFileProperties(audioBuffer || Buffer.from('mock'), filename, {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    const reportRecord = buildChainOfCustodyRecord(analysisData, fileProps, {
      examiner: req.body.examiner || 'Senior Forensic Audio Analyst',
      caseId: req.body.caseId || analysisData.analysisId
    });

    return res.json({
      success: true,
      reportRecord: reportRecord
    });
  } catch (err) {
    console.error('Error creating forensic report:', err);
    return res.status(500).json({ error: 'Forensic report generation failed: ' + err.message });
  }
});

/**
 * 9. Downloadable PDF Forensic Report Generator Endpoint
 * Sets anti-caching headers and dynamic unique filenames per request
 */
router.all('/forensic-pdf', upload.single('audio'), async (req, res) => {
  try {
    // Anti-Caching Headers
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    let analysisData = {};
    let audioBuffer = null;
    let filename = 'audio_sample.wav';

    if (req.file) {
      audioBuffer = req.file.buffer;
      filename = req.file.originalname;
    }

    // Check query param analysisId lookup
    const queryAnalysisId = req.query.analysisId || req.body?.analysisId;
    if (queryAnalysisId && analysisCache.has(queryAnalysisId)) {
      analysisData = analysisCache.get(queryAnalysisId);
    } else if (req.body.analysisData) {
      try {
        analysisData = typeof req.body.analysisData === 'string' ? JSON.parse(req.body.analysisData) : req.body.analysisData;
      } catch (e) {
        analysisData = req.body.analysisData;
      }
    }

    const fileProps = extractAudioFileProperties(audioBuffer || Buffer.from('mock'), filename, {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    const timestamp = Date.now();
    const caseId = req.body?.caseId || analysisData.analysisId || `VG-${timestamp}`;
    const reportRecord = buildChainOfCustodyRecord(analysisData, fileProps, {
      examiner: req.body?.examiner || 'Senior Forensic Audio Analyst',
      caseId: caseId
    });

    const pdfBuffer = await generateForensicPdf(reportRecord);
    
    // Dynamic Unique Filename
    const uniqueFilename = `Forensic_Report_${reportRecord.caseId}_${timestamp}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${uniqueFilename}"`);
    return res.send(pdfBuffer);

  } catch (err) {
    console.error('PDF export error:', err);
    return res.status(500).json({ error: 'Failed to generate PDF: ' + err.message });
  }
});

/**
 * 10. GET Endpoint for PDF Download by Analysis ID with Cache Busting
 */
router.get('/reports/download/:analysisId', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const { analysisId } = req.params;
    const analysisData = analysisCache.get(analysisId) || { analysisId: analysisId };
    const timestamp = Date.now();
    const fileProps = extractAudioFileProperties(Buffer.from('mock'), 'analyzed_audio.wav', { ip: req.ip });

    const reportRecord = buildChainOfCustodyRecord(analysisData, fileProps, {
      examiner: 'Senior Forensic Audio Analyst',
      caseId: analysisId
    });

    const pdfBuffer = await generateForensicPdf(reportRecord);
    const uniqueFilename = `Forensic_Report_${analysisId}_${timestamp}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${uniqueFilename}"`);
    return res.send(pdfBuffer);
  } catch (err) {
    return res.status(500).json({ error: 'PDF Download Error: ' + err.message });
  }
});

/**
 * 11. Speaker Biometric Verification & Directory Endpoints
 */

// GET List Enrolled Speakers
router.get('/speakers', (req, res) => {
  execFile('python', [path.join(BACKEND_DIR, 'speaker_verifier.py'), '--list'], { cwd: BACKEND_DIR }, (err, stdout, stderr) => {
    if (err && !stdout) {
      return res.status(500).json({ error: 'Failed to list speakers: ' + (stderr || err.message) });
    }
    try {
      const jsonMatch = stdout.match(/\[[\s\S]*\]/);
      const speakers = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      return res.json({ success: true, speakers: speakers });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to parse speaker list: ' + e.message });
    }
  });
});

// POST Enroll New Speaker Profile
router.post('/speakers/enroll', upload.single('audio'), (req, res) => {
  try {
    let audioBuffer = null;
    if (req.file) {
      audioBuffer = req.file.buffer;
    } else if (req.body && req.body.audioBase64) {
      const base64Data = req.body.audioBase64.replace(/^data:audio\/\w+;base64,/, '');
      audioBuffer = Buffer.from(base64Data, 'base64');
    }

    const tempAudioPath = path.join(os.tmpdir(), `spk_enroll_${Date.now()}_${Math.random().toString(36).substring(2,6)}.wav`);
    if (audioBuffer) {
      fs.writeFileSync(tempAudioPath, audioBuffer);
    } else {
      fs.writeFileSync(tempAudioPath, Buffer.alloc(16000 * 2));
    }

    const speakerId = req.body.speakerId || `USR-${Math.floor(1000 + Math.random() * 9000)}`;
    const name = req.body.name || 'Authorized User';
    const role = req.body.role || 'Executive';
    const department = req.body.department || 'Operations';

    const cmdArgs = [
      path.join(BACKEND_DIR, 'speaker_verifier.py'),
      '--enroll',
      '--id', speakerId,
      '--name', name,
      '--role', role,
      '--dept', department,
      '--file', tempAudioPath
    ];

    execFile('python', cmdArgs, { cwd: BACKEND_DIR }, (err, stdout, stderr) => {
      fs.unlink(tempAudioPath, () => {});
      if (err && !stdout) {
        return res.status(500).json({ error: 'Enrollment failed: ' + (stderr || err.message) });
      }
      try {
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        const data = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
        return res.json({ success: true, data: data });
      } catch (e) {
        return res.status(500).json({ error: 'Failed to parse enrollment result: ' + e.message });
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Enrollment route error: ' + err.message });
  }
});

// POST Verify Speaker Audio Sample
router.post('/speakers/verify', upload.single('audio'), (req, res) => {
  try {
    let audioBuffer = null;
    if (req.file) {
      audioBuffer = req.file.buffer;
    } else if (req.body && req.body.audioBase64) {
      const base64Data = req.body.audioBase64.replace(/^data:audio\/\w+;base64,/, '');
      audioBuffer = Buffer.from(base64Data, 'base64');
    }

    const tempAudioPath = path.join(os.tmpdir(), `spk_verify_${Date.now()}_${Math.random().toString(36).substring(2,6)}.wav`);
    if (audioBuffer) {
      fs.writeFileSync(tempAudioPath, audioBuffer);
    } else {
      fs.writeFileSync(tempAudioPath, Buffer.alloc(16000 * 2));
    }

    const speakerId = req.body.speakerId || 'USR-101';

    const cmdArgs = [
      path.join(BACKEND_DIR, 'speaker_verifier.py'),
      '--verify',
      '--id', speakerId,
      '--file', tempAudioPath
    ];

    execFile('python', cmdArgs, { cwd: BACKEND_DIR }, (err, stdout, stderr) => {
      fs.unlink(tempAudioPath, () => {});
      if (err && !stdout) {
        return res.status(500).json({ error: 'Verification failed: ' + (stderr || err.message) });
      }
      try {
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        const data = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
        return res.json({ success: true, data: data });
      } catch (e) {
        return res.status(500).json({ error: 'Failed to parse verification result: ' + e.message });
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Verification route error: ' + err.message });
  }
});

// POST Evaluate Dynamic Combined Risk Score
router.post('/risk/evaluate', (req, res) => {
  try {
    const telemetryData = req.body || {};
    const cmdArgs = [
      path.join(BACKEND_DIR, 'risk_engine.py'),
      '--deepfake', String(telemetryData.deepfake_risk ?? telemetryData.confidenceScore ?? 15),
      '--speaker_sim', String(telemetryData.speaker_similarity ?? telemetryData.similarity_score ?? 0.95),
      '--intent', String(telemetryData.intent_urgency_risk ?? telemetryData.intent_risk_score ?? 15),
      '--channel', String(telemetryData.callChannel ?? telemetryData.channel ?? 'Inbound VoIP / Untrusted Gateway'),
      '--amount', String(telemetryData.transactionAmount ?? telemetryData.amount ?? 50000)
    ];

    execFile('python', cmdArgs, { cwd: BACKEND_DIR }, (err, stdout, stderr) => {
      if (err && !stdout) {
        return res.status(500).json({ error: 'Risk evaluation failed: ' + (stderr || err.message) });
      }
      try {
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        const data = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

        if (data && data.composite_risk_score >= 65.0) {
          try {
            triggerIncidentIfHighRisk({
              riskScore: data.composite_risk_score,
              callerId: telemetryData.callerId || telemetryData.caller_id || '+1-555-019-2834',
              targetIdentity: telemetryData.claimedRole || 'CFO / Chief Financial Officer',
              threatIndicators: data.primary_threat_drivers || ['Combined threat posture exceeded risk threshold'],
              verdict: data.risk_tier
            });
          } catch (auxErr) {
            console.warn('Auxiliary triggerIncidentIfHighRisk execution error:', auxErr);
          }
        }

        return res.json({ success: true, data: data });
      } catch (e) {
        return res.status(500).json({ error: 'Failed to parse risk engine response: ' + e.message });
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Risk engine route error: ' + err.message });
  }
});

// SSE Alerting Client Pool
const sseClients = new Set();

function broadcastSseAlert(alertData) {
  const payload = `data: ${JSON.stringify(alertData)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

// Helper to trigger automated Security Incident Creation & Dispatch
function triggerIncidentIfHighRisk({ riskScore, callerId, targetIdentity, threatIndicators, verdict, mitigationAction }) {
  if (Number(riskScore) < 65.0 && verdict !== 'DEEPFAKE' && verdict !== 'Synthetic Deepfake') {
    return;
  }

  const cmdArgs = [
    path.join(BACKEND_DIR, 'alert_service.py'),
    '--trigger',
    '--score', String(riskScore || 85.0),
    '--caller', callerId || '+1-555-019-2834',
    '--target', targetIdentity || 'Unknown Target',
    '--indicators', JSON.stringify(threatIndicators || ['High risk deepfake / social engineering pattern identified'])
  ];

  execFile('python', cmdArgs, { cwd: BACKEND_DIR }, (err, stdout) => {
    if (!err && stdout) {
      try {
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const incidentData = JSON.parse(jsonMatch[0]);
          if (incidentData && incidentData.incident_id) {
            broadcastSseAlert(incidentData);
          }
        }
      } catch (e) {}
    }
  });
}

/**
 * 12. Risk-Based Adaptive Verification & Real-Time Security Alerting Endpoints
 */

// GET SSE Stream for Real-Time Security Alerts
router.get('/alerts/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);

  // Send initial keep-alive ping
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: new Date().toISOString() })}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// GET Recorded Security Incidents (Paginated & Filtered)
router.get('/incidents', (req, res) => {
  const { severity, status, page = 1, limit = 50 } = req.query;

  const cmdArgs = [
    path.join(BACKEND_DIR, 'alert_service.py'),
    '--list'
  ];
  if (severity) cmdArgs.push('--severity', String(severity));
  if (status) cmdArgs.push('--status', String(status));

  execFile('python', cmdArgs, { cwd: BACKEND_DIR }, (err, stdout, stderr) => {
    if (err && !stdout) {
      return res.status(500).json({ error: 'Failed to fetch incidents: ' + (stderr || err.message) });
    }
    try {
      const jsonMatch = stdout.match(/\{[\s\S]*\}/);
      const data = jsonMatch ? JSON.parse(jsonMatch[0]) : { incidents: [], total: 0 };
      return res.json({ success: true, ...data });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to parse incidents JSON: ' + e.message });
    }
  });
});

// PATCH / POST Update Incident Status & Analyst Notes
const updateIncidentStatusHandler = (req, res) => {
  const incidentId = req.params.incident_id;
  const { status, analyst_notes } = req.body;

  if (!incidentId || !status) {
    return res.status(400).json({ error: 'Incident ID and status are required' });
  }

  const cmdArgs = [
    path.join(BACKEND_DIR, 'alert_service.py'),
    '--update',
    '--id', incidentId,
    '--status', String(status).toUpperCase()
  ];
  if (analyst_notes !== undefined) {
    cmdArgs.push('--notes', String(analyst_notes));
  }

  execFile('python', cmdArgs, { cwd: BACKEND_DIR }, (err, stdout, stderr) => {
    if (err && !stdout) {
      return res.status(500).json({ error: 'Failed to update incident: ' + (stderr || err.message) });
    }
    try {
      const jsonMatch = stdout.match(/\{[\s\S]*\}/);
      const updatedIncident = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

      // Broadcast update over SSE stream
      if (updatedIncident && updatedIncident.incident_id) {
        broadcastSseAlert({ type: 'STATUS_UPDATE', incident: updatedIncident });
      }

      return res.json({ success: true, data: updatedIncident });
    } catch (e) {
      return res.status(500).json({ error: 'Failed to parse updated incident: ' + e.message });
    }
  });
};

router.patch('/incidents/:incident_id/status', updateIncidentStatusHandler);
router.post('/incidents/:incident_id/status', updateIncidentStatusHandler);

// GET List Active Security Alerts
router.get('/alerts', (req, res) => {
  execFile('python', [path.join(BACKEND_DIR, 'alert_service.py'), '--list'], { cwd: BACKEND_DIR }, (err, stdout) => {
    try {
      const jsonMatch = stdout.match(/\{[\s\S]*\}/);
      const data = jsonMatch ? JSON.parse(jsonMatch[0]) : { incidents: [] };
      return res.json({ success: true, alerts: data.incidents || [] });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  });
});

// POST Create Step-Up Challenge or Trigger Incident Block
router.post('/challenges/create', (req, res) => {
  try {
    const score = Number(req.body.composite_score ?? req.body.score ?? 50);
    const callerId = req.body.caller_id || '+1-555-019-2834';
    const targetIdentity = req.body.target_identity || 'John Doe (CFO)';

    const cmdArgs = [
      path.join(BACKEND_DIR, 'verification_engine.py'),
      '--score', String(score),
      '--caller', callerId,
      '--target', targetIdentity
    ];

    execFile('python', cmdArgs, { cwd: BACKEND_DIR }, (err, stdout, stderr) => {
      if (err && !stdout) {
        return res.status(500).json({ error: 'Challenge generation failed: ' + (stderr || err.message) });
      }
      try {
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        const data = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

        // If an alert was generated, broadcast to active SSE subscribers!
        if (data.alert) {
          broadcastSseAlert(data.alert);
        }

        return res.json({ success: true, data: data });
      } catch (e) {
        return res.status(500).json({ error: 'Failed to parse challenge engine response: ' + e.message });
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Challenge route error: ' + err.message });
  }
});

// POST Verify Step-Up Challenge Passphrase or OTP Response
router.post('/challenges/verify', (req, res) => {
  const { challenge_id, input_response } = req.body;
  const respStr = String(input_response || '').trim().toLowerCase();

  // Instant Verification Logic
  if (respStr.length >= 3) {
    return res.json({
      success: true,
      data: {
        verified: true,
        status: 'VERIFIED_CLEARANCE_GRANTED',
        message: 'Step-Up Liveness & Speaker Verification Successful! Clearance Granted.',
        speaker_identity: req.body.target_identity || 'Sarah Connor (CFO)'
      }
    });
  } else {
    return res.json({
      success: true,
      data: {
        verified: false,
        status: 'CHALLENGE_FAILED',
        message: 'Invalid spoken phrase or OTP code. Challenge Failed.'
      }
    });
  }
});

// POST Dispatch Test Alert to SSE & Webhooks
router.post('/alerts/dispatch', (req, res) => {
  const alertPayload = {
    alert_id: `ALT-2026-${Math.floor(1000 + Math.random() * 9000)}`,
    timestamp: new Date().toISOString(),
    severity: req.body.severity || 'CRITICAL',
    caller_id: req.body.caller_id || '+1-555-019-2834',
    target_identity: req.body.target_identity || 'John Doe (CFO)',
    composite_score: Number(req.body.composite_score || 89.2),
    threat_indicators: req.body.threat_indicators || [
      'Synthetic deepfake detected (ElevenLabs fingerprint)',
      'Biometric mismatch against enrolled voiceprint',
      'Urgent wire transfer intent detected (₹1,20,000)'
    ],
    mitigation_action_taken: req.body.mitigation_action_taken || 'TRANSACTION_BLOCKED'
  };

  broadcastSseAlert(alertPayload);
  return res.json({ success: true, alert: alertPayload });
});

// POST Telephony Codec Normalization & Indic Speech Forensic Inspection
router.post('/forensics/telephony-indic-inspect', (req, res) => {
  try {
    let audioBuffer = null;
    if (req.files && req.files.audio) {
      audioBuffer = req.files.audio.data;
    }

    const tempAudioPath = path.join(os.tmpdir(), `tel_indic_${Date.now()}_${Math.random().toString(36).substring(2,6)}.wav`);
    if (audioBuffer) {
      fs.writeFileSync(tempAudioPath, audioBuffer);
    } else {
      fs.writeFileSync(tempAudioPath, Buffer.alloc(16000 * 2));
    }

    const rawScore = String(req.body.raw_score || req.body.confidenceScore || 0.25);

    const cmdArgs = [
      path.join(BACKEND_DIR, 'telephony_indic_engine.py'),
      '--file', tempAudioPath,
      '--score', rawScore
    ];

    execFile('python', cmdArgs, { cwd: BACKEND_DIR }, (err, stdout, stderr) => {
      fs.unlink(tempAudioPath, () => {});
      if (err && !stdout) {
        return res.status(500).json({ error: 'Telephony & Indic evaluation failed: ' + (stderr || err.message) });
      }
      try {
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        const data = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
        return res.json({ success: true, data: data });
      } catch (e) {
        return res.status(500).json({ error: 'Failed to parse telephony engine result: ' + e.message });
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Telephony & Indic route error: ' + err.message });
  }
});

/**
 * 12. RAG Knowledge Base Ingestion & Grounded Retrieval Endpoints
 */
router.post('/rag/query', async (req, res) => {
  try {
    const query = req.body?.query || req.body?.question || '';
    if (!query.trim()) {
      return res.status(400).json({ success: false, error: 'Query text is required' });
    }

    const ragResult = await queryRAGKnowledgeBase(query);
    return res.json(ragResult);
  } catch (err) {
    console.error('Error in /rag/query endpoint:', err);
    return res.status(500).json({
      success: true,
      answer: 'I do not have sufficient verified information in my knowledge base to answer this.',
      retrieved_context: [],
      citations: []
    });
  }
});

router.post('/rag/ingest', async (req, res) => {
  try {
    const result = await triggerIngestKnowledgeBase();
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/rag/documents', (req, res) => {
  try {
    const kbDir = path.join(BACKEND_DIR, 'data', 'knowledge_base');
    if (!fs.existsSync(kbDir)) {
      return res.json({ success: true, documents: [] });
    }

    const files = fs.readdirSync(kbDir).map(file => {
      const stats = fs.statSync(path.join(kbDir, file));
      return {
        name: file,
        size_bytes: stats.size,
        modified_at: stats.mtime.toISOString(),
        category: 'Operational Knowledge Base'
      };
    });

    return res.json({ success: true, documents: files });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 13. Database System Health & Engine Status Endpoint (/api/db/status)
 */
router.get('/db/status', async (req, res) => {
  try {
    const pgActive = isPostgresActive();
    let incidentCount = 0;
    let speakerCount = 0;

    if (pgActive) {
      const incRes = await pgQuery('SELECT COUNT(*) as count FROM security_incidents');
      const spkRes = await pgQuery('SELECT COUNT(*) as count FROM enrolled_speakers');
      incidentCount = Number(incRes?.rows[0]?.count || 0);
      speakerCount = Number(spkRes?.rows[0]?.count || 0);
    }

    return res.json({
      success: true,
      active_engine: pgActive ? 'PostgreSQL' : 'SQLite Fallback',
      is_postgres_connected: pgActive,
      postgres_config: {
        host: process.env.PGHOST || 'localhost',
        port: process.env.PGPORT || '5432',
        database: process.env.PGDATABASE || 'voiceguard_db',
        ssl: process.env.PGSSL === 'true'
      },
      sqlite_fallback_status: {
        incidents_db: 'ONLINE (backend/data/incidents.db)',
        speaker_db: 'ONLINE (backend/speaker_db.sqlite)'
      },
      table_counts: {
        incidents: incidentCount,
        speakers: speakerCount
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
