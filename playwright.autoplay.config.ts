import base from './playwright.config';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,testMatch:['ui-autoplay.spec.ts','ui-radio.spec.ts'],workers:1});
