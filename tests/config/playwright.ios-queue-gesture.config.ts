import {defineConfig} from '@playwright/test';
import base from './playwright.ios4.config';
export default defineConfig({...base,testMatch:'ios-queue-gesture-ui.spec.ts',outputDir:'../../.local/ios/artifacts/queue-gesture-checks',use:{...base.use,trace:'retain-on-failure',screenshot:'only-on-failure'}});
