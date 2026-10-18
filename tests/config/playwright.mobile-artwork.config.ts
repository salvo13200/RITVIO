import base from './playwright.android10.config';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,testMatch:['mobile-artwork-ui.spec.ts','android10-ui.spec.ts','mobile-latency-ui.spec.ts']});
