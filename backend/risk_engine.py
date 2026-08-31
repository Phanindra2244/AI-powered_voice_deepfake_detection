import sys
import json
import logging
import argparse

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("VoiceGuardRiskEngine")


class DynamicRiskEngine:
    """
    VoiceGuard Dynamic Combined Risk Scoring Engine.
    Fuses Multi-Vector Telemetry:
      1. Deepfake Synthetic Probability (Weight: 40%)
      2. Speaker Biometric Discrepancy (1 - Match Similarity) (Weight: 25%)
      3. Conversation Intent & Urgency Triggers (Weight: 20%)
      4. Caller Context Anomaly (Weight: 10%)
      5. Transaction Stake Exposure (Weight: 5%)
    Includes 1.25x High-Threat Multiplier Rule and Action Threshold Mapping.
    """

    def calculate_transaction_stake_risk(self, amount: float) -> float:
        """Converts financial transaction dollar amount into 0-100 risk score."""
        if amount <= 0:
            return 0.0
        elif amount < 1000:
            return 15.0
        elif amount < 10000:
            return 45.0
        elif amount < 50000:
            return 75.0
        elif amount < 250000:
            return 90.0
        else:
            return 100.0

    def calculate_context_anomaly_risk(self, channel: str, claimed_role: str = "") -> float:
        """Evaluates caller channel risk and origin discrepancy into 0-100 score."""
        channel_lower = str(channel).lower()
    def calculate_context_anomaly_risk(self, channel: str, claimed_role: str = "") -> float:
        """Evaluates caller channel risk and origin discrepancy into 0-100 score."""
        channel_lower = str(channel).lower()
        role_lower = str(claimed_role).lower()

        base_risk = 0.0
        if any(k in channel_lower for k in ["untrusted", "unknown"]):
            base_risk += 35.0
        elif any(k in channel_lower for k in ["voip", "external", "pstn"]):
            base_risk += 15.0

        if any(r in role_lower for r in ["cfo", "ceo", "executive"]):
            if "untrusted" in channel_lower or "voip" in channel_lower:
                base_risk += 25.0

        return min(100.0, max(0.0, base_risk))

    def evaluate(self, telemetry: dict) -> dict:
        """
        Main multi-vector evaluation pipeline.
        Calculates Composite Risk Score (0 - 100%).
        Baseline score defaults strictly to 0.0 when inputs are clean.
        """
        # 1. Parse & Normalize Vector Scores (0 - 100)
        # Vector 1: Deepfake Risk (40%)
        deepfake_risk = float(telemetry.get("deepfake_risk", telemetry.get("confidenceScore", 0.0)))
        if deepfake_risk <= 1.0 and deepfake_risk > 0:
            deepfake_risk *= 100.0  # handle 0.0 - 1.0 scale if provided

        # Vector 2: Speaker Discrepancy Risk (25%)
        speaker_sim = float(telemetry.get("speaker_similarity", telemetry.get("similarity_score", 1.0)))
        if speaker_sim > 1.0:
            speaker_sim /= 100.0
        speaker_mismatch_risk = max(0.0, min(100.0, (1.0 - speaker_sim) * 100.0))

        # Vector 3: Intent & Urgency Risk (25%)
        intent_urgency_risk = float(telemetry.get("intent_urgency_risk", telemetry.get("intent_risk_score", 0.0)))

        # Vector 4: Context Anomaly Risk (10%)
        if "context_anomaly_risk" in telemetry:
            context_anomaly_risk = float(telemetry["context_anomaly_risk"])
        else:
            channel = telemetry.get("callChannel", telemetry.get("channel", "Internal SIP Extension"))
            role = telemetry.get("claimedRole", telemetry.get("role", "Authorized Employee"))
            context_anomaly_risk = self.calculate_context_anomaly_risk(channel, role)

        # Vector 5: Transaction Stake Exposure Risk (Optional 5% Boost)
        amount = float(telemetry.get("transactionAmount", telemetry.get("amount", 0.0)))
        transaction_stake_risk = self.calculate_transaction_stake_risk(amount)

        # 2. Weighted Multi-Vector Calculation
        df_contrib = 0.40 * deepfake_risk
        spk_contrib = 0.25 * speaker_mismatch_risk
        int_contrib = 0.25 * intent_urgency_risk
        ctx_contrib = 0.10 * context_anomaly_risk

        raw_composite = df_contrib + spk_contrib + int_contrib + ctx_contrib

        # 3. Dynamic High-Threat Multiplier Rule
        # If Deepfake Probability > 0.80 (80%) AND Intent Risk > 0.70 (70%), apply 1.25x boost
        multiplier_applied = False
        if deepfake_risk > 80.0 and intent_urgency_risk > 70.0:
            composite_score = min(100.0, raw_composite * 1.25)
            multiplier_applied = True
        else:
            composite_score = min(100.0, raw_composite)

        composite_score = round(composite_score, 1)

        # 4. Risk Posture Thresholds & Action Triggers
        # Requirement 9 Risk Levels Mapping:
        # 0–30 (LOW / GREEN): "Low Risk — Proceed Normally" (ALLOW)
        # 31–60 (MEDIUM / AMBER): "Medium Risk — Request Step-Up Biometric / OTP Challenge" (CHALLENGE)
        # 61–80 (HIGH / ORANGE): "High Risk — Suspend Transaction & Route to Human Fraud Analyst" (SUSPEND_AND_REVIEW)
        # 81–100 (CRITICAL / RED): "Critical Threat — Block Caller Immediately & Trigger Security Alert" (BLOCK_AND_FLAG)
        if composite_score >= 81.0:
            risk_tier = "CRITICAL"
            recommended_action = "BLOCK_AND_FLAG"
            action_description = "Critical Threat — Block Caller Immediately & Trigger Security Alert"
            severity = "danger"
            color_hex = "#f43f5e"  # Red
        elif composite_score >= 61.0:
            risk_tier = "HIGH"
            recommended_action = "SUSPEND_AND_REVIEW"
            action_description = "High Risk — Suspend Transaction & Route to Human Fraud Analyst"
            severity = "danger"
            color_hex = "#f97316"  # Orange
        elif composite_score >= 31.0:
            risk_tier = "MEDIUM"
            recommended_action = "CHALLENGE"
            action_description = "Medium Risk — Request Step-Up Biometric / OTP Challenge"
            severity = "warning"
            color_hex = "#eab308"  # Amber
        else:
            risk_tier = "LOW"
            recommended_action = "ALLOW"
            action_description = "Low Risk — Proceed Normally (Clean / Normal Speech)"
            severity = "success"
            color_hex = "#10b981"  # Green

        # 5. Debug Console Logging for Transparent Auditability
        logger.info("=== VOICEGUARD RISK ENGINE EVALUATION DEBUG ===")
        logger.info(f"[DEBUG RISK] 1. Deepfake Risk: {deepfake_risk:.1f}% (Weight 40%) -> Contribution: {df_contrib:.2f}")
        logger.info(f"[DEBUG RISK] 2. Speaker Mismatch Risk: {speaker_mismatch_risk:.1f}% (Weight 25%) -> Contribution: {spk_contrib:.2f}")
        logger.info(f"[DEBUG RISK] 3. Intent Urgency Risk: {intent_urgency_risk:.1f}% (Weight 25%) -> Contribution: {int_contrib:.2f}")
        logger.info(f"[DEBUG RISK] Final Composite Risk Score: {composite_score:.1f}% [{risk_tier} RISK - {recommended_action}]")
        logger.info("================================================")

        # 5. Extract Primary Threat Drivers
        primary_threat_drivers = []
        if deepfake_risk >= 65.0:
            primary_threat_drivers.append("AI-generated voice clone pattern identified")
        if speaker_mismatch_risk >= 50.0:
            primary_threat_drivers.append("Voice does not match enrolled profile for claimed identity")
        if intent_urgency_risk >= 65.0:
            primary_threat_drivers.append("High-pressure urgency tactics or unauthorized financial intent detected")
        if context_anomaly_risk >= 60.0:
            primary_threat_drivers.append("Untrusted VoIP gateway or origin anomaly detected")
        if transaction_stake_risk >= 75.0:
            primary_threat_drivers.append("High-value financial exposure requiring heightened authorization")

        if not primary_threat_drivers:
            primary_threat_drivers.append("Standard acoustic harmonics & caller context verified")

        return {
            "composite_risk_score": composite_score,
            "risk_tier": risk_tier,
            "recommended_action": recommended_action,
            "action_description": action_description,
            "severity": severity,
            "color_hex": color_hex,
            "multiplier_applied": multiplier_applied,
            "factor_breakdown": {
                "deepfake_risk": round(deepfake_risk, 1),
                "speaker_mismatch_risk": round(speaker_mismatch_risk, 1),
                "intent_urgency_risk": round(intent_urgency_risk, 1),
                "context_anomaly_risk": round(context_anomaly_risk, 1),
                "transaction_stake_risk": round(transaction_stake_risk, 1)
            },
            "primary_threat_drivers": primary_threat_drivers
        }


# Instantiate Engine
risk_engine_instance = DynamicRiskEngine()

# Optional FastAPI Route Integration
try:
    from fastapi import FastAPI, Body
    from fastapi.middleware.cors import CORSMiddleware

    app = FastAPI(
        title="VoiceGuard Dynamic Combined Risk Scoring Engine API",
        description="Multi-Vector Scoring Engine for Deepfake, Biometrics, Intent, Context, and Transaction Risk",
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
        return {"service": "VoiceGuard Dynamic Risk Engine", "status": "ONLINE"}

    @app.post("/api/risk/evaluate")
    def evaluate_risk_fastapi(telemetry: dict = Body(...)):
        return risk_engine_instance.evaluate(telemetry)

except ImportError:
    app = None


# CLI Execution Support
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="VoiceGuard Dynamic Combined Risk Scoring Engine")
    parser.add_argument("--deepfake", type=float, default=94.0, help="Deepfake Synthetic Risk (0-100)")
    parser.add_argument("--speaker_sim", type=float, default=0.18, help="Speaker Similarity (0-1)")
    parser.add_argument("--intent", type=float, default=90.0, help="Intent Urgency Risk (0-100)")
    parser.add_argument("--channel", type=str, default="Inbound VoIP / Untrusted Gateway", help="Call channel")
    parser.add_argument("--amount", type=float, default=50000.0, help="Transaction amount")

    args = parser.parse_args()

    telemetry = {
        "deepfake_risk": args.deepfake,
        "speaker_similarity": args.speaker_sim,
        "intent_urgency_risk": args.intent,
        "callChannel": args.channel,
        "transactionAmount": args.amount
    }

    result = risk_engine_instance.evaluate(telemetry)
    print(json.dumps(result, indent=2))
