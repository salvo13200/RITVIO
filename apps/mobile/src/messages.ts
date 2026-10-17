import {localization} from '../../../packages/i18n/mobile';
import {phraseTranslator} from '../../../packages/i18n/phrases';
import {noticeTranslator} from '../../../packages/i18n/notices';
export const msg=phraseTranslator(localization);
export const formatLocale=()=>localization.getSnapshot().locale;
export const noticeText=noticeTranslator(localization);
