/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GenerateContentResponse } from '@google/genai';
import { RiskLevel } from './types.js';

export class OutputGuardrail {
  validate(response: GenerateContentResponse, riskLevel: RiskLevel): { decision: 'APPROVED' | 'BLOCKED' | 'FLAGGED_FOR_REVIEW'; reason?: string } {
    // Scan output for malicious code, misinformation, or PII.
    // This is a placeholder for a real scanner.

    const content = response.candidates?.[0]?.content;
    if (!content) return { decision: 'APPROVED' };

    let text = '';
    if (content.parts) {
        text = content.parts.map(p => p.text || '').join(' ');
    }

    // Basic PII check in output
    const piiRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g; // Simple email check
    if (text.match(piiRegex)) {
        return { decision: 'BLOCKED', reason: 'PII detected in output' };
    }

    if (riskLevel === RiskLevel.HIGH) {
        // For High-Risk use cases, enforce a Human-in-the-Loop flag
        // In a real CLI, this might mean pausing and asking for user confirmation,
        // or returning a specific status that the UI handles.
        return { decision: 'FLAGGED_FOR_REVIEW', reason: 'High risk use case requires human review' };
    }

    return { decision: 'APPROVED' };
  }
}
