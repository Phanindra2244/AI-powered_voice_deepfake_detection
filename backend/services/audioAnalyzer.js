import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import {
  extractWatermarkFromWav,
  calculateAudioHash
} from './watermarkEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DETECTOR_PY_PATH = path.join(__dirname, '../detector.py');

/**
 * Run the real Python deepfake detector.
 *
 * IMPORTANT:
 * There is NO fake JS fallback here.
 * If the Python detector fails, we return an error instead of
 * generating an artificial Real/Fake score.
 */
function runPythonDetector(audioBuffer) {
  return new Promise((resolve, reject) => {
    const tempFile = path.join(
      os.tmpdir(),
      `trutone_audio_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 8)}.wav`
    );

    try {
      const buffer = Buffer.isBuffer(audioBuffer)
        ? audioBuffer
        : Buffer.from(audioBuffer || '');

      if (!buffer.length) {
        return reject(new Error('Audio buffer is empty'));
      }

      fs.writeFileSync(tempFile, buffer);
    } catch (error) {
      return reject(
        new Error(`Failed to write temporary audio file: ${error.message}`)
      );
    }

    execFile(
      'python',
      [DETECTOR_PY_PATH, '--file', tempFile],
      {
        maxBuffer: 20 * 1024 * 1024,
        windowsHide: true
      },
      (error, stdout, stderr) => {
        // Always remove temporary file
        fs.unlink(tempFile, () => { });

        if (error) {
          console.error(
            '[AUDIO ANALYZER] Python detector error:',
            stderr || error.message
          );

          return reject(
            new Error(
              `Python detector execution failed: ${stderr || error.message
              }`
            )
          );
        }

        if (!stdout || !stdout.trim()) {
          return reject(
            new Error('Python detector returned empty output')
          );
        }

        try {
          /*
           * detector.py prints logs before the final JSON.
           * Find the final JSON object.
           */
          const jsonStart = stdout.lastIndexOf('{');

          if (jsonStart === -1) {
            return reject(
              new Error(
                `Invalid detector output. stdout:\n${stdout}`
              )
            );
          }

          /*
           * Because nested JSON objects can exist, first try the
           * complete stdout JSON extraction.
           */
          let parsedData;

          try {
            const firstBrace = stdout.indexOf('{');
            const jsonText = stdout.substring(firstBrace).trim();
            parsedData = JSON.parse(jsonText);
          } catch {
            /*
             * Fallback: find JSON-looking object boundaries.
             */
            const matches = stdout.match(/\{[\s\S]*\}/g);

            if (!matches || !matches.length) {
              throw new Error(
                `Could not locate JSON in detector output:\n${stdout}`
              );
            }

            parsedData = JSON.parse(matches[matches.length - 1]);
          }

          resolve(parsedData);
        } catch (parseError) {
          console.error(
            '[AUDIO ANALYZER] Detector JSON parse error:',
            parseError.message
          );

          console.error(
            '[AUDIO ANALYZER] Detector stdout:',
            stdout
          );

          reject(
            new Error(
              `Failed to parse Python detector output: ${parseError.message}`
            )
          );
        }
      }
    );
  });
}

/**
 * Main Audio Analysis Pipeline
 *
 * Pipeline:
 *
 * Audio
 *   ↓
 * Python detector
 *   ↓
 * Audio quality analysis
 *   ↓
 * Speech / noise / silence separation
 *   ↓
 * Usable speech
 *   ↓
 * Deepfake model
 *   ↓
 * Final result
 *
 * Noise and silence are NOT used as deepfake evidence.
 */
export async function analyzeAudio(audioBuffer, options = {}) {
  const buffer = Buffer.isBuffer(audioBuffer)
    ? audioBuffer
    : Buffer.from(audioBuffer || '');

  if (!buffer.length) {
    throw new Error('No audio data received');
  }

  const fileHash = calculateAudioHash(buffer);

  let watermarkResult = {
    found: false
  };

  try {
    watermarkResult = extractWatermarkFromWav(buffer);
  } catch (watermarkError) {
    console.warn(
      '[AUDIO ANALYZER] Watermark extraction skipped:',
      watermarkError.message
    );
  }

  /*
   * Run the actual Python AI detector.
   */
  let pyResult;

  try {
    pyResult = await runPythonDetector(buffer);
  } catch (pythonError) {
    /*
     * IMPORTANT:
     * Do NOT create a fake Real/Fake result here.
     */
    console.error(
      '[AUDIO ANALYZER] Python detector unavailable:',
      pythonError.message
    );

    return {
      analysisId:
        'ANA-' + fileHash.substring(0, 8).toUpperCase(),

      timestamp: new Date().toISOString(),

      status: 'DETECTOR_ERROR',

      verdict: 'UNAVAILABLE',

      verdictText: 'AI Deepfake Detection Unavailable',

      verdictSeverity: 'warning',

      confidenceScore: null,

      authenticityScore: null,

      probabilities: {
        fake: null,
        real: null
      },

      explanationSummary:
        'The AI deepfake detector could not analyze this recording. No Real/Fake decision was generated.',

      error: pythonError.message,

      fileHash,

      watermark: watermarkResult,

      noiseAnalysis: null,

      detector: {
        available: false,
        used: false
      }
    };
  }

  /*
   * Attach common metadata.
   */
  pyResult.analysisId =
    'ANA-' + fileHash.substring(0, 8).toUpperCase();

  pyResult.timestamp = new Date().toISOString();

  pyResult.fileHash = fileHash;

  /*
   * Watermark result is kept separate from the AI prediction.
   */
  pyResult.watermark = watermarkResult;

  /*
   * If the uploaded/generated audio contains our verified
   * watermark, that is an independent verification signal.
   */
  if (watermarkResult.found) {
    pyResult.watermark = {
      ...watermarkResult,
      verified: true
    };

    /*
     * Do not overwrite the model probability.
     *
     * The watermark is evidence that the audio was generated
     * or signed by our system, but it should remain separate
     * from the model's deepfake probability.
     */
    pyResult.verification = {
      watermarkDetected: true,
      message:
        'TRUETONE-generated/signed audio watermark detected.'
    };
  } else {
    pyResult.verification = {
      watermarkDetected: false,
      message:
        'No TRUETONE watermark was detected.'
    };
  }

  /*
   * Force options are kept for development/testing only.
   *
   * They should NOT be used in normal production analysis.
   */
  if (options.forceDeepfake) {
    pyResult.verdict = 'DEEPFAKE';
    pyResult.verdictText = 'Synthetic / AI Deepfake Detected';
    pyResult.confidenceScore = 96.5;
    pyResult.authenticityScore = 3.5;

    pyResult.probabilities = {
      fake: 0.965,
      real: 0.035
    };

    pyResult.testMode = true;
  }

  if (options.forceAuthentic) {
    pyResult.verdict = 'AUTHENTIC';
    pyResult.verdictText = 'Authentic Real Voice';
    pyResult.confidenceScore = 95.8;
    pyResult.authenticityScore = 4.2;

    pyResult.probabilities = {
      fake: 0.042,
      real: 0.958
    };

    pyResult.testMode = true;
  }

  /*
   * Normalize detector information for the website.
   */
  pyResult.detector = {
    available: true,
    used: true,
    model:
      'garystafford/wav2vec2-deepfake-voice-detector',
    noiseExcludedFromDeepfakeCalculation: true
  };

  /*
   * Make sure audio-quality information is clearly exposed
   * to the frontend.
   */
  if (pyResult.audioQuality) {
    pyResult.noiseAnalysis = {
      ...pyResult.audioQuality,

      includedInDeepfakeCalculation: false
    };
  }

  if (pyResult.noise) {
    pyResult.noiseAnalysis = {
      ...pyResult.noise,

      includedInDeepfakeCalculation: false
    };
  }

  /*
   * If detector.py says there isn't enough usable speech,
   * don't convert that into Real/Fake.
   */
  if (
    pyResult.verdict === 'INSUFFICIENT_SPEECH' ||
    pyResult.status === 'INSUFFICIENT_SPEECH'
  ) {
    pyResult.verdict = 'INSUFFICIENT_SPEECH';

    pyResult.verdictText =
      'Not Enough Usable Speech';

    pyResult.verdictSeverity = 'warning';

    pyResult.explanationSummary =
      'There is not enough clear speech in this recording for a reliable deepfake analysis. Background noise and silence are excluded from the deepfake calculation.';
  }

  return pyResult;
}