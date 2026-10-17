import {defineConfig} from '@playwright/test';
import base from './playwright.desktop.config';
export default defineConfig({...base,testMatch:'player-controls.spec.ts',workers:1});
