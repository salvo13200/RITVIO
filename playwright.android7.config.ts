import base from './playwright.android-review.config';
import {defineConfig} from '@playwright/test';
process.env.RITVIO_MOBILE_REVIEW='';
process.env.RITVIO_ANDROID7='1';
export default defineConfig({...base,testMatch:['android2-ui.spec.ts','android3-ui.spec.ts','android4-ui.spec.ts','android5-ui.spec.ts','android6-ui.spec.ts','android-review-ui.spec.ts','android7-ui.spec.ts']});
