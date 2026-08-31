# VoiceGuard API Documentation & Integration Guide

## Overview
VoiceGuard API provides REST endpoints for AI voice deepfake detection, speech-to-text (STT) intent extraction, financial transaction risk evaluation, biometric speaker verification, and forensic report generation.

## Key API Endpoints

### 1. Unified Voice & Risk Inspection (`POST /api/analyze-voice`)
- **Description**: Accepts multipart audio or Base64 payload. Executes voice deepfake classification, Whisper ASR speech-to-text, social engineering threat extraction, financial transaction detection, and multi-vector risk fusion.
- **Request Parameters**:
  - `audio` (file): Audio file (WAV, MP3, M4A, WebM) up to 30MB.
  - `callerId` (string): Caller ID or phone number.
  - `claimedRole` (string): Claimed role (e.g. CFO, CEO, IT Helpdesk).
  - `transactionAmount` (number): Claimed transaction amount in INR.
- **Response Format**:
  ```json
  {
    "success": true,
    "voice_analysis": { "prediction": "AI_GENERATED", "ai_probability": 0.87, "confidence_score": 87.0 },
    "transcription": { "text": "...", "segments": [] },
    "social_engineering": { "score": 78, "level": "HIGH", "indicators": ["urgency", "otp"] },
    "transaction": { "detected": true, "amount": 50000, "risk_score": 82 },
    "overall_risk": { "score": 84, "level": "CRITICAL" },
    "recommendations": ["Do not approve transaction", "Verify caller identity"]
  }
  ```

### 2. Speech-to-Text & Intent Engine (`POST /api/analyze-intent`)
- **Description**: Runs Whisper ASR speech-to-text and evaluates social engineering indicators across 6 core threat categories. Returns timestamped audio segments.

### 3. Biometric Speaker Enrollment (`POST /api/speakers/enroll`)
- **Description**: Enrolls a trusted speaker voiceprint by computing a 192-dimensional vector embedding stored in `speaker_db.sqlite`.

### 4. Biometric Speaker Verification (`POST /api/speakers/verify`)
- **Description**: Compares input audio embedding against claimed speaker ID in SQLite database using cosine similarity distance.

### 5. Steganographic Watermark Verifier (`POST /api/verify-watermark`)
- **Description**: Inspects LSB (Least Significant Bit) audio steganography to verify synthetic voice provenance signatures.
