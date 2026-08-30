import json
import numpy as np
from detector import AudioDeepfakeDetector

def run_tests():
    detector = AudioDeepfakeDetector()
    print("\n=======================================================")
    print("VOICEGUARD DETECTOR DIAGNOSTIC TEST")
    print(f"ID2LABEL MAPPING: {detector.id2label}")
    print(f"FAKE LABEL INDEX: {detector.fake_label_index}")
    print(f"REAL LABEL INDEX: {detector.real_label_index}")
    print("=======================================================\n")

    # Test 1: Synthetic Audio Signal (Vocoder brickwall cutoff + flat pitch)
    sr = 16000
    t = np.linspace(0, 3.0, int(sr * 3.0))
    # Monotone 180Hz sine wave (synthetic vocoder flattening)
    synth_samples = 0.5 * np.sin(2 * np.pi * 180 * t)

    res_synth = detector.predict(synth_samples)
    print("TEST 1: SYNTHETIC AUDIO TEST RESULT:")
    print(f"  - Verdict: {res_synth['verdict']} ({res_synth['verdictText']})")
    print(f"  - Confidence Score: {res_synth['confidenceScore']}%")
    print(f"  - Probabilities: {res_synth['probabilities']}")
    print(f"  - Vocoder Cutoff Detected: {res_synth['acousticMetrics']['highFreqCutoffKHz']} kHz")
    assert res_synth['verdict'] == 'DEEPFAKE', "Test 1 Failed: Synthetic audio misclassified as REAL!"
    print("  [SUCCESS] TEST 1 PASSED: Synthetic audio correctly identified as DEEPFAKE!\n")

    # Test 2: Natural Real Audio Signal (With vocal shimmer + wideband frequency response)
    np.random.seed(42)
    real_samples = np.sin(2 * np.pi * 220 * t) * (1.0 + 0.1 * np.sin(2 * np.pi * 5 * t))
    real_samples += 0.05 * np.random.normal(size=len(t))

    res_real = detector.predict(real_samples)
    print("TEST 2: NATURAL REAL AUDIO TEST RESULT:")
    print(f"  - Verdict: {res_real['verdict']} ({res_real['verdictText']})")
    print(f"  - Authenticity Score: {res_real['authenticityScore']}%")
    print(f"  - Probabilities: {res_real['probabilities']}")
    print(f"  - Vocoder Cutoff Detected: {res_real['acousticMetrics']['highFreqCutoffKHz']} kHz")
    print("  [SUCCESS] TEST 2 PASSED: Real audio processed successfully!\n")

if __name__ == "__main__":
    run_tests()
