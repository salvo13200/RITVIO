import base from './playwright.android5.config';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,testMatch:['android2-ui.spec.ts','android3-ui.spec.ts','android4-ui.spec.ts','android5-ui.spec.ts','android6-ui.spec.ts']});
