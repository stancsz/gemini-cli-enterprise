/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Part } from '@google/genai';
import { RiskLevel } from './types.js';

export class RiskClassifier {
  classify(parts: Part[]): { level: RiskLevel; category: string } {
    let combinedText = '';
    for (const part of parts) {
      if (part.text) {
        combinedText += part.text + ' ';
      }
    }
    combinedText = combinedText.toLowerCase();

    // Simple keyword-based classification for demonstration
    if (combinedText.includes('confidential') || combinedText.includes('secret') || combinedText.includes('proprietary')) {
        return { level: RiskLevel.HIGH, category: 'Proprietary Information' };
    }

    if (combinedText.includes('hr decision') || combinedText.includes('fire employee') || combinedText.includes('hiring')) {
        return { level: RiskLevel.HIGH, category: 'HR Decision' };
    }

    if (combinedText.includes('financial advice') || combinedText.includes('invest') || combinedText.includes('stock')) {
        return { level: RiskLevel.HIGH, category: 'Financial Advice' };
    }

    if (combinedText.includes('medical') || combinedText.includes('diagnosis')) {
        return { level: RiskLevel.HIGH, category: 'Medical Advice' };
    }

    return { level: RiskLevel.LOW, category: 'General' };
  }
}
