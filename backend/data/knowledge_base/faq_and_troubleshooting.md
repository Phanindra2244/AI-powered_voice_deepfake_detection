# VoiceGuard FAQ, Troubleshooting & Model Setup

## Frequently Asked Questions

### 1. Which Whisper Speech-to-Text model is used?
- VoiceGuard uses Hugging Face `openai/whisper-tiny` for fast automatic speech recognition (ASR) and timestamped audio segmentation.

### 2. How to configure Hugging Face Authentication?
- Set `HF_TOKEN` in `backend/.env` (e.g. `HF_TOKEN=hf_xxxx`). If unauthenticated, public Hugging Face repository rate limits apply.

### 3. What are the audio sample rate requirements?
- Input audio is automatically resampled to **16,000 Hz Mono float32** arrays using `scipy.signal.resample` before feeding to deepfake and ASR pipelines.

### 4. What happens if a risk signal is missing?
- The Multi-Vector Risk Fusion Engine (`riskFusionService.js`) re-normalizes signal weights across available vectors (`voice`, `social_engineering`, `transaction`, `speaker_biometrics`) without inventing dummy placeholder values.
