/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Part, GenerateContentResponse } from '@google/genai';

export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface GovernanceContext {
  userId: string;
  requestId: string;
  timestamp: number;
  originalInput: Part[];
  redactedInput?: Part[];
  riskLevel?: RiskLevel;
  riskCategory?: string;
  modelVersion?: string;
  modelParams?: Record<string, unknown>;
  output?: GenerateContentResponse;
  guardrailDecision?: 'APPROVED' | 'BLOCKED' | 'FLAGGED_FOR_REVIEW';
  justification?: string;
}

export interface IPolicies {
    piiRedaction: boolean;
    blockHighRisk: boolean;
    requireHumanReview: boolean;
}

export const DEFAULT_POLICIES: IPolicies = {
    piiRedaction: true,
    blockHighRisk: false,
    requireHumanReview: true, // For high risk
};
