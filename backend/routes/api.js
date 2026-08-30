import express from 'express';
import multer from 'multer';
import { analyzeAudio } from '../services/audioAnalyzer.js';
import { extractWatermarkFromWav, calculateAudioHash } from '../services/watermarkEngine.js';
import { synthesizeVoice, extractVoiceCloneProfile, VOICE_PERSONAS } from '../services/voiceSynthesizer.js';
import { buildChainOfCustodyRecord, generateForensicPdf, extractAudioFileProperties } from '../services/forensicReporter.js';

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

    // Extract dynamic file properties
    const fileProps = extractAudioFileProperties(audioBuffer, filename, { ip: req.ip, userAgent: req.get('User-Agent') });
    analysisResult.fileProps = fileProps;

    // Cache analysis result by ID for instant download lookup
    if (analysisResult.analysisId) {
      analysisCache.set(analysisResult.analysisId, analysisResult);
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
 * 2. Real-Time Stream Chunk Analyzer Endpoint
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
 * 3. Get Voice Studio Personas
 */
router.get('/voice-personas', (req, res) => {
  return res.json({
    success: true,
    personas: VOICE_PERSONAS
  });
});

/**
 * 4. Clone Voice from Reference Audio Clip
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
 * 5. Synthesize Voice with Automatic Watermarking
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
 * 6. Watermark Scanner & Provenance Verifier
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
 * 7. Generate Forensic Report (JSON Endpoint)
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
 * 8. Downloadable PDF Forensic Report Generator Endpoint
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
 * 9. GET Endpoint for PDF Download by Analysis ID with Cache Busting
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

export default router;
