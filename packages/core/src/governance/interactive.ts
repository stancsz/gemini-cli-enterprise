/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as readline from 'readline';

export async function confirmHighRiskAction(warningMessage: string): Promise<boolean> {
    // If we are not in a TTY, we cannot prompt, so we must default to denial or pause
    if (!process.stdin.isTTY) {
        // Log to stderr so it's visible
        console.error('\n' + warningMessage);
        console.error('[GOVERNANCE] Non-interactive session detected. High Risk action cannot be confirmed interactively.');
        // Optionally pause to "force a pause" as requested
        await new Promise(resolve => setTimeout(resolve, 5000));
        return true; // Proceed with warning (or false if we want to block strictly)
    }

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        console.log('\n' + warningMessage);
        rl.question('[GOVERNANCE] Do you confirm you have reviewed this? [y/N] ', (answer) => {
            rl.close();
            if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
                resolve(true);
            } else {
                resolve(false);
            }
        });
    });
}
