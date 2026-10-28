import {defineConfig} from '@playwright/test';
import base from './playwright.ios4.config';
export default defineConfig({...base,testMatch:['ios4-ui.spec.ts','ios5-ui.spec.ts','ios-catalog-ui.spec.ts','ios-lyrics-ui.spec.ts','ios-queue-gesture-ui.spec.ts'],outputDir:'../../.local/ios/artifacts/browser-checks',use:{...base.use,trace:'retain-on-failure',screenshot:'only-on-failure'}});
