/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Part } from '@google/genai';

export class PIIFilter {
  private emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  private phoneRegex = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g;
  // Placeholder for more complex PII/Proprietary data patterns

  redact(parts: Part[]): { redactedParts: Part[]; wasRedacted: boolean; justifications: string[] } {
    let wasRedacted = false;
    const justifications: string[] = [];

    const redactedParts = parts.map(part => {
      if (part.text) {
        let newText = part.text;
        if (newText.match(this.emailRegex)) {
          newText = newText.replace(this.emailRegex, '[REDACTED_EMAIL]');
          wasRedacted = true;
          if (!justifications.includes('Email PII detected')) {
            justifications.push('Email PII detected');
          }
        }
        if (newText.match(this.phoneRegex)) {
          newText = newText.replace(this.phoneRegex, '[REDACTED_PHONE]');
          wasRedacted = true;
          if (!justifications.includes('Phone PII detected')) {
            justifications.push('Phone PII detected');
          }
        }
        return { ...part, text: newText };
      }
      return part;
    });

    return { redactedParts, wasRedacted, justifications };
  }
}
