-- VoiceGuard AI Security Operation Center - PostgreSQL DDL Schema

-- 1. Security Incidents Table
CREATE TABLE IF NOT EXISTS security_incidents (
    incident_id VARCHAR(64) PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    severity VARCHAR(32) NOT NULL,
    risk_score NUMERIC(5, 2) NOT NULL,
    caller_id VARCHAR(128),
    target_identity VARCHAR(128),
    threat_indicators JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(32) NOT NULL DEFAULT 'NEW',
    analyst_notes TEXT DEFAULT '',
    mitigation_action_taken VARCHAR(64) DEFAULT 'BLOCK_AND_ISOLATE'
);

-- Index for fast incident lookup by timestamp and severity
CREATE INDEX IF NOT EXISTS idx_incidents_timestamp ON security_incidents(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON security_incidents(severity);

-- 2. Enrolled Speaker Biometric Profiles Table
CREATE TABLE IF NOT EXISTS enrolled_speakers (
    speaker_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    role VARCHAR(128) NOT NULL,
    department VARCHAR(128) NOT NULL,
    embedding JSONB NOT NULL,
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sample_count INT DEFAULT 1
);

-- 3. System Audit Log Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    event_type VARCHAR(64) NOT NULL,
    source_ip VARCHAR(64) DEFAULT '127.0.0.1',
    details JSONB NOT NULL DEFAULT '{}'::jsonb
);
