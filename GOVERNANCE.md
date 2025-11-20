# Governance Layer Documentation

This fork of Gemini CLI includes a Governance Layer designed to meet ISO/IEC 42001 and EU AI Act requirements.

## Architecture

The Governance Layer intercepts all requests and responses to the underlying LLM.

1.  **Input Filter**: Redacts PII (Email, Phone) from prompts before logging.
2.  **Risk Classifier**: Categorizes prompts into Risk Levels (LOW, HIGH).
3.  **Audit Logger**: Logs all transactions to `.gemini/governance_logs/audit_trail.jsonl`.
4.  **Output Guardrail**: Checks model responses for PII or other violations.

## Configuration

Policies can be configured in `packages/core/src/governance/types.ts` (or eventually via a config file).

## Audit Logs

Logs are stored in JSONL format. Each entry contains:
-   Timestamp
-   User ID
-   Risk Level & Category
-   Model Version
-   Redacted Input
-   Guardrail Decision

## High-Risk Scenarios

If a prompt is classified as HIGH RISK (e.g., "financial advice"), the output may be flagged for review or blocked depending on policy settings.
