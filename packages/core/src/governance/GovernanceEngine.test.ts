
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GovernanceEngine } from './GovernanceEngine';
import { RiskLevel } from './types';
import type { Part } from '@google/genai';

// Mock dependencies
// Vitest mock factory needs to return the module structure
vi.mock('./AuditLogger', () => {
  return {
    AuditLogger: class {
      log = vi.fn();
    },
  };
});

describe('GovernanceEngine', () => {
  let engine: GovernanceEngine;

  beforeEach(() => {
    engine = new GovernanceEngine();
  });

  it('should redact PII from input', () => {
    const input: Part[] = [{ text: 'My email is test@example.com' }];
    const result = engine.interceptRequest(input, 'model-v1', {});

    expect(result.proceed).toBe(true);
    expect(result.context.redactedInput).toBeDefined();
    expect(result.context.redactedInput![0].text).toContain('[REDACTED_EMAIL]');
    expect(result.context.justification).toContain('PII Redacted');
  });

  it('should classify high risk input', () => {
    const input: Part[] = [{ text: 'I need to fire employee' }]; // Contains 'fire employee' trigger
    const result = engine.interceptRequest(input, 'model-v1', {});

    expect(result.context.riskLevel).toBe(RiskLevel.HIGH);
    expect(result.context.riskCategory).toBe('HR Decision');
  });

  it('should require approval if high risk', () => {
    const input: Part[] = [{ text: 'I need to fire employee' }];
    const result = engine.interceptRequest(input, 'model-v1', {});

    // With new logic, High Risk requires approval and returns proceed: false, requiresApproval: true
    expect(result.proceed).toBe(false);
    expect(result.requiresApproval).toBe(true);
    expect(result.context.riskLevel).toBe(RiskLevel.HIGH);
  });

  it('should proceed if high risk but approval granted', () => {
    const input: Part[] = [{ text: 'I need to fire employee' }];
    const result = engine.interceptRequest(input, 'model-v1', {}, { approvalGranted: true });

    expect(result.proceed).toBe(true);
    expect(result.requiresApproval).toBeUndefined();
    expect(result.context.riskLevel).toBe(RiskLevel.HIGH);
  });

  it('should validate output', () => {
    const context = { riskLevel: RiskLevel.LOW } as any;
    const response = {
        candidates: [{ content: { parts: [{ text: 'Here is some code.' }] } }]
    } as any;

    const result = engine.interceptResponse(context, response);
    expect(result.proceed).toBe(true);
    expect(result.response).toBeDefined();
  });

  it('should flag output for review if high risk', () => {
    const context = { riskLevel: RiskLevel.HIGH, riskCategory: 'HR' } as any;
    const response = {
        candidates: [{ content: { parts: [{ text: 'Here is the termination letter.' }] } }]
    } as any;

    const result = engine.interceptResponse(context, response);
    // It proceeds but modifies text with warning
    expect(result.proceed).toBe(true);
    const text = result.response.candidates![0].content.parts![0].text;
    expect(text).toContain('[GOVERNANCE WARNING');
  });
});
