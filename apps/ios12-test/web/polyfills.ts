import 'core-js/stable';
import '@formatjs/intl-locale/polyfill';
import '@formatjs/intl-pluralrules/polyfill';
import '@formatjs/intl-pluralrules/locale-data/en';
import '@formatjs/intl-pluralrules/locale-data/it';
import 'pepjs';
import ResizeObserver from 'resize-observer-polyfill';
Object.defineProperty(window,'ritvioLegacyTouch',{value:true});
if(!window.ResizeObserver)Object.defineProperty(window,'ResizeObserver',{value:ResizeObserver});
/** PEP requires a touch-action attribute on the actual pointer interaction surface. */
const apply=()=>document.querySelectorAll('.ios-grip,.ios-library-grip').forEach(element=>element.setAttribute('touch-action','none'));
new MutationObserver(apply).observe(document.documentElement,{childList:true,subtree:true});
