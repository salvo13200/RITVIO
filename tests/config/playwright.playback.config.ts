import base from './playwright.desktop.config';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,testMatch:['desktop-resilience.spec.ts','ui-playback-preparation.spec.ts','desktop-buffer-ui.spec.ts','ui.spec.ts'],grep:/resilience:|buffer transport:|preparation:|pause and resume reuse|invalid audio refreshes|rapid track changes|expired stream is renewed|ending the queue|debounced search plays real|shuffle plan|sleep timer/,workers:1});
