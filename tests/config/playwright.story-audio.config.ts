import base from './playwright.desktop.config';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,testMatch:['story-audio.spec.ts','story-skip-race.spec.ts']});
