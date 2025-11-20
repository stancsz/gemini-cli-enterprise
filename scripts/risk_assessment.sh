#!/bin/bash
# Enterprise AI Risk Assessment (AIRA) Tool
# ISO/IEC 42001 & EU AI Act Compliance Check
#
# Usage: ./scripts/risk_assessment.sh

set -e

LOG_DIR="$HOME/.gemini/governance_logs"
LOG_FILE="$LOG_DIR/audit_trail.jsonl"
PII_FILTER_SOURCE="packages/core/src/governance/PIIFilter.ts"
AUDIT_LOGGER_SOURCE="packages/core/src/governance/AuditLogger.ts"

echo "========================================================="
echo "      Enterprise AI Risk Assessment (AIRA)               "
echo "========================================================="
echo "Date: $(date)"
echo ""

# 1. Security & Governance Layer Verification
echo "[1] Governance Layer Availability"
if [ -f "packages/core/src/governance/GovernanceEngine.ts" ]; then
    echo "   [PASS] Governance Engine source detected."
else
    echo "   [FAIL] Governance Engine source missing!"
    exit 1
fi

# 2. PII Redaction Patterns Verification
echo "[2] Sensitive Data Redaction (DLP) Configuration"
if [ -f "$PII_FILTER_SOURCE" ]; then
    echo "   [INFO] Scanning PII definitions..."
    if grep -q "EMP-" "$PII_FILTER_SOURCE"; then
        echo "   [PASS] Employee ID redaction configured."
    else
        echo "   [FAIL] Employee ID redaction missing."
    fi

    if grep -q "PROJECT-" "$PII_FILTER_SOURCE"; then
        echo "   [PASS] Project Codeword redaction configured."
    else
        echo "   [FAIL] Project Codeword redaction missing."
    fi

    if grep -q "Credit Card" "$PII_FILTER_SOURCE"; then
        echo "   [PASS] Credit Card redaction configured."
    else
        echo "   [FAIL] Credit Card redaction missing."
    fi
else
    echo "   [FAIL] PII Filter source not found."
fi

# 3. Audit Logging Verification
echo "[3] Audit & Traceability"
if [ -f "$AUDIT_LOGGER_SOURCE" ]; then
    if grep -q "GOVERNANCE_LOG_ENDPOINT" "$AUDIT_LOGGER_SOURCE"; then
         echo "   [PASS] SIEM Integration (HTTP Logging) capability detected."
    else
         echo "   [FAIL] SIEM Integration missing in AuditLogger."
    fi
else
    echo "   [FAIL] AuditLogger source not found."
fi

echo "   [INFO] Checking local audit trail..."
if [ -d "$LOG_DIR" ]; then
    if [ -f "$LOG_FILE" ]; then
        LOG_COUNT=$(wc -l < "$LOG_FILE" | tr -d ' ')
        echo "   [PASS] Audit log file exists ($LOG_COUNT entries)."
        # Optional: Check for recent activity
    else
        echo "   [WARN] Audit log file created but empty or missing."
    fi
else
    echo "   [WARN] Audit log directory does not exist yet (will be created on first run)."
fi

# 4. Human-in-the-Loop (HITL) Config
echo "[4] Human-in-the-Loop (HITL) Controls"
if grep -q "requiresApproval" "packages/core/src/governance/GovernanceEngine.ts"; then
    echo "   [PASS] High Risk requiresApproval logic detected in GovernanceEngine."
else
    echo "   [FAIL] High Risk requiresApproval logic not found."
fi

echo ""
echo "========================================================="
echo "Assessment Complete."
