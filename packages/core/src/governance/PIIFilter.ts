/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Part } from '@google/genai';

export class PIIFilter {
  private emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  private phoneRegex = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g;
<<<<<<< HEAD
  // Placeholder for more complex PII/Proprietary data patterns

=======
<<<<<<< HEAD
<<<<<<< HEAD
  // Expanded Enterprise Patterns
  private employeeIdRegex = /\b(EMP|ID)-?\d{4,8}\b/g;
  private creditCardRegex = /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g;
  private projectCodeRegex = /\bPROJECT-[A-Z]{3,}\b/g;

=======
  // Placeholder for more complex PII/Proprietary data patterns

>>>>>>> origin/main
=======
  // Placeholder for more complex PII/Proprietary data patterns

>>>>>>> origin/main
>>>>>>> d021bb0 (Apply patch /tmp/0bb54392-b4c6-4923-8595-46cf05da677d.patch)
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
<<<<<<< HEAD
=======
<<<<<<< HEAD
<<<<<<< HEAD
        if (newText.match(this.employeeIdRegex)) {
            newText = newText.replace(this.employeeIdRegex, '[REDACTED_EMP_ID]');
            wasRedacted = true;
            if (!justifications.includes('Employee ID detected')) {
                justifications.push('Employee ID detected');
            }
        }
        if (newText.match(this.creditCardRegex)) {
            newText = newText.replace(this.creditCardRegex, '[REDACTED_CREDIT_CARD]');
            wasRedacted = true;
            if (!justifications.includes('Credit Card detected')) {
                justifications.push('Credit Card detected');
            }
        }
        if (newText.match(this.projectCodeRegex)) {
            newText = newText.replace(this.projectCodeRegex, '[REDACTED_PROJECT_CODE]');
            wasRedacted = true;
            if (!justifications.includes('Project Code detected')) {
                justifications.push('Project Code detected');
            }
        }
=======
>>>>>>> origin/main
=======
>>>>>>> origin/main
>>>>>>> d021bb0 (Apply patch /tmp/0bb54392-b4c6-4923-8595-46cf05da677d.patch)
        return { ...part, text: newText };
      }
      return part;
    });

    return { redactedParts, wasRedacted, justifications };
  }
}
