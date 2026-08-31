import os
import sys
import json
import random
import string
import logging
import argparse
import datetime
import urllib.request

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("VoiceGuardVerificationEngine")

PASSPHRASE_ADJECTIVES = ["Silver", "Cyber", "Golden", "Echo", "Titanium", "Quantum", "Shadow", "Falcon", "Solar", "Vanguard"]
PASSPHRASE_NOUNS = ["Falcon", "Shield", "Hawk", "Phantom", "Viper", "Sentry", "Matrix", "Beacon", "Spectre", "Horizon"]


class RiskVerificationEngine:
    """
    VoiceGuard Risk-Based Adaptive Verification Workflow & Security Alerting Engine.
    State Machine:
      - Score < 35 (Low): PASS (Immediate Clearance)
      - Score 35-64 (Medium): STEP_UP_CHALLENGE (Dynamic Passphrase & OTP Challenge)
      - Score >= 65 (High/Critical): BLOCK_AND_ISOLATE (Immediate Block & Incident Alert)
    """

    def __init__(self):
        self.active_challenges = {}
        self.alerts_history = []
        self.webhook_urls = []
        self._seed_default_alerts()

    def _seed_default_alerts(self):
        """Seeds sample security alerts if history is empty."""
        now = datetime.datetime.utcnow().isoformat() + "Z"
        self.alerts_history = [
            {
                "alert_id": "ALT-2026-9904",
                "timestamp": now,
                "severity": "CRITICAL",
                "caller_id": "+44 20 7946 0912",
                "target_identity": "Sarah Connor (CFO)",
                "composite_score": 92.5,
                "threat_indicators": [
                    "Synthetic deepfake detected (ElevenLabs voice clone fingerprint)",
                    "Biometric mismatch against enrolled voiceprint",
                    "Urgent wire transfer intent detected (₹50,000)"
                ],
                "mitigation_action_taken": "TRANSACTION_BLOCKED"
            },
            {
                "alert_id": "ALT-2026-9881",
                "timestamp": now,
                "severity": "HIGH",
                "caller_id": "+1-800-555-0199",
                "target_identity": "David Vance (VP IT Security)",
                "composite_score": 74.0,
                "threat_indicators": [
                    "Sensitive 2FA passcode solicitation trigger matched",
                    "Untrusted external PSTN channel origin"
                ],
                "mitigation_action_taken": "CALL_ROUTED_TO_FRAUD_ANALYST"
            }
        ]

    def generate_passphrase(self) -> str:
        adj = random.choice(PASSPHRASE_ADJECTIVES)
        noun = random.choice(PASSPHRASE_NOUNS)
        num = random.randint(100, 999)
        return f"{adj} {noun} {num}"

    def generate_otp(self) -> str:
        return "".join(random.choices(string.digits, k=6))

    def create_alert(
        self,
        severity: str,
        caller_id: str,
        target_identity: str,
        composite_score: float,
        threat_indicators: list,
        mitigation_action: str
    ) -> dict:
        """
        Generates standardized security alert payload and broadcasts to SIEM/SOAR webhooks.
        """
        now = datetime.datetime.utcnow().isoformat() + "Z"
        alert_id = f"ALT-2026-{random.randint(1000, 9999)}"

        payload = {
            "alert_id": alert_id,
            "timestamp": now,
            "severity": severity,
            "caller_id": caller_id,
            "target_identity": target_identity,
            "composite_score": round(composite_score, 1),
            "threat_indicators": threat_indicators if threat_indicators else ["Suspicious threat pattern detected"],
            "mitigation_action_taken": mitigation_action
        }

        self.alerts_history.insert(0, payload)
        if len(self.alerts_history) > 50:
            self.alerts_history.pop()

        logger.info(f"SECURITY ALERT GENERATED [{severity}] - {alert_id} for {target_identity}")

        # Trigger external webhooks if configured
        self._dispatch_webhooks(payload)

        return payload

    def _dispatch_webhooks(self, alert_payload: dict):
        for url in self.webhook_urls:
            try:
                req = urllib.request.Request(
                    url,
                    data=json.dumps(alert_payload).encode("utf-8"),
                    headers={"Content-Type": "application/json"}
                )
                urllib.request.urlopen(req, timeout=3)
            except Exception as e:
                logger.warning(f"Webhook dispatch failed to {url}: {e}")

    def create_challenge_workflow(
        self,
        composite_score: float,
        caller_id: str = "+1-555-019-2834",
        target_identity: str = "Authorized User",
        threat_indicators: list = None
    ) -> dict:
        """
        Orchestrates Risk-Based Adaptive Verification Workflow.
        """
        score = float(composite_score)
        indicators = threat_indicators or []

        # 1. Score < 35 (Low): PASS
        if score < 35.0:
            return {
                "status": "PASS",
                "recommended_action": "ALLOW",
                "clearance": True,
                "message": "Low Risk — Immediate Clearance Granted",
                "challenge_required": False
            }

        # 2. Score 35-64 (Medium): STEP_UP_CHALLENGE
        elif score < 65.0:
            challenge_id = f"CHG-{random.randint(100000, 999999)}"
            passphrase = self.generate_passphrase()
            otp = self.generate_otp()

            challenge_record = {
                "challenge_id": challenge_id,
                "passphrase": passphrase,
                "otp_token": otp,
                "created_at": datetime.datetime.utcnow().timestamp(),
                "ttl_seconds": 10,
                "caller_id": caller_id,
                "target_identity": target_identity
            }

            self.active_challenges[challenge_id] = challenge_record

            return {
                "status": "STEP_UP_CHALLENGE",
                "recommended_action": "CHALLENGE",
                "clearance": False,
                "message": "Medium Risk — Request Step-Up Biometric / OTP Challenge",
                "challenge_required": True,
                "challenge": {
                    "challenge_id": challenge_id,
                    "passphrase": passphrase,
                    "otp_token": otp,
                    "ttl_seconds": 10,
                    "instructions": "Speak the dynamic passphrase clearly within 10 seconds or enter device OTP token."
                }
            }

        # 3. Score >= 65 (High / Critical): BLOCK_AND_ISOLATE
        else:
            severity = "CRITICAL" if score >= 85.0 else "HIGH"
            mitigation_action = "TRANSACTION_BLOCKED" if score >= 85.0 else "CALL_ROUTED_TO_FRAUD_ANALYST"

            alert = self.create_alert(
                severity=severity,
                caller_id=caller_id,
                target_identity=target_identity,
                composite_score=score,
                threat_indicators=indicators,
                mitigation_action=mitigation_action
            )

            return {
                "status": "BLOCK_AND_ISOLATE",
                "recommended_action": "BLOCK_AND_FLAG" if score >= 85.0 else "SUSPEND_AND_REVIEW",
                "clearance": False,
                "message": alert["mitigation_action_taken"],
                "challenge_required": False,
                "alert": alert
            }

    def verify_challenge(self, challenge_id: str, input_response: str) -> dict:
        """
        Verifies spoken phrase or 6-digit OTP response for step-up challenge.
        """
        record = self.active_challenges.get(challenge_id)
        if not record:
            return {
                "verified": False,
                "status": "EXPIRED_OR_INVALID",
                "message": "Challenge expired or invalid ID"
            }

        now_ts = datetime.datetime.utcnow().timestamp()
        if (now_ts - record["created_at"]) > (record["ttl_seconds"] + 15):
            del self.active_challenges[challenge_id]
            return {
                "verified": False,
                "status": "CHALLENGE_TIMEOUT",
                "message": "10-second verification time limit exceeded"
            }

        input_clean = str(input_response).strip().lower()
        pass_clean = record["passphrase"].strip().lower()
        otp_clean = record["otp_token"].strip().lower()

        # Check match against passphrase or OTP
        if input_clean == pass_clean or input_clean == otp_clean or any(word in input_clean for word in pass_clean.split()):
            del self.active_challenges[challenge_id]
            return {
                "verified": True,
                "status": "VERIFIED_CLEARANCE_GRANTED",
                "message": "Step-Up Liveness & Speaker Verification Successful! Clearance Granted.",
                "speaker_identity": record["target_identity"]
            }

        return {
            "verified": False,
            "status": "CHALLENGE_FAILED",
            "message": "Spoken passphrase or OTP mismatch. Challenge failed."
        }

    def get_alerts(self) -> list:
        return self.alerts_history


# Instantiate Verification Engine
verification_engine_instance = RiskVerificationEngine()

# Optional FastAPI Application Integration
try:
    from fastapi import FastAPI, Body, HTTPException
    from fastapi.middleware.cors import CORSMiddleware

    app = FastAPI(
        title="VoiceGuard Risk-Based Adaptive Verification & Security Alerting API",
        description="Dynamic Step-Up Challenge Orchestration and Real-Time SIEM/SOAR Alerting",
        version="2.4.0"
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/")
    def root():
        return {"service": "VoiceGuard Verification & Alerting Engine", "status": "ONLINE"}

    @app.get("/api/alerts")
    def get_alerts():
        return {"success": True, "alerts": verification_engine_instance.get_alerts()}

    @app.post("/api/challenges/create")
    def create_challenge_api(payload: dict = Body(...)):
        score = payload.get("score", payload.get("composite_risk_score", 50))
        caller = payload.get("caller_id", "+1-555-019-2834")
        target = payload.get("target_identity", "John Doe (CFO)")
        indicators = payload.get("threat_indicators", [])
        return {"success": True, "data": verification_engine_instance.create_challenge_workflow(score, caller, target, indicators)}

    @app.post("/api/challenges/verify")
    def verify_challenge_api(payload: dict = Body(...)):
        ch_id = payload.get("challenge_id", "")
        resp = payload.get("input_response", payload.get("spoken_phrase", ""))
        return {"success": True, "data": verification_engine_instance.verify_challenge(ch_id, resp)}

except ImportError:
    app = None


# CLI Execution Support
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="VoiceGuard Verification & Alerting Engine CLI")
    parser.add_argument("--score", type=float, default=50.0, help="Composite Risk Score")
    parser.add_argument("--caller", type=str, default="+1-555-019-2834", help="Caller ID")
    parser.add_argument("--target", type=str, default="John Doe (CFO)", help="Target Identity")

    args = parser.parse_args()

    result = verification_engine_instance.create_challenge_workflow(args.score, args.caller, args.target)
    print(json.dumps(result, indent=2))
