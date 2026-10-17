import base from './playwright.desktop.config';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,testMatch:['ui3.spec.ts','ui4.spec.ts','ui5.spec.ts','ui6.spec.ts','player-controls.spec.ts'],workers:1});
