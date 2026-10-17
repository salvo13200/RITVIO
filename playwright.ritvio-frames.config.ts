import base from './playwright.config';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,testMatch:'ritvio-frames.spec.ts',timeout:60000});
