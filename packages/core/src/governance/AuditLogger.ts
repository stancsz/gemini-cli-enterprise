/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GovernanceContext } from './types.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class AuditLogger {
  private logFilePath: string;

  constructor() {
    const logDir = path.join(os.homedir(), '.gemini', 'governance_logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    this.logFilePath = path.join(logDir, 'audit_trail.jsonl');
  }

  log(context: GovernanceContext) {
    const logEntry = {
      timestamp: new Date(context.timestamp).toISOString(),
      userId: context.userId,
      requestId: context.requestId,
      riskLevel: context.riskLevel,
      riskCategory: context.riskCategory,
      modelVersion: context.modelVersion,
      modelParams: context.modelParams,
      guardrailDecision: context.guardrailDecision,
      justification: context.justification,
      // In a real system, we might store inputs/outputs in a separate secure storage
      // or hash them if they are sensitive, even if redacted.
      // For this requirement: "Centralized, tamper-proof logging of the entire transaction: User ID, Input (redacted), Classification, Model Version..."
      inputRedacted: context.redactedInput,
      output: context.output ? 'Generated Content Present' : 'No Output', // Simplifying output log for brevity in JSONL
    };

    fs.appendFileSync(this.logFilePath, JSON.stringify(logEntry) + '\n');
  }
}
