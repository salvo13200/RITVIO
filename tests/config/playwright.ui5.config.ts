import base from './playwright.desktop.config';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,testMatch:'ui5.spec.ts',workers:1});
