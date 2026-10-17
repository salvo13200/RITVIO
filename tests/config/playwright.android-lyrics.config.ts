import base from './playwright.android7.config';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,testMatch:['android-lyrics-ui.spec.ts','android2-ui.spec.ts','android6-ui.spec.ts','android-review-ui.spec.ts']});
