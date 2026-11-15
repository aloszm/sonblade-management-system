import type { FullConfig } from '@playwright/test';
import { recordCashState } from './cash-guard';

export default async function globalSetup(config: FullConfig) {
    await recordCashState(config);
}
