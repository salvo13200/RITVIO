import base from './playwright.android101.config';
import {defineConfig} from '@playwright/test';
process.env.RITVIO_ANDROID102='1';
export default defineConfig(base);
