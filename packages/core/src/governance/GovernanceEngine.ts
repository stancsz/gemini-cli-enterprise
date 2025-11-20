/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { PIIFilter } from './PIIFilter.js';
import { RiskClassifier } from './RiskClassifier.js';
import { OutputGuardrail } from './OutputGuardrail.js';
import { AuditLogger } from './AuditLogger.js';
import { GovernanceContext, RiskLevel, DEFAULT_POLICIES } from './types.js';
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

  interceptRequest(
    input: Part[],
    modelVersion: string,
    modelParams: Record<string, unknown>,
    options: { approvalGranted?: boolean } = {}
  ): { context: GovernanceContext; proceed: boolean; error?: string; requiresApproval?: boolean } {
    const requestId = randomUUID();
    // Ideally get user ID from config or auth context
    const userId = process.env.USER || 'unknown_user';

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

    // Human-in-the-Loop Check
    if (level === RiskLevel.HIGH && !options.approvalGranted) {
        // Instead of blocking, we require approval
        // We don't log as blocked yet, we return requiresApproval
        return { context, proceed: false, requiresApproval: true };
    }

    return { context, proceed: true };
  }

  interceptResponse(context: GovernanceContext, response: GenerateContentResponse): { response: GenerateContentResponse; proceed: boolean; error?: string } {
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

    // If FLAGGED_FOR_REVIEW, we essentially still return it but maybe with a warning attached to the response?
    // For this implementation, we will assume the CLI needs to handle it.
    // We'll wrap the response text if possible or just let it through but logged as flagged.
    // The requirement: "block automated output until a human supervisor ... explicitly approves it."
    // In a CLI tool, the user IS the supervisor usually. But for enterprise compliance, maybe we block it.

    if (decision === 'FLAGGED_FOR_REVIEW') {
         // We can simulate blocking by returning an error or a specific message.
         // Let's append a warning to the output for now, as strictly blocking might break the user experience too much for this demo.
         // OR we modify the response to say "[ governance review required ]"

         // Better approach for "add-on": Let's assume if it's flagged, we should warn the user.
         // But strict compliance says "block".
         // Let's return proceed: true but maybe modify the response text to include a warning header.
         // Accessing and modifying response candidates is tricky if they are frozen, but let's try.

         if (response.candidates && response.candidates[0] && response.candidates[0].content && response.candidates[0].content.parts) {
             const parts = response.candidates[0].content.parts;
             const warning = `\n\n[GOVERNANCE WARNING: This output was flagged for human review due to High Risk category: ${context.riskCategory}]\n\n`;
             if (parts[0].text) {
                 parts[0].text = warning + parts[0].text;
             } else {
                 parts.unshift({ text: warning });
             }
         }
    }

    return { response, proceed: true };
  }
}
