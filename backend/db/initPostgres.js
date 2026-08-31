import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, isPostgresActive } from './postgres.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

export async function initializePostgresSchema() {
  if (!isPostgresActive()) {
    return { success: false, mode: 'SQLite Fallback' };
  }

  try {
    const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    await query(schemaSql);

    // Seed default incidents if table is empty
    const checkRes = await query('SELECT COUNT(*) as count FROM security_incidents');
    if (checkRes && Number(checkRes.rows[0].count) === 0) {
      const now = new Date().toISOString();
      const seedSql = `
        INSERT INTO security_incidents 
        (incident_id, timestamp, severity, risk_score, caller_id, target_identity, threat_indicators, status, analyst_notes, mitigation_action_taken)
        VALUES 
        ('INC-2026-9904', $1, 'CRITICAL', 92.5, '+44 20 7946 0912', 'Sarah Connor (CFO)', $2, 'NEW', 'Flagged for urgent analyst review', 'BLOCK_AND_ISOLATE'),
        ('INC-2026-9881', $3, 'HIGH', 74.0, '+1-800-555-0199', 'David Vance (VP IT Security)', $4, 'ACKNOWLEDGED', 'Acknowledged by Tier-1 SOC Team', 'STEP_UP_CHALLENGE')
      `;
      await query(seedSql, [
        now,
        JSON.stringify(["Synthetic deepfake detected (ElevenLabs voice clone fingerprint)", "Biometric mismatch against enrolled voiceprint", "Urgent wire transfer intent detected (₹50,000)"]),
        now,
        JSON.stringify(["Sensitive 2FA passcode solicitation trigger matched", "Untrusted external PSTN channel origin"])
      ]);
      console.log('✅ Seeded default security incident records into PostgreSQL.');
    }

    return { success: true, mode: 'PostgreSQL' };
  } catch (err) {
    console.error('Failed to initialize PostgreSQL schema:', err.message);
    return { success: false, error: err.message };
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  initializePostgresSchema().then(res => console.log('Init result:', res));
}
