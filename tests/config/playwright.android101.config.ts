import base from './playwright.android10.config';
import {defineConfig} from '@playwright/test';
process.env.RITVIO_ANDROID101='1';
export default defineConfig({...base,testMatch:['android6-ui.spec.ts']});
