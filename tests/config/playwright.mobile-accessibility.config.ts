import {defineConfig} from '@playwright/test';
import base from './playwright.android2.config';

export default defineConfig({...base,outputDir:base.outputDir+'/mobile-accessibility',testMatch:'mobile-accessibility.spec.ts'});
