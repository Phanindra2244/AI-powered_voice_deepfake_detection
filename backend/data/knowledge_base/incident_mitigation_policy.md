# VoiceGuard Security Incident & Mitigation Policy

## Risk Severity Matrix & Automated Protocol

### 1. CRITICAL RISK (Score 81 - 100)
- **Condition**: High AI voice probability (≥ 85%) OR urgent wire transfer request over untrusted VoIP gateway.
- **Action**: Immediate automated call isolation, block transaction execution, dispatch critical alert via Server-Sent Events (SSE), and log incident in `incidents.db` with status `NEW`.
- **Recommendation**: Do not approve transaction; demand secondary out-of-band biometric verification.

### 2. HIGH RISK (Score 61 - 80)
- **Condition**: High social engineering risk OR executive impersonation claim over external PSTN network.
- **Action**: Trigger step-up verification challenge modal, log alert in SOC incident drawer.
- **Recommendation**: Verify caller identity independently through trusted corporate directory.

### 3. MEDIUM RISK (Score 31 - 60)
- **Condition**: Moderate urgency tactics or unverified caller identity.
- **Action**: Step-up verification advisory, monitor conversation context.

### 4. LOW RISK (Score 0 - 30)
- **Condition**: Authentic human voice verified with smooth acoustic shimmer, clean conversation posture.
- **Action**: Proceed with standard operational guidelines.
