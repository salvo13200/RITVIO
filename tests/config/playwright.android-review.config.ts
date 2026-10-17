import base from './playwright.android6.config';
import {defineConfig} from '@playwright/test';
process.env.RITVIO_MOBILE_REVIEW='1';
export default defineConfig({...base,testMatch:['android2-ui.spec.ts','android3-ui.spec.ts','android4-ui.spec.ts','android5-ui.spec.ts','android6-ui.spec.ts','android-review-ui.spec.ts']});
