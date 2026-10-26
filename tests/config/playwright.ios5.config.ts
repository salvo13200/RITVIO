import {defineConfig} from '@playwright/test';
import base from './playwright.ios4.config';
export default defineConfig({...base,testMatch:['ios4-ui.spec.ts','ios5-ui.spec.ts'],outputDir:'test-results/ios5'});
