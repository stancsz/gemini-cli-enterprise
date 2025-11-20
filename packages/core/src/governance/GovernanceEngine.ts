/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { PIIFilter } from './PIIFilter.js';
import { RiskClassifier } from './RiskClassifier.js';
import { OutputGuardrail } from './OutputGuardrail.js';
import { AuditLogger } from './AuditLogger.js';
import { type GovernanceContext, RiskLevel, DEFAULT_POLICIES } from './types.js';
import type { Part, GenerateContentResponse } from '@google/genai';
import { randomUUID } from 'crypto';

export class GovernanceEngine {
  private piiFilter: PIIFilter;
  private riskClassifier: RiskClassifier;
  private outputGuardrail: OutputGuardrail;
  private auditLogger: AuditLogger;
  private policies = DEFAULT_POLICIES;

  constructor() {
    this.piiFilter = new PIIFilter();
    this.riskClassifier = new RiskClassifier();
    this.outputGuardrail = new OutputGuardrail();
    this.auditLogger = new AuditLogger();
  }

  interceptRequest(input: Part[], modelVersion: string, modelParams: Record<string, unknown>): { context: GovernanceContext; proceed: boolean; error?: string } {
    const requestId = randomUUID();
    // Ideally get user ID from config or auth context
    const userId = process.env['USER'] || 'unknown_user';

    let redactedInput = input;
    let justification = '';

    if (this.policies.piiRedaction) {
        const result = this.piiFilter.redact(input);
        redactedInput = result.redactedParts;
        if (result.wasRedacted) {
            justification = 'PII Redacted: ' + result.justifications.join(', ');
        }
    }

    const { level, category } = this.riskClassifier.classify(redactedInput);

    const context: GovernanceContext = {
      userId,
      requestId,
      timestamp: Date.now(),
      originalInput: input,
      redactedInput,
      riskLevel: level,
      riskCategory: category,
      modelVersion,
      modelParams,
      justification
    };

    if (this.policies.blockHighRisk && level === RiskLevel.HIGH) { // Or CRITICAL if we had it
       context.guardrailDecision = 'BLOCKED';
       this.auditLogger.log(context);
       return { context, proceed: false, error: 'Request blocked due to High Risk policy.' };
    }

    return { context, proceed: true };
  }

  interceptResponse(context: GovernanceContext, response: GenerateContentResponse): { response: GenerateContentResponse; proceed: boolean; error?: string; decision?: string } {
    context.output = response;
    const { decision, reason } = this.outputGuardrail.validate(response, context.riskLevel || RiskLevel.LOW);
    context.guardrailDecision = decision;

    if (reason) {
        context.justification = (context.justification ? context.justification + '; ' : '') + reason;
    }

    this.auditLogger.log(context);

    if (decision === 'BLOCKED') {
        return { response, proceed: false, error: 'Output blocked: ' + reason };
    }

    if (decision === 'FLAGGED_FOR_REVIEW') {
        // Logic moved to client layer to handle interactivity using the decision status
        return { response, proceed: true, error: 'Output flagged for review', decision: 'FLAGGED_FOR_REVIEW' };
    }

    return { response, proceed: true, decision: 'APPROVED' };
  }
}
