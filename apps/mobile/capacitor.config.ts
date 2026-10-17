import type {CapacitorConfig} from '@capacitor/cli';
const config:CapacitorConfig={
  appId:'it.ritvio.android',appName:'RITVIO',webDir:'web-dist',
  server:{androidScheme:'https'},
  android:{allowMixedContent:false,webContentsDebuggingEnabled:false},
  plugins:{SystemBars:{style:'DARK',insetsHandling:'css',initialViewportFitValueHint:'cover'}},
};
export default config;
