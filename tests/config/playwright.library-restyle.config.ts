import base from './playwright.desktop.config';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,testMatch:['ui-library-restyle.spec.ts'],workers:1});
