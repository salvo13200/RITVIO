import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import type {Plugin as PostCSSPlugin} from 'postcss';
const base=import.meta.dirname;
/** Physical fallback spacing: iOS 12 supports grid gap, but not flex gap/inset. */
export function legacyLayout():PostCSSPlugin{return {postcssPlugin:'ritvio-ios12-layout',Once(root){
 root.walkRules(rule=>{
  rule.walkDecls('inset',decl=>{const parts=decl.value.trim().split(/\s+/);if(parts.length<=4){const values=[parts[0],parts[1]??parts[0],parts[2]??parts[0],parts[3]??parts[1]??parts[0]];['top','right','bottom','left'].forEach((prop,i)=>decl.cloneBefore({prop,value:values[i]}));decl.remove();}});
  const gap=rule.nodes.find((node:any)=>node.type==='decl'&&node.prop==='gap') as any;
  if(!gap||rule.nodes.some((node:any)=>node.type==='decl'&&node.prop==='display'&&node.value.includes('grid'))||/ios-player$|library-grid|skeleton/.test(rule.selector))return;
  const column=rule.nodes.some((node:any)=>node.type==='decl'&&node.prop==='flex-direction'&&node.value==='column');
  const value=gap.value;gap.value='0';rule.cloneAfter({selector:rule.selector.split(',').map(selector=>selector.trim()+' > * + *').join(','),nodes:[gap.clone({prop:column?'margin-top':'margin-left',value})]});
 });
}};}
export default defineConfig({root:path.join(base,'web'),plugins:[react()],resolve:{alias:[{find:'@capacitor/core',replacement:path.join(base,'web/capacitor.ts')}]},css:{postcss:{plugins:[legacyLayout()]}},build:{outDir:path.resolve(base,'../../.local/ios12/web'),emptyOutDir:true,target:'safari12',cssTarget:'safari12',modulePreload:false},server:{host:'127.0.0.1',port:5186,strictPort:true,fs:{allow:[path.resolve(base,'../..')]}}});
