import base from './playwright.accessibility-regression.config';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,testMatch:[...(Array.isArray(base.testMatch)?base.testMatch:[]),'ui-performance.spec.ts'],workers:1});
