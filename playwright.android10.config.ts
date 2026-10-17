import base from './playwright.android8.config';
import {defineConfig} from '@playwright/test';
process.env.RITVIO_ANDROID10='1';
export default defineConfig({...base,testMatch:[...base.testMatch as string[],'android10-ui.spec.ts']});
