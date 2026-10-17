import base from './playwright.android2.config';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,testMatch:['android2-ui.spec.ts','android3-ui.spec.ts']});
