import {defineConfig} from '@playwright/test';
import base from './playwright.ios4.config';
export default defineConfig({...base,testMatch:['ios-story-ui.spec.ts','ios-lyrics-ui.spec.ts'],outputDir:'../../.local/ios/artifacts/sharing-browser-checks',use:{...base.use,trace:'retain-on-failure',screenshot:'only-on-failure'}});
