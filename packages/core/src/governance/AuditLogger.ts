/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

<<<<<<< HEAD
import { GovernanceContext } from './types.js';
=======
<<<<<<< HEAD
<<<<<<< HEAD
import type { GovernanceContext } from './types.js';
=======
import { GovernanceContext } from './types.js';
>>>>>>> origin/main
=======
import { GovernanceContext } from './types.js';
>>>>>>> origin/main
>>>>>>> d021bb0 (Apply patch /tmp/0bb54392-b4c6-4923-8595-46cf05da677d.patch)
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
<<<<<<< HEAD
=======
<<<<<<< HEAD
<<<<<<< HEAD

    // Send to centralized SIEM if configured
    const endpoint = process.env['GOVERNANCE_LOG_ENDPOINT'];
    if (endpoint) {
        fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(logEntry)
        }).catch(err => {
            // Silently fail to avoid disrupting the user flow, but maybe log to debug
            // console.error('Failed to send log to SIEM:', err);
        });
    }
=======
>>>>>>> origin/main
=======
>>>>>>> origin/main
>>>>>>> d021bb0 (Apply patch /tmp/0bb54392-b4c6-4923-8595-46cf05da677d.patch)
  }
}
