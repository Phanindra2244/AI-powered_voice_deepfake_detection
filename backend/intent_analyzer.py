import io
import sys
import os
import json
import re
import warnings
import argparse
import numpy as np
import scipy.signal
import soundfile as sf

# 1. ENVIRONMENT CONFIGURATION & CLEAN LOG SUPPRESSION
os.environ["TQDM_DISABLE"] = "1"
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
os.environ["TRANSFORMERS_NO_ADVISORY_WARNINGS"] = "1"
warnings.filterwarnings("ignore")

import logging
logging.basicConfig(level=logging.ERROR, stream=sys.stderr)
logger = logging.getLogger("VoiceGuardIntentAnalyzer")

for lib in ["transformers", "httpx", "urllib3", "huggingface_hub", "torch"]:
    logging.getLogger(lib).setLevel(logging.ERROR)

# Load HF_TOKEN from dotenv if available
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

HF_TOKEN = os.environ.get("HF_TOKEN", None)


class ConversationIntentAnalyzer:
    """
    VoiceGuard Speech-to-Text (STT), Social Engineering Intent Detection,
    and Transaction Risk Scoring Engine.
    """
    def __init__(self):
        self.asr_pipeline = None
        self.pipeline_checked = False
        
        # Social Engineering Threat Categories & Exact Contextual Phrases
        self.threat_patterns = {
            "Urgent Wire Transfer": [
                "send wire transfer immediately", "wire transfer right now", "unauthorized emergency wire",
                "transfer funds immediately", "immediate wire transfer", "wire funds right now",
                "transfer money immediately", "emergency wire transfer", "immediate payment to bank account",
                "wire transfer", "transfer funds", "emergency payment", "vendor payment"
            ],
            "Executive Authority Impersonation": [
                "i am the chief financial officer", "this is the ceo calling", "executive emergency authorization",
                "bypass normal approval policy", "override compliance protocol", "bypass approval policy",
                "this is the cfo", "this is the chief executive officer", "authorizing emergency transfer",
                "chief financial officer", "chief executive officer", "cfo", "ceo"
            ],
            "High-Pressure Urgency Tactics": [
                "do not hang up", "do not tell anyone", "keep this strictly confidential",
                "immediate action required", "confidential emergency deadline", "your account will be suspended immediately",
                "do not consult anyone", "execute this transfer immediately", "strictly confidential", "immediately", "urgent"
            ],
            "Sensitive Data Solicitation": [
                "verify your otp right now", "dictate your 2fa code", "confidential bank details",
                "tell me your pin and cvv", "provide your 2fa verification code", "give me your otp code",
                "share your passcode", "provide your 2fa code immediately", "verification code", "otp", "passcode", "pin", "cvv"
            ]
        }

    def _get_whisper_pipeline(self):
        if self.pipeline_checked:
            return self.asr_pipeline

        self.pipeline_checked = True
        try:
            import torch
            from transformers import pipeline
            
            kwargs = {
                "task": "automatic-speech-recognition",
                "model": "openai/whisper-tiny",
                "torch_dtype": torch.float32
            }
            if HF_TOKEN:
                kwargs["token"] = HF_TOKEN

            self.asr_pipeline = pipeline(**kwargs)
        except Exception as e:
            logger.error(f"Whisper pipeline initialization error: {e}")
            self.asr_pipeline = None

        return self.asr_pipeline

    def preprocess_and_resample(self, audio_bytes_or_filepath) -> tuple[np.ndarray, int, float]:
        """
        Loads audio, converts stereo to 16,000 Hz Mono float32 PCM array.
        Returns: (pcm_16k_mono, sample_rate, duration_sec)
        """
        try:
            if isinstance(audio_bytes_or_filepath, bytes):
                data, sr = sf.read(io.BytesIO(audio_bytes_or_filepath))
            elif isinstance(audio_bytes_or_filepath, str) and os.path.exists(audio_bytes_or_filepath):
                data, sr = sf.read(audio_bytes_or_filepath)
            else:
                return np.zeros(16000, dtype=np.float32), 16000, 1.0

            if data.ndim > 1:
                data = np.mean(data, axis=1)

            # Resample to 16,000 Hz if necessary
            target_sr = 16000
            if sr != target_sr:
                target_len = int(round(len(data) * float(target_sr) / sr))
                data = scipy.signal.resample(data, target_len)
                sr = target_sr

            data = data.astype(np.float32)
            duration = max(0.5, len(data) / float(sr))
            return data, sr, round(duration, 2)
        except Exception as e:
            logger.error(f"Audio preprocessing error: {e}")
            return np.zeros(16000, dtype=np.float32), 16000, 1.0

    def transcribe_audio(self, audio_bytes_or_filepath) -> dict:
        """
        Transcribes input audio into structured transcript payload.
        Returns: { full_text, language, duration_sec, segments }
        """
        pcm_data, sr, duration = self.preprocess_and_resample(audio_bytes_or_filepath)
        transcript = ""
        segments = []

        pipeline = self._get_whisper_pipeline()
        if pipeline is not None:
            try:
                res = pipeline(pcm_data, return_timestamps=True)
                if isinstance(res, dict):
                    transcript = res.get("text", "").strip()
                    chunks = res.get("chunks", [])
                    for idx, c in enumerate(chunks):
                        ts = c.get("timestamp", (idx * 2.0, (idx + 1) * 2.0))
                        segments.append({
                            "id": f"seg-{idx+1}",
                            "start": round(ts[0] or 0.0, 2),
                            "end": round(ts[1] or duration, 2),
                            "text": c.get("text", "").strip()
                        })
            except Exception as ex:
                logger.error(f"Whisper ASR inference error: {ex}")

        if not transcript:
            if isinstance(audio_bytes_or_filepath, str) and not audio_bytes_or_filepath.endswith('.wav') and not audio_bytes_or_filepath.endswith('.mp3'):
                transcript = audio_bytes_or_filepath
            else:
                transcript = "No spoken transcript detected in provided audio clip."

        if not segments:
            segments = [{
                "id": "seg-1",
                "start": 0.0,
                "end": duration,
                "text": transcript
            }]

        return {
            "full_text": transcript,
            "language": "en",
            "duration_sec": duration,
            "segments": segments
        }

    def _matches_keyword(self, keyword: str, text_lower: str) -> bool:
        """Word-boundary accurate keyword matching."""
        if len(keyword) <= 4:
            pattern = r'\b' + re.escape(keyword) + r'\b'
            return bool(re.search(pattern, text_lower))
        return keyword in text_lower

    def analyze_intent_and_risk(self, transcript_data, caller_context: dict = None) -> dict:
        """
        Analyzes transcript for social engineering patterns, correlates caller context, and computes risk score.
        """
        context = caller_context or {}
        caller_id = context.get("callerId", "Unknown Caller")

        if isinstance(transcript_data, dict):
            transcript = transcript_data.get("full_text", "")
            segments = transcript_data.get("segments", [])
            duration_sec = transcript_data.get("duration_sec", 3.5)
        else:
            transcript = str(transcript_data or "")
            segments = []
            duration_sec = 3.5

        transcript_lower = transcript.lower()

        if self._matches_keyword("cfo", transcript_lower) or "chief financial officer" in transcript_lower:
            claimed_role = "CFO / Chief Financial Officer"
        elif self._matches_keyword("ceo", transcript_lower) or "chief executive" in transcript_lower:
            claimed_role = "CEO / Chief Executive Officer"
        elif "helpdesk" in transcript_lower or "it security" in transcript_lower:
            claimed_role = "IT Helpdesk Lead Engineer"
        elif "law enforcement" in transcript_lower or "police" in transcript_lower:
            claimed_role = "Law Enforcement / Federal Agent"
        elif "accounts payable" in transcript_lower or "invoice" in transcript_lower:
            claimed_role = "Accounts Payable Manager"
        else:
            claimed_role = context.get("claimedRole", "Standard Caller")

        # 1. Extract Financial Transaction Amount
        amount_matches = re.findall(r'(?:₹|\$|rs\.?|inr)?\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{3,})', transcript, re.IGNORECASE)
        if amount_matches:
            try:
                tx_amount = float(amount_matches[0].replace(',', ''))
            except Exception:
                tx_amount = float(context.get("transactionAmount", 0.0))
        else:
            tx_amount = float(context.get("transactionAmount", 0.0))

        call_channel = context.get("callChannel", "External Channel")

        # 2. Match Threat Patterns & Phrases with Word Boundaries
        detected_intents = []
        flagged_keywords = []

        for category, phrases in self.threat_patterns.items():
            matched_in_category = []
            for phrase in phrases:
                if self._matches_keyword(phrase.lower(), transcript_lower):
                    matched_in_category.append(phrase)
                    if phrase not in flagged_keywords:
                        flagged_keywords.append(phrase)
            
            if matched_in_category:
                detected_intents.append(category)

        # 3. Map Primary Intent Category
        if "Urgent Wire Transfer" in detected_intents:
            intent = "financial_request"
        elif "Executive Authority Impersonation" in detected_intents:
            intent = "authority_impersonation"
        elif "High-Pressure Urgency Tactics" in detected_intents:
            intent = "urgency_tactics"
        elif "Sensitive Data Solicitation" in detected_intents:
            intent = "sensitive_data_solicitation"
        else:
            intent = "casual_inquiry"

        # 4. Social Engineering Risk Score
        risk_score = 0.0
        if "Urgent Wire Transfer" in detected_intents:
            risk_score += 40.0
        if "Executive Authority Impersonation" in detected_intents:
            risk_score += 25.0
        if "High-Pressure Urgency Tactics" in detected_intents:
            risk_score += 20.0
        if "Sensitive Data Solicitation" in detected_intents:
            risk_score += 35.0

        is_untrusted_channel = any(k in call_channel.lower() for k in ["voip", "untrusted", "sip", "external", "unknown"])
        is_executive_role = any(k in claimed_role.lower() for k in ["cfo", "ceo", "executive", "director", "manager"])

        if is_untrusted_channel and (is_executive_role or "Executive Authority Impersonation" in detected_intents):
            origin_anomaly = True
            risk_score += 15.0
            anomaly_details = f"Executive role ({claimed_role}) claimed over untrusted external channel ({call_channel})."
        else:
            origin_anomaly = False
            anomaly_details = "Caller channel matches claimed role profile."

        social_engineering_risk = round(min(100.0, max(0.0, risk_score)), 1)

        # 5. Transaction Risk Score
        if tx_amount <= 0:
            transaction_risk = 0.0
        elif tx_amount < 1000:
            transaction_risk = 35.0
        elif tx_amount < 10000:
            transaction_risk = 60.0
        elif tx_amount < 50000:
            transaction_risk = 78.0
        else:
            transaction_risk = 92.0

        overall_risk = max(social_engineering_risk, transaction_risk)

        # 6. Risk Level Mapping (0-30 LOW, 31-60 MEDIUM, 61-80 HIGH, 81-100 CRITICAL)
        if overall_risk >= 81.0:
            risk_level = "CRITICAL"
        elif overall_risk >= 61.0:
            risk_level = "HIGH"
        elif overall_risk >= 31.0:
            risk_level = "MEDIUM"
        else:
            risk_level = "LOW"

        data_payload = {
            "transcript": transcript,
            "intent": intent,
            "intent_risk_score": social_engineering_risk,
            "social_engineering_risk": social_engineering_risk,
            "transaction_risk": transaction_risk,
            "risk_category": risk_level,
            "risk_level": risk_level,
            "risk_severity": "danger" if risk_level in ["HIGH", "CRITICAL"] else ("warning" if risk_level == "MEDIUM" else "success"),
            "flagged_keywords": flagged_keywords,
            "detected_intents": detected_intents if detected_intents else ["Casual / Normal Conversation"],
            "duration_sec": duration_sec,
            "timestamped_segments": segments,
            "caller_context": {
                "origin": call_channel,
                "channel": call_channel.split("/")[0].strip() if "/" in call_channel else call_channel,
                "callerId": caller_id,
                "claimedRole": claimed_role,
                "transactionAmount": tx_amount,
                "callChannel": call_channel,
                "originAnomalyDetected": origin_anomaly,
                "anomalyDetails": anomaly_details
            }
        }

        return {
            "success": True,
            "transcript": transcript,
            "intent": intent,
            "social_engineering_risk": social_engineering_risk,
            "transaction_risk": transaction_risk,
            "risk_level": risk_level,
            "flagged_keywords": flagged_keywords,
            "data": data_payload
        }

    def process(self, audio_input, caller_context: dict = None) -> dict:
        """
        Full STT + Social Engineering Intent + Transaction Risk Pipeline
        """
        stt_result = self.transcribe_audio(audio_input)
        analysis = self.analyze_intent_and_risk(stt_result, caller_context)
        return analysis


# Instantiate Analyzer
analyzer_instance = ConversationIntentAnalyzer()


# Worker / CLI Execution Support
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="VoiceGuard Intent & Transaction Risk Analyzer")
    parser.add_argument("--file", type=str, default=None, help="Audio file path")
    parser.add_argument("--text", type=str, default=None, help="Direct transcript text")
    parser.add_argument("--caller_id", type=str, default="Inbound Caller", help="Caller ID")
    parser.add_argument("--role", type=str, default="Standard Caller", help="Claimed role")
    parser.add_argument("--channel", type=str, default="External Channel", help="Call channel")
    parser.add_argument("--amount", type=float, default=0.0, help="Transaction amount")
    parser.add_argument("--daemon", action="store_true", help="Run in persistent JSON worker daemon mode")

    args = parser.parse_args()

    if args.daemon:
        # Pre-load Whisper pipeline once into memory
        analyzer_instance._get_whisper_pipeline()
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                req = json.loads(line)
                file_path = req.get("file")
                text_input = req.get("text")
                ctx = req.get("context", {})
                
                if text_input:
                    res = analyzer_instance.analyze_intent_and_risk(text_input, ctx)
                else:
                    res = analyzer_instance.process(file_path, ctx)
                
                sys.stdout.write(json.dumps(res) + "\n")
                sys.stdout.flush()
            except Exception as e:
                err_resp = {"success": False, "error": f"Worker error: {str(e)}"}
                sys.stdout.write(json.dumps(err_resp) + "\n")
                sys.stdout.flush()
    else:
        context = {
            "callerId": args.caller_id,
            "claimedRole": args.role,
            "callChannel": args.channel,
            "transactionAmount": args.amount
        }

        try:
            if args.text:
                result = analyzer_instance.analyze_intent_and_risk(args.text, context)
            elif args.file:
                result = analyzer_instance.process(args.file, context)
            else:
                result = analyzer_instance.process("sample.wav", context)
            
            print(json.dumps(result, indent=2))
        except Exception as ex:
            err_output = {"success": False, "error": str(ex)}
            print(json.dumps(err_output))
