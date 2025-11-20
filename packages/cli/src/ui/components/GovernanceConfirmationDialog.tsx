/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { ConfirmationDialog } from './shared/ConfirmationDialog.js';
import { theme } from '../semantic-colors.js';

interface GovernanceConfirmationDialogProps {
  riskLevel: string;
  riskCategory: string;
  justification: string;
  onComplete: (result: { userSelection: 'confirm' | 'reject' }) => void;
}

export const GovernanceConfirmationDialog = ({
  riskLevel,
  riskCategory,
  justification,
  onComplete,
}: GovernanceConfirmationDialogProps) => {
  const warningMessage = `High Risk Content Detected!\n\nRisk Level: ${riskLevel}\nCategory: ${riskCategory}\nReason: ${justification}\n\nDo you confirm you have reviewed it and want to proceed?`;

  return (
    <ConfirmationDialog
      message={warningMessage}
      options={[
        { label: 'No', value: 'reject' },
        { label: 'Yes', value: 'confirm' },
      ]}
      onSelect={(option) => {
        onComplete({ userSelection: option.value as 'confirm' | 'reject' });
      }}
      title="Governance Review Required"
      borderColor={theme.status.warning}
    />
  );
};
