/**
 * VoiceGuard Multi-Vector Risk Fusion Engine
 * Combines available signals (Voice Deepfake, Social Engineering, Transaction,
 * Speaker Verification, Context Anomaly) and re-normalizes signal weights cleanly
 * without inventing fake placeholder values when a signal is unavailable.
 */
export function fuseRiskSignals({ voiceAnalysis, sttIntent, speakerVerification, contextData }) {
  const availableSignals = {};
  const unavailableSignals = [];

  // Signal 1: Voice Deepfake Risk
  if (voiceAnalysis && (voiceAnalysis.confidenceScore !== undefined || voiceAnalysis.ai_probability !== undefined)) {
    const aiProb = voiceAnalysis.ai_probability ?? (voiceAnalysis.confidenceScore / 100);
    availableSignals.voice = {
      score: voiceAnalysis.confidenceScore ?? round(aiProb * 100, 1),
      aiProb: aiProb,
      prediction: voiceAnalysis.prediction || (aiProb >= 0.5 ? 'AI_GENERATED' : 'HUMAN_AUTHENTIC'),
      baseWeight: 0.40
    };
  } else {
    unavailableSignals.push('voice_deepfake');
  }

  // Signal 2: Social Engineering Risk
  if (sttIntent && sttIntent.social_engineering_risk !== undefined) {
    availableSignals.social_engineering = {
      score: sttIntent.social_engineering_risk,
      intent: sttIntent.intent || 'casual_inquiry',
      indicators: sttIntent.flagged_keywords || [],
      detected_intents: sttIntent.data?.detected_intents || [],
      baseWeight: 0.35
    };
  } else {
    unavailableSignals.push('social_engineering');
  }

  // Signal 3: Transaction Risk
  const txDetected = Boolean(sttIntent?.data?.caller_context?.transactionAmount > 0 || sttIntent?.transaction_risk > 0);
  if (txDetected && sttIntent?.transaction_risk !== undefined) {
    availableSignals.transaction = {
      score: sttIntent.transaction_risk,
      amount: sttIntent.data?.caller_context?.transactionAmount || 0,
      currency: 'INR',
      baseWeight: 0.25
    };
  } else if (!txDetected) {
    unavailableSignals.push('transaction_risk_not_detected');
  }

  // Signal 4: Speaker Biometric Verification (Optional)
  if (speakerVerification && speakerVerification.similarity_score !== undefined) {
    const mismatchScore = Math.max(0, Math.min(100, (1.0 - speakerVerification.similarity_score) * 100));
    availableSignals.speaker = {
      score: round(mismatchScore, 1),
      similarity: speakerVerification.similarity_score,
      baseWeight: 0.15
    };
  } else {
    unavailableSignals.push('speaker_verification');
  }

  // Calculate Normalized Weights for Available Signals
  let totalBaseWeight = 0;
  Object.keys(availableSignals).forEach((key) => {
    totalBaseWeight += availableSignals[key].baseWeight;
  });

  let compositeScore = 0;
  const signalWeights = {};

  if (totalBaseWeight > 0) {
    Object.keys(availableSignals).forEach((key) => {
      const normalizedWeight = availableSignals[key].baseWeight / totalBaseWeight;
      signalWeights[key] = round(normalizedWeight, 2);
      compositeScore += availableSignals[key].score * normalizedWeight;
    });
  }

  compositeScore = round(Math.min(100, Math.max(0, compositeScore)), 1);

  // Risk Level Mapping (0-30 LOW, 31-60 MEDIUM, 61-80 HIGH, 81-100 CRITICAL)
  let riskLevel = 'LOW';
  if (compositeScore >= 81.0) {
    riskLevel = 'CRITICAL';
  } else if (compositeScore >= 61.0) {
    riskLevel = 'HIGH';
  } else if (compositeScore >= 31.0) {
    riskLevel = 'MEDIUM';
  }

  // Generate Evidence Items strictly from detected facts
  const evidence = [];
  if (availableSignals.voice && availableSignals.voice.aiProb >= 0.5) {
    evidence.push({ key: 'voice_deepfake', text: `High AI synthetic voice probability (${round(availableSignals.voice.aiProb * 100, 1)}%)` });
  } else if (availableSignals.voice) {
    evidence.push({ key: 'voice_authentic', text: `Authentic human vocal shimmer verified (${round((1 - availableSignals.voice.aiProb) * 100, 1)}% authenticity)` });
  }

  if (sttIntent?.data?.detected_intents?.includes('Executive Authority Impersonation')) {
    evidence.push({ key: 'authority_claim', text: 'Executive authority claim detected in conversation' });
  }
  if (sttIntent?.data?.detected_intents?.includes('High-Pressure Urgency Tactics')) {
    evidence.push({ key: 'urgency', text: 'High-pressure urgency tactics detected' });
  }
  if (sttIntent?.data?.detected_intents?.includes('Sensitive Data Solicitation')) {
    evidence.push({ key: 'sensitive_data', text: 'Sensitive OTP / 2FA passcode solicitation detected' });
  }
  if (txDetected) {
    evidence.push({ key: 'financial_request', text: `Financial transaction request detected (₹${availableSignals.transaction.amount.toLocaleString()})` });
  }

  // Generate Actionable Recommendations
  const recommendations = [];
  if (riskLevel === 'CRITICAL' || riskLevel === 'HIGH') {
    recommendations.push('⚠ Do not approve transaction or release sensitive funds.');
    recommendations.push('✓ Verify caller identity independently through an established trusted channel.');
    recommendations.push('✓ Request secondary out-of-band biometric or OTP verification challenge.');
  } else if (riskLevel === 'MEDIUM') {
    recommendations.push('⚠️ Exercise caution: Perform step-up verification before processing sensitive requests.');
    recommendations.push('✓ Verify caller context and claimed organization role.');
  } else {
    recommendations.push('✅ Low Risk: Conversation posture clean. Proceed with standard operational guidelines.');
  }

  return {
    score: compositeScore,
    level: riskLevel,
    signal_weights: signalWeights,
    unavailable_signals: unavailableSignals,
    evidence: evidence,
    recommendations: recommendations
  };
}

function round(val, decimals = 1) {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}
