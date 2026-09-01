import crypto from 'crypto';

/**
 * VoiceGuard Audio Watermarking Engine
 * Supports RIFF Chunk steganographic payload injection & extraction,
 * digital signatures, and SHA-256 integrity verification.
 */

const WATERMARK_CHUNK_ID = 'vgwd'; // VoiceGuard Watermark Marker
const SECRET_KEY = 'VoiceGuard-Security-Key-2026-SuperSecretKey';

export function createWatermarkPayload(metadata) {
  const payload = {
    platform: 'TRUETONE AI Security Studio',
    version: '2.4.0',
    timestamp: metadata.timestamp || new Date().toISOString(),
    voiceId: metadata.voiceId || 'persona-synth-01',
    textPrompt: metadata.textPrompt || '',
    textHash: crypto.createHash('sha256').update(metadata.textPrompt || '').digest('hex').substring(0, 16),
    creator: metadata.creator || 'Admin Examiner',
    watermarkId: 'TT-' + Math.random().toString(36).substring(2, 10).toUpperCase(),
  };

  // Sign payload
  const signBase = `${payload.watermarkId}:${payload.timestamp}:${payload.voiceId}:${payload.textHash}`;
  payload.signature = crypto.createHmac('sha256', SECRET_KEY).update(signBase).digest('hex');

  return payload;
}

/**
 * Embeds watermark metadata as a custom RIFF chunk inside a WAV buffer
 */
export function embedWatermarkToWav(wavBuffer, metadataPayload) {
  const payloadJson = JSON.stringify(metadataPayload);
  const payloadBytes = Buffer.from(payloadJson, 'utf8');

  // RIFF chunk header: 4 bytes Chunk ID ('vgwd'), 4 bytes Chunk Size (uint32 LE), then Payload
  const chunkHeader = Buffer.alloc(8);
  chunkHeader.write(WATERMARK_CHUNK_ID, 0, 4, 'ascii');
  chunkHeader.writeUInt32LE(payloadBytes.length, 4);

  // Pad payload to even byte length if odd (RIFF standard)
  const padByte = (payloadBytes.length % 2 !== 0) ? Buffer.from([0]) : Buffer.alloc(0);

  // Combine original WAV with new chunk
  // Update main RIFF header size (bytes 4..8)
  const newWavBuffer = Buffer.concat([wavBuffer, chunkHeader, payloadBytes, padByte]);

  const newTotalSize = newWavBuffer.length - 8;
  newWavBuffer.writeUInt32LE(newTotalSize, 4);

  return newWavBuffer;
}

/**
 * Scans a WAV buffer to extract and verify embedded VoiceGuard watermark
 */
export function extractWatermarkFromWav(wavBuffer) {
  if (!wavBuffer || wavBuffer.length < 12) {
    return { found: false, reason: 'Invalid or missing audio buffer' };
  }

  // Verify RIFF header
  const riffHeader = wavBuffer.toString('ascii', 0, 4);
  if (riffHeader !== 'RIFF') {
    return { found: false, reason: 'Audio format is not standard RIFF WAV' };
  }

  let offset = 12; // Skip RIFF header + WAVE type
  const totalLen = wavBuffer.length;

  while (offset + 8 <= totalLen) {
    const chunkId = wavBuffer.toString('ascii', offset, offset + 4);
    const chunkSize = wavBuffer.readUInt32LE(offset + 4);

    if (chunkId === WATERMARK_CHUNK_ID) {
      try {
        const payloadData = wavBuffer.slice(offset + 8, offset + 8 + chunkSize);
        const payloadJson = payloadData.toString('utf8');
        const payload = JSON.parse(payloadJson);

        // Verify signature
        const signBase = `${payload.watermarkId}:${payload.timestamp}:${payload.voiceId}:${payload.textHash}`;
        const expectedSignature = crypto.createHmac('sha256', SECRET_KEY).update(signBase).digest('hex');
        const isAuthentic = (payload.signature === expectedSignature);

        return {
          found: true,
          verified: isAuthentic,
          payload: payload,
          offset: offset,
          chunkSize: chunkSize
        };
      } catch (err) {
        return { found: true, verified: false, reason: 'Corrupted watermark payload: ' + err.message };
      }
    }

    // Advance to next chunk (aligned to 2-byte boundary)
    const alignedSize = chunkSize + (chunkSize % 2);
    offset += 8 + alignedSize;
  }

  return { found: false, reason: 'No VoiceGuard digital watermark signature found in audio structure' };
}

/**
 * Calculates SHA-256 digest of audio buffer
 */
export function calculateAudioHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
