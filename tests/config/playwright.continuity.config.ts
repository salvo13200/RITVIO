import base from './playwright.playback.config';
import {defineConfig} from '@playwright/test';
import path from 'node:path';
export default defineConfig({...base,testMatch:'continuity-timing.spec.ts',grep:undefined,timeout:60000,outputDir:path.resolve(import.meta.dirname,'../../test-results/continuity')});
