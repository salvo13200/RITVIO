import base from './playwright.updates.config';
import {defineConfig} from '@playwright/test';
import path from 'node:path';
export default defineConfig({...base,testMatch:'first-use-ui.spec.ts',outputDir:path.resolve(import.meta.dirname,'../../test-results/first-use'),timeout:60000});
