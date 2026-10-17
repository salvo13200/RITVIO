import base from './playwright.config';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,testMatch:['ui-library-restyle.spec.ts','ui.spec.ts','ui5.spec.ts'],grep:/LIB-2|library browsing|central lyrics|versions and personal import/,workers:1});
