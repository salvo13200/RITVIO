import base from './playwright.desktop.config';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,testMatch:['ui-motion.spec.ts','ui-motion-timeout.spec.ts'],workers:1});
