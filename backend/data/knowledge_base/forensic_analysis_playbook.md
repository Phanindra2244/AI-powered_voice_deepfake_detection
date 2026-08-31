# VoiceGuard Forensic Analysis Playbook

## Acoustic Artifact Detection

### 1. High-Frequency Vocoder Brickwall Cutoff
- **Acoustic Sign**: Neural text-to-speech (TTS) vocoders (e.g. WaveNet, HiFi-GAN, MelGAN) typically exhibit a sharp high-frequency brickwall cutoff at ~12.4 kHz due to band-limited Mel-spectrogram generation.
- **Natural Human Baseline**: Organic human vocal tract produces natural harmonics extending up to 22.05 kHz (44.1 kHz sample rate).
- **Threshold**: High-frequency energy ratio above 7 kHz < 1.0% indicates synthetic vocoder artifacts.

### 2. Spectral Flatness & Phase Coherence
- **Acoustic Sign**: Synthetic speech often displays unnaturally low or over-smoothed spectral flatness (< 0.08) and artificial phase coherence discontinuities across frame boundaries.
- **Formula**: $\text{Spectral Flatness} = \frac{\exp(\text{mean}(\log(S)))}{\text{mean}(S)}$

### 3. Pitch Trajectory Jitter & Shimmer
- **Acoustic Sign**: Real human speech exhibits micro-tremors and natural pitch jitter (> 5% variance). AI clones frequently exhibit static or unnaturally uniform pitch trajectories.

## Model Ensemble Weights
- **Neural Model**: Hugging Face `facebook/wav2vec2-base` convolutional transformer model (75% weight).
- **Spectral Vocoder Analyzer**: STFT frequency rolloff, spectral flatness, and pitch jitter (25% weight).
- **Classification Threshold**: $P(\text{fake}) \ge 0.50 \implies \text{DEEPFAKE}$.
