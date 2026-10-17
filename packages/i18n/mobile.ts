import {resources} from './resources-mobile';
import {createLocalization} from './runtime';
// Mobile shares the runtime and common vocabulary, without bundling desktop legacy copy.
export const localization=createLocalization({resources});
