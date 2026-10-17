import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,grep:/metadata (ambiguous|edition|empty|details)/});
