import base from './playwright.config';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,testMatch:['ui-playback-preparation.spec.ts','ui.spec.ts'],grep:/preparation:|pause and resume reuse|invalid audio refreshes|rapid track changes|expired stream is renewed|ending the queue|debounced search plays real|shuffle plan|sleep timer/,workers:1});
