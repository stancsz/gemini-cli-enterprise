
# AI Policy - Governance Fork

This document outlines the Artificial Intelligence Management System (AIMS) policy for this fork of Gemini CLI, ensuring compliance with ISO/IEC 42001 and the EU AI Act.

## 1. Purpose
This AI system is designed to assist developers in coding tasks. This fork introduces a governance layer to ensure safe, ethical, and compliant use in enterprise environments.

## 2. Scope
This policy applies to all uses of this software within the organization.

## 3. Principles
-   **Safety**: The system shall not generate malicious code or harmful content.
-   **Privacy**: PII and proprietary data must be protected and redacted where appropriate.
-   **Transparency**: Users must be informed when they are interacting with an AI system.
-   **Accountability**: All AI interactions are logged and auditable.

## 4. Risk Management
-   **High-Risk Use Cases**: Use cases such as HR decisions, financial advice, or critical infrastructure management are classified as High Risk.
-   **Controls**: High-Risk uses require human-in-the-loop verification.

## 5. Governance Layer
This software includes a mandatory governance layer that:
-   Filters inputs for PII.
-   Classifies prompt risk.
-   Logs model traceability data.
-   Scans outputs for safety violations.
