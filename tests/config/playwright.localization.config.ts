import {defineConfig} from '@playwright/test';
import base from './playwright.android2.config';
export default defineConfig({...base,testMatch:['localization-ui.spec.ts','english-ui.spec.ts','android6-ui.spec.ts']});
