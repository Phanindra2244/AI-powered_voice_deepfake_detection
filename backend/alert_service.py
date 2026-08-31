import os
import sys
import json
import sqlite3
import random
import string
import logging
import argparse
import datetime
import urllib.request

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("VoiceGuardAlertService")

# SQLite Database File Path
DB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
os.makedirs(DB_DIR, exist_ok=True)
DB_PATH = os.path.join(DB_DIR, "incidents.db")


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initializes the security_incidents table in SQLite DB and seeds default incidents if empty."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS security_incidents (
            incident_id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            severity TEXT NOT NULL,
            risk_score REAL NOT NULL,
            caller_id TEXT,
            target_identity TEXT,
            threat_indicators TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'NEW',
            analyst_notes TEXT DEFAULT '',
            mitigation_action_taken TEXT DEFAULT 'BLOCK_AND_ISOLATE'
        );
    """)
    conn.commit()

    # Seed default incidents if table is empty
    cursor.execute("SELECT COUNT(*) as count FROM security_incidents")
    count = cursor.fetchone()["count"]

    if count == 0:
        now = datetime.datetime.utcnow().isoformat() + "Z"
        default_seed = [
            (
                "INC-2026-9904",
                now,
                "CRITICAL",
                92.5,
                "+44 20 7946 0912",
                "Sarah Connor (CFO)",
                json.dumps([
                    "Synthetic deepfake detected (ElevenLabs voice clone fingerprint)",
                    "Biometric mismatch against enrolled voiceprint",
                    "Urgent wire transfer intent detected (₹50,000)"
                ]),
                "NEW",
                "Flagged for urgent analyst review",
                "BLOCK_AND_ISOLATE"
            ),
            (
                "INC-2026-9881",
                now,
                "HIGH",
                74.0,
                "+1-800-555-0199",
                "David Vance (VP IT Security)",
                json.dumps([
                    "Sensitive 2FA passcode solicitation trigger matched",
                    "Untrusted external PSTN channel origin"
                ]),
                "ACKNOWLEDGED",
                "Acknowledged by Tier-1 SOC Team",
                "STEP_UP_CHALLENGE"
            )
        ]
        cursor.executemany("""
            INSERT INTO security_incidents 
            (incident_id, timestamp, severity, risk_score, caller_id, target_identity, threat_indicators, status, analyst_notes, mitigation_action_taken)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, default_seed)
        conn.commit()

    conn.close()


# Ensure DB is initialized on module load
init_db()


class SecurityAlertService:
    """
    VoiceGuard Automated Security Incident Alerting & Webhook Dispatch Engine.
    Handles incident generation, deduplication (60s window), SQLite persistence, and webhook dispatching.
    """

    def __init__(self):
        self.webhook_url = os.getenv("SECURITY_WEBHOOK_URL", "")

    def is_duplicate(self, caller_id: str, cooldown_seconds: int = 60) -> bool:
        """Checks if a high-threat incident for the same caller_id was recorded within the cooldown window."""
        if not caller_id:
            return False

        conn = get_db_connection()
        cursor = conn.cursor()

        cutoff = (datetime.datetime.utcnow() - datetime.timedelta(seconds=cooldown_seconds)).isoformat() + "Z"
        cursor.execute(
            "SELECT incident_id FROM security_incidents WHERE caller_id = ? AND timestamp >= ? LIMIT 1",
            (caller_id, cutoff)
        )
        row = cursor.fetchone()
        conn.close()
        return row is not None

    def dispatch_webhook(self, incident: dict) -> bool:
        """Dispatches incident payload to external webhook URL if configured."""
        webhook_url = self.webhook_url or os.getenv("SECURITY_WEBHOOK_URL", "")
        if not webhook_url:
            logger.info(f"[ALERT DISPATCH] Webhook payload generated for {incident['incident_id']} (No remote URL set).")
            return True

        try:
            req = urllib.request.Request(
                webhook_url,
                data=json.dumps(incident).encode("utf-8"),
                headers={"Content-Type": "application/json", "User-Agent": "VoiceGuard-SIEM-Dispatcher/2.4"}
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                logger.info(f"[ALERT DISPATCH] Webhook successfully delivered to {webhook_url} (HTTP {resp.status})")
                return True
        except Exception as e:
            logger.error(f"[ALERT DISPATCH] Webhook delivery failed: {e}")
            return False

    def create_incident(
        self,
        risk_score: float,
        caller_id: str = "+1-555-019-2834",
        target_identity: str = "Unknown / Executive",
        threat_indicators: list = None,
        verdict: str = "HIGH_RISK",
        mitigation_action: str = None
    ) -> dict:
        """
        Creates a new Security Incident record when risk_score >= 65% or synthetic deepfake is detected.
        Enforces 60s deduplication cooldown per caller_id.
        """
        # Deduplication check
        if self.is_duplicate(caller_id, cooldown_seconds=60):
            logger.info(f"[ALERT ENGINE] Duplicate incident alert suppressed for caller {caller_id} (60s cooldown active).")
            return None

        risk_score = round(float(risk_score), 1)
        severity = "CRITICAL" if risk_score >= 85.0 or verdict == "DEEPFAKE" else "HIGH"
        
        if not mitigation_action:
            mitigation_action = "BLOCK_AND_FLAG" if severity == "CRITICAL" else "SUSPEND_AND_REVIEW"

        now = datetime.datetime.utcnow().isoformat() + "Z"
        rand_str = "".join(random.choices(string.ascii_uppercase + string.digits, k=5))
        incident_id = f"INC-2026-{rand_str}"

        indicators = threat_indicators if threat_indicators else ["Suspicious deepfake/social engineering pattern detected"]
        indicators_json = json.dumps(indicators)

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO security_incidents 
            (incident_id, timestamp, severity, risk_score, caller_id, target_identity, threat_indicators, status, analyst_notes, mitigation_action_taken)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'NEW', '', ?)
        """, (incident_id, now, severity, risk_score, caller_id, target_identity, indicators_json, mitigation_action))
        conn.commit()
        conn.close()

        incident_dict = {
            "incident_id": incident_id,
            "timestamp": now,
            "severity": severity,
            "risk_score": risk_score,
            "caller_id": caller_id,
            "target_identity": target_identity,
            "threat_indicators": indicators,
            "status": "NEW",
            "analyst_notes": "",
            "mitigation_action_taken": mitigation_action
        }

        logger.info(f"[ALERT ENGINE] 🚨 SECURITY INCIDENT CREATED: {incident_id} [{severity}] Score: {risk_score}%")
        self.dispatch_webhook(incident_dict)
        return incident_dict

    def get_incidents(self, severity: str = None, status: str = None, page: int = 1, limit: int = 50) -> dict:
        """Fetches paginated list of recorded security incidents from SQLite database."""
        conn = get_db_connection()
        cursor = conn.cursor()

        query = "SELECT * FROM security_incidents WHERE 1=1"
        params = []

        if severity and severity.upper() != "ALL":
            query += " AND severity = ?"
            params.append(severity.upper())

        if status and status.upper() != "ALL":
            query += " AND status = ?"
            params.append(status.upper())

        query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
        offset = (max(1, page) - 1) * limit
        params.extend([limit, offset])

        cursor.execute(query, params)
        rows = cursor.fetchall()

        # Count total
        count_query = "SELECT COUNT(*) as total FROM security_incidents WHERE 1=1"
        count_params = []
        if severity and severity.upper() != "ALL":
            count_query += " AND severity = ?"
            count_params.append(severity.upper())
        if status and status.upper() != "ALL":
            count_query += " AND status = ?"
            count_params.append(status.upper())

        cursor.execute(count_query, count_params)
        total_count = cursor.fetchone()["total"]

        conn.close()

        incidents_list = []
        for r in rows:
            d = dict(r)
            try:
                d["threat_indicators"] = json.loads(d["threat_indicators"])
            except Exception:
                d["threat_indicators"] = [d["threat_indicators"]]
            incidents_list.append(d)

        return {
            "incidents": incidents_list,
            "total": total_count,
            "page": page,
            "limit": limit
        }

    def update_incident_status(self, incident_id: str, status: str, analyst_notes: str = None) -> dict:
        """Updates the status and analyst notes for a recorded incident."""
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM security_incidents WHERE incident_id = ?", (incident_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return None

        status_upper = status.upper()
        notes_str = analyst_notes if analyst_notes is not None else row["analyst_notes"]

        cursor.execute("""
            UPDATE security_incidents 
            SET status = ?, analyst_notes = ? 
            WHERE incident_id = ?
        """, (status_upper, notes_str, incident_id))
        conn.commit()

        cursor.execute("SELECT * FROM security_incidents WHERE incident_id = ?", (incident_id,))
        updated_row = dict(cursor.fetchone())
        conn.close()

        try:
            updated_row["threat_indicators"] = json.loads(updated_row["threat_indicators"])
        except Exception:
            updated_row["threat_indicators"] = [updated_row["threat_indicators"]]

        logger.info(f"[ALERT ENGINE] Incident {incident_id} updated to {status_upper}")
        return updated_row


# Global Service Instance
alert_service_instance = SecurityAlertService()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="VoiceGuard Security Incident Alert Service")
    parser.add_argument("--trigger", action="store_true", help="Trigger a new incident")
    parser.add_argument("--list", action="store_true", help="List security incidents")
    parser.add_argument("--update", action="store_true", help="Update incident status")
    parser.add_argument("--score", type=float, default=88.5, help="Risk score")
    parser.add_argument("--caller", type=str, default="+44 20 7946 0912", help="Caller ID")
    parser.add_argument("--target", type=str, default="Sarah Connor (CFO)", help="Target identity")
    parser.add_argument("--indicators", type=str, default=None, help="JSON threat indicators string")
    parser.add_argument("--id", type=str, default=None, help="Incident ID")
    parser.add_argument("--status", type=str, default="NEW", help="Status filter or new status")
    parser.add_argument("--severity", type=str, default=None, help="Severity filter")
    parser.add_argument("--notes", type=str, default=None, help="Analyst notes")

    args = parser.parse_args()

    if args.trigger:
        indicators_list = json.loads(args.indicators) if args.indicators else ["Neural deepfake voice clone detected"]
        res = alert_service_instance.create_incident(
            risk_score=args.score,
            caller_id=args.caller,
            target_identity=args.target,
            threat_indicators=indicators_list
        )
        print(json.dumps(res, indent=2))
    elif args.update and args.id:
        res = alert_service_instance.update_incident_status(args.id, args.status, args.notes)
        print(json.dumps(res, indent=2))
    else:
        res = alert_service_instance.get_incidents(severity=args.severity, status=args.status)
        print(json.dumps(res, indent=2))
