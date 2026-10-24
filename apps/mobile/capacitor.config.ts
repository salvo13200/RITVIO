import type {CapacitorConfig} from '@capacitor/cli';
import {mobilePlatform} from '../../scripts/mobile-platform.mjs';
const target=mobilePlatform();
const config:CapacitorConfig={
  appId:target.appId,appName:'RITVIO',webDir:target.webDir,
  server:{androidScheme:'https'},
  android:{allowMixedContent:false,webContentsDebuggingEnabled:false},
  ios:{contentInset:'never',backgroundColor:'#0f1117',preferredContentMode:'mobile'},
  plugins:{SystemBars:{style:'DARK',insetsHandling:'css',initialViewportFitValueHint:'cover'}},
};
export default config;
