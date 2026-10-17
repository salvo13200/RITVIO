import config from './playwright.desktop.config';
import {defineConfig} from '@playwright/test';
export default defineConfig({...config,testMatch:'home.spec.ts',timeout:45000});
