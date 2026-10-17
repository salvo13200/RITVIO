import base from './playwright.config';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,testMatch:['ui-library-restyle.spec.ts'],workers:1});
