import type { FullConfig } from '@playwright/test';
import { restoreCashState } from './cash-guard';

export default async function globalTeardown(config: FullConfig) {
    await restoreCashState(config);
}
