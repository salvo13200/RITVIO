import base from './playwright.config';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,testMatch:['story-audio.spec.ts','story-skip-race.spec.ts']});
