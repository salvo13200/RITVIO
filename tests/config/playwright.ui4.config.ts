import {defineConfig} from '@playwright/test';
import base from './playwright.desktop.config';
export default defineConfig({...base,testMatch:'ui4.spec.ts',workers:1});
