import {defineConfig} from '@playwright/test';
import base from './playwright.desktop.config';
export default defineConfig({...base,grep:/metadata (ambiguous|edition|empty|details)/});
