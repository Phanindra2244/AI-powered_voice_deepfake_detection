import argparse
import io
import json
import logging
from typing import Any, Dict, Tuple

import numpy as np
import scipy.signal
import soundfile as sf

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("TRUETONEDetector")

# ---------------------------------------------------------------------------
# Optional ML dependencies
# ---------------------------------------------------------------------------
try:
    import torch
    import torch.nn.functional as F
    from transformers import AutoModelForAudioClassification, AutoFeatureExtractor

    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    torch = None
    F = None
    AutoModelForAudioClassification = None
    AutoFeatureExtractor = None
    logger.warning("PyTorch/Transformers unavailable. AI detection will be unavailable.")


class AudioDeepfakeDetector:
    """
    TRUETONE audio deepfake detector.

    Pipeline:
        input audio
          -> decode
          -> mono / 16 kHz normalization
          -> speech / noise / silence analysis
          -> usable-speech extraction
          -> Wav2Vec2 deepfake classifier
          -> real/fake probabilities

    Important:
      * Noise/silence metrics are reported separately.
      * Noise is NOT added to the deepfake probability.
      * If the neural detector cannot run, this class does NOT invent a
        Real/Fake score.
    """

    MODEL_NAME = "garystafford/wav2vec2-deepfake-voice-detector"
    TARGET_SAMPLE_RATE = 16000

    # The model card indicates strongest use on roughly 2.5–13 second clips.
    MIN_USABLE_SPEECH_SECONDS = 2.5
    MAX_MODEL_SECONDS = 13.0

    def __init__(self, model_name: str = MODEL_NAME):
        self.model_name = model_name
        self.target_sample_rate = self.TARGET_SAMPLE_RATE
        self.classification_threshold = 0.50

        self.model = None
        self.feature_extractor = None

        self.fake_label_index = 1
        self.real_label_index = 0
        self.id2label = {0: "real", 1: "fake"}
        self.label2id = {"real": 0, "fake": 1}

        if TORCH_AVAILABLE:
            self._load_pretrained_model()

    # -----------------------------------------------------------------------
    # MODEL
    # -----------------------------------------------------------------------
    def _load_pretrained_model(self) -> None:
        try:
            logger.info("Loading deepfake model: %s", self.model_name)

            self.feature_extractor = AutoFeatureExtractor.from_pretrained(
                self.model_name
            )
            self.model = AutoModelForAudioClassification.from_pretrained(
                self.model_name
            )
            self.model.eval()

            config_id2label = getattr(self.model.config, "id2label", None)
            if config_id2label:
                self.id2label = {
                    int(k): str(v) for k, v in config_id2label.items()
                }

            config_label2id = getattr(self.model.config, "label2id", None)
            if config_label2id:
                self.label2id = {
                    str(k): int(v) for k, v in config_label2id.items()
                }

            # Resolve labels safely.
            fake_idx = None
            real_idx = None

            for idx, label in self.id2label.items():
                normalized = label.lower().strip()

                if any(
                    key in normalized
                    for key in (
                        "fake",
                        "spoof",
                        "synthetic",
                        "generated",
                        "ai",
                    )
                ):
                    fake_idx = idx

                if any(
                    key in normalized
                    for key in (
                        "real",
                        "bonafide",
                        "bona fide",
                        "human",
                        "authentic",
                    )
                ):
                    real_idx = idx

            if fake_idx is not None:
                self.fake_label_index = fake_idx
            if real_idx is not None:
                self.real_label_index = real_idx

            logger.info("[MODEL] id2label=%s", self.id2label)
            logger.info(
                "[MODEL] fake_index=%s real_index=%s",
                self.fake_label_index,
                self.real_label_index,
            )

            if self.fake_label_index == self.real_label_index:
                raise RuntimeError("Could not resolve distinct fake/real labels.")

            logger.info("MODEL LOADED SUCCESSFULLY")

        except Exception as exc:
            logger.exception("Could not load neural detector: %s", exc)
            self.model = None
            self.feature_extractor = None

    # -----------------------------------------------------------------------
    # AUDIO INPUT / PREPROCESSING
    # -----------------------------------------------------------------------
    def _decode_audio(self, audio_input) -> Tuple[np.ndarray, int]:
        if isinstance(audio_input, bytes):
            data, sr = sf.read(io.BytesIO(audio_input), always_2d=False)
        elif isinstance(audio_input, str):
            data, sr = sf.read(audio_input, always_2d=False)
        elif isinstance(audio_input, np.ndarray):
            data = audio_input
            sr = self.target_sample_rate
        else:
            raise ValueError(f"Unsupported audio input type: {type(audio_input)}")

        if data is None or len(data) == 0:
            raise ValueError("Audio file contains no samples.")

        data = np.asarray(data)

        # Stereo/multichannel -> mono.
        if data.ndim > 1:
            data = np.mean(data, axis=1)

        data = data.astype(np.float32, copy=False)

        if not np.all(np.isfinite(data)):
            data = np.nan_to_num(data, nan=0.0, posinf=0.0, neginf=0.0)

        if sr <= 0:
            raise ValueError(f"Invalid sample rate: {sr}")

        return data, int(sr)

    def preprocess_audio(self, audio_input) -> np.ndarray:
        """
        Decode, convert to mono, resample to 16 kHz.

        Deliberately does NOT perform unit-variance normalization before the
        speech/noise analysis. The original amplitude is useful for estimating
        signal activity. The model's feature extractor performs its own
        expected preprocessing.
        """
        audio_data, sr = self._decode_audio(audio_input)

        if sr != self.target_sample_rate:
            target_len = int(
                round(
                    len(audio_data)
                    * float(self.target_sample_rate)
                    / float(sr)
                )
            )
            audio_data = scipy.signal.resample(
                audio_data,
                max(1, target_len)
            ).astype(np.float32)

        # Remove DC offset only. Do not normalize amplitude here.
        audio_data = audio_data - float(np.mean(audio_data))

        if len(audio_data) < 1:
            raise ValueError("Audio contains no usable samples.")

        return audio_data.astype(np.float32)

    # -----------------------------------------------------------------------
    # SPEECH / NOISE / SILENCE ANALYSIS
    # -----------------------------------------------------------------------
    def analyze_audio_quality(
        self,
        pcm_16k: np.ndarray,
        frame_ms: int = 30,
    ) -> Dict[str, Any]:
        """
        Lightweight energy-based activity analysis.

        This is intentionally a quality/activity estimator, NOT a noise-type
        classifier. It does not use noise as evidence for deepfake detection.
        """
        frame_len = max(160, int(self.target_sample_rate * frame_ms / 1000))
        hop = max(80, frame_len // 2)

        if len(pcm_16k) < frame_len:
            padded = np.pad(
                pcm_16k,
                (0, frame_len - len(pcm_16k))
            )
        else:
            padded = pcm_16k

        frames = []
        starts = range(0, max(1, len(padded) - frame_len + 1), hop)

        for start in starts:
            frame = padded[start:start + frame_len]
            if len(frame) < frame_len:
                frame = np.pad(frame, (0, frame_len - len(frame)))
            frames.append(frame)

        if not frames:
            frames = [np.pad(padded, (0, max(0, frame_len - len(padded))))[:frame_len]]

        frames = np.asarray(frames, dtype=np.float32)

        rms = np.sqrt(np.mean(frames ** 2, axis=1) + 1e-12)
        rms_db = 20.0 * np.log10(rms + 1e-8)

        # Robust noise floor estimate: quietest 20% of frames.
        noise_floor_db = float(np.percentile(rms_db, 20))

        # Speech/activity threshold. This is deliberately conservative.
        speech_threshold_db = noise_floor_db + 10.0

        speech_mask = rms_db >= speech_threshold_db

        # Very quiet frames are treated as silence.
        silence_threshold_db = max(noise_floor_db + 3.0, -55.0)
        silence_mask = rms_db < silence_threshold_db

        # Remaining non-speech, non-silence activity is reported as noise/
        # background activity. It is never fed into the fake score.
        noise_mask = ~(speech_mask | silence_mask)

        total_frames = len(frames)
        frame_seconds = hop / self.target_sample_rate

        speech_seconds = float(np.sum(speech_mask) * frame_seconds)
        noise_seconds = float(np.sum(noise_mask) * frame_seconds)
        silence_seconds = float(np.sum(silence_mask) * frame_seconds)

        # Clamp to actual duration because frame counting uses hops.
        duration = len(pcm_16k) / self.target_sample_rate
        total_classified = speech_seconds + noise_seconds + silence_seconds
        if total_classified > 0:
            scale = duration / total_classified
            speech_seconds *= scale
            noise_seconds *= scale
            silence_seconds *= scale

        speech_percent = (speech_seconds / duration * 100.0) if duration else 0.0
        noise_percent = (noise_seconds / duration * 100.0) if duration else 0.0
        silence_percent = (silence_seconds / duration * 100.0) if duration else 0.0

        if noise_percent < 5:
            noise_level = "LOW"
        elif noise_percent < 20:
            noise_level = "MODERATE"
        else:
            noise_level = "HIGH"

        return {
            "speechPercent": round(min(100.0, max(0.0, speech_percent)), 1),
            "noisePercent": round(min(100.0, max(0.0, noise_percent)), 1),
            "silencePercent": round(min(100.0, max(0.0, silence_percent)), 1),
            "speechDurationSeconds": round(max(0.0, speech_seconds), 2),
            "noiseDurationSeconds": round(max(0.0, noise_seconds), 2),
            "silenceDurationSeconds": round(max(0.0, silence_seconds), 2),
            "noiseLevel": noise_level,
            "noiseIncludedInDeepfakeCalculation": False,
            "analysisMethod": "energy-based speech/noise/silence activity estimation",
        }

    def extract_usable_speech(
        self,
        pcm_16k: np.ndarray,
        quality: Dict[str, Any],
        frame_ms: int = 30,
    ) -> np.ndarray:
        """
        Keep active speech-like frames and discard quiet/background frames.

        A small padding is added around active frames so speech transitions are
        not clipped too aggressively.
        """
        frame_len = max(160, int(self.target_sample_rate * frame_ms / 1000))
        hop = max(80, frame_len // 2)

        if len(pcm_16k) < frame_len:
            return pcm_16k.copy()

        frames = []
        starts = list(range(0, len(pcm_16k) - frame_len + 1, hop))

        rms_values = []
        for start in starts:
            frame = pcm_16k[start:start + frame_len]
            rms_values.append(np.sqrt(np.mean(frame ** 2) + 1e-12))

        rms_values = np.asarray(rms_values)

        if len(rms_values) == 0:
            return pcm_16k.copy()

        rms_db = 20.0 * np.log10(rms_values + 1e-8)
        noise_floor_db = float(np.percentile(rms_db, 20))
        threshold_db = noise_floor_db + 10.0

        active = rms_db >= threshold_db

        # Expand each active frame by one frame on each side.
        expanded = active.copy()
        expanded[1:] |= active[:-1]
        expanded[:-1] |= active[1:]

        pieces = []
        for idx, is_active in enumerate(expanded):
            if is_active:
                start = starts[idx]
                end = min(len(pcm_16k), start + frame_len)
                pieces.append(pcm_16k[start:end])

        if not pieces:
            return np.array([], dtype=np.float32)

        return np.concatenate(pieces).astype(np.float32)

    def _prepare_model_audio(self, speech_audio: np.ndarray) -> np.ndarray:
        """
        Limit one inference input to the model-card-friendly maximum duration.

        We keep the beginning of the usable speech because this detector is
        intended as a fast demo/inference pipeline.
        """
        max_samples = int(self.MAX_MODEL_SECONDS * self.target_sample_rate)

        if len(speech_audio) > max_samples:
            speech_audio = speech_audio[:max_samples]

        return speech_audio.astype(np.float32)

    # -----------------------------------------------------------------------
    # MODEL INFERENCE
    # -----------------------------------------------------------------------
    def _run_model(self, speech_audio: np.ndarray) -> Dict[str, Any]:
        if not TORCH_AVAILABLE:
            return {
                "status": "detector_unavailable",
                "error": "PyTorch/Transformers is not installed.",
            }

        if self.model is None or self.feature_extractor is None:
            return {
                "status": "detector_unavailable",
                "error": "Deepfake model could not be loaded.",
            }

        try:
            inputs = self.feature_extractor(
                speech_audio,
                sampling_rate=self.target_sample_rate,
                return_tensors="pt",
                padding=True,
            )

            with torch.no_grad():
                outputs = self.model(**inputs)
                logits = outputs.logits
                probs = F.softmax(logits, dim=-1)[0]

            probabilities = probs.detach().cpu().numpy().astype(float).tolist()
            raw_logits = (
                logits.detach().cpu().numpy()[0].astype(float).tolist()
            )

            if self.fake_label_index >= len(probabilities):
                raise RuntimeError("Fake label index is outside model output.")
            if self.real_label_index >= len(probabilities):
                raise RuntimeError("Real label index is outside model output.")

            prob_fake = float(probabilities[self.fake_label_index])
            prob_real = float(probabilities[self.real_label_index])

            verdict = (
                "DEEPFAKE"
                if prob_fake >= self.classification_threshold
                else "REAL"
            )

            return {
                "status": "success",
                "verdict": verdict,
                "probabilities": {
                    "fake": round(prob_fake, 6),
                    "real": round(prob_real, 6),
                },
                "confidenceScore": round(prob_fake * 100.0, 1),
                "authenticityScore": round(prob_real * 100.0, 1),
                "rawLogits": [round(x, 6) for x in raw_logits],
            }

        except Exception as exc:
            logger.exception("Neural model inference failed: %s", exc)
            return {
                "status": "detector_unavailable",
                "error": str(exc),
            }

    # -----------------------------------------------------------------------
    # PUBLIC PREDICTION API
    # -----------------------------------------------------------------------
    def predict(self, audio_input) -> Dict[str, Any]:
        pcm_16k = self.preprocess_audio(audio_input)
        duration_sec = float(len(pcm_16k) / self.target_sample_rate)

        quality = self.analyze_audio_quality(pcm_16k)
        usable_speech = self.extract_usable_speech(pcm_16k, quality)

        usable_duration = (
            len(usable_speech) / self.target_sample_rate
            if len(usable_speech)
            else 0.0
        )

        result: Dict[str, Any] = {
            "detector": {
                "name": "TRUETONE Wav2Vec2 Deepfake Detector",
                "model": self.model_name,
                "status": "ready" if self.model is not None else "unavailable",
            },
            "duration": round(duration_sec, 2),
            "sampleRate": self.target_sample_rate,
            "audioQuality": quality,
            "usableSpeech": {
                "durationSeconds": round(usable_duration, 2),
                "usedForDeepfakeCalculation": False,
            },
            "noiseHandling": {
                "noiseExcludedFromDeepfakeCalculation": True,
                "silenceExcludedFromDeepfakeCalculation": True,
                "method": "speech/activity segmentation before neural inference",
            },
        }

        # Do not force a model decision on too little speech.
        if usable_duration < self.MIN_USABLE_SPEECH_SECONDS:
            result.update(
                {
                    "status": "insufficient_speech",
                    "verdict": "INSUFFICIENT_SPEECH",
                    "verdictText": (
                        "Not enough usable speech for reliable deepfake analysis."
                    ),
                    "verdictSeverity": "warning",
                    "confidenceScore": None,
                    "authenticityScore": None,
                    "probabilities": None,
                    "explanationSummary": (
                        "The recording contains less than the minimum usable "
                        "speech duration required for this model. Noise and "
                        "silence were excluded rather than treated as fake."
                    ),
                }
            )
            return result

        model_audio = self._prepare_model_audio(usable_speech)
        model_duration = len(model_audio) / self.target_sample_rate

        model_result = self._run_model(model_audio)

        if model_result["status"] != "success":
            result.update(
                {
                    "status": "detector_unavailable",
                    "verdict": "DETECTOR_UNAVAILABLE",
                    "verdictText": "Deepfake detector unavailable.",
                    "verdictSeverity": "warning",
                    "confidenceScore": None,
                    "authenticityScore": None,
                    "probabilities": None,
                    "explanationSummary": (
                        "The AI detector could not complete inference. "
                        "No artificial Real/Fake score was generated."
                    ),
                    "detectorError": model_result.get("error"),
                }
            )
            return result

        prob_fake = model_result["probabilities"]["fake"]
        prob_real = model_result["probabilities"]["real"]
        verdict = model_result["verdict"]

        result.update(
            {
                "status": "success",
                "verdict": verdict,
                "verdictText": (
                    "AI-generated / synthetic voice indicated"
                    if verdict == "DEEPFAKE"
                    else "Human/authentic voice indicated"
                ),
                "verdictSeverity": (
                    "danger" if verdict == "DEEPFAKE" else "success"
                ),
                "confidenceScore": model_result["confidenceScore"],
                "authenticityScore": model_result["authenticityScore"],
                "probabilities": model_result["probabilities"],
                "rawLogits": model_result["rawLogits"],
                "classificationThreshold": self.classification_threshold,
                "labelMappingVerified": {
                    "id2label": self.id2label,
                    "label2id": self.label2id,
                    "fakeLabelIndex": self.fake_label_index,
                    "realLabelIndex": self.real_label_index,
                },
                "modelInputDurationSeconds": round(model_duration, 2),
                "explanationSummary": (
                    f"The neural audio classifier assigned "
                    f"{round(prob_fake * 100, 1)}% probability to the "
                    f"fake/synthetic class and "
                    f"{round(prob_real * 100, 1)}% to the real class. "
                    f"Background noise and silence were analyzed separately "
                    f"and were not added to this probability."
                ),
                "acousticMetrics": {
                    "speechPercent": quality["speechPercent"],
                    "noisePercent": quality["noisePercent"],
                    "silencePercent": quality["silencePercent"],
                    "noiseLevel": quality["noiseLevel"],
                },
                "modelLimitations": (
                    "This is a probabilistic model result, not proof of "
                    "authenticity. Performance can vary with recording "
                    "conditions, voices, codecs, noise, and synthesis methods."
                ),
            }
        )

        logger.info(
            "[DETECTION COMPLETE] Verdict=%s Fake=%.4f Real=%.4f Speech=%.1f%% Noise=%.1f%%",
            verdict,
            prob_fake,
            prob_real,
            quality["speechPercent"],
            quality["noisePercent"],
        )

        return result


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
detector_instance = AudioDeepfakeDetector()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="TRUETONE Audio Deepfake Detection Backend"
    )
    parser.add_argument(
        "--file",
        type=str,
        help="Path to audio file for deepfake classification",
    )
    args = parser.parse_args()

    if not args.file:
        logger.info("Detector module ready.")
        raise SystemExit(0)

    try:
        result = detector_instance.predict(args.file)
        print(json.dumps(result, indent=2))
    except Exception as exc:
        print(
            json.dumps(
                {
                    "status": "error",
                    "error": str(exc),
                },
                indent=2,
            )
        )
        raise SystemExit(1)
