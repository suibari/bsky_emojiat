import { ja, type MessageKey } from './ja';
import { en } from './en';

export type Lang = 'ja' | 'en';
export const LANGS: { id: Lang; label: string; short: string }[] = [
	{ id: 'ja', label: '日本語', short: 'JA' },
	{ id: 'en', label: 'English', short: 'EN' }
];

const STORAGE_KEY = 'emojiat.lang';
const dicts: Record<Lang, Record<MessageKey, string>> = { ja, en };

function initialLang(): Lang {
	if (typeof window === 'undefined') return 'ja';
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved === 'ja' || saved === 'en') return saved;
	} catch {
		// ストレージが使えない環境ではブラウザの言語に従う
	}
	return navigator.language?.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

class I18n {
	lang = $state<Lang>(initialLang());

	set(lang: Lang) {
		this.lang = lang;
		try {
			localStorage.setItem(STORAGE_KEY, lang);
		} catch {
			// 保存できなくても今の表示は切り替わる
		}
	}
}

export const i18n = new I18n();

/** 現在の言語で文言を返す。テンプレートで使うと言語の切り替えに追従する。 */
export function t(key: MessageKey, params?: Record<string, string | number>) {
	let text = dicts[i18n.lang][key] ?? ja[key];
	if (params) for (const [k, v] of Object.entries(params)) text = text.replaceAll(`{${k}}`, String(v));
	return text;
}

/** 日英の名前を持つ定義（書体・エフェクトなど）から表示名を選ぶ。 */
export const localized = (item: { label: string; labelEn: string }) =>
	i18n.lang === 'en' ? item.labelEn : item.label;
