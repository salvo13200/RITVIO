import base from './playwright.android2.config';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,testMatch:['mobile-listening-tools.spec.ts','android-lyrics-ui.spec.ts','mobile-accessibility.spec.ts'],timeout:60000});
