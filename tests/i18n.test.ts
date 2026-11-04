import { describe, expect, it } from 'vitest';
import { ja } from '../src/lib/i18n/ja';
import { en } from '../src/lib/i18n/en';
import { i18n, localized, t } from '../src/lib/i18n/index.svelte';
import { EFFECTS, CATEGORIES } from '../src/lib/render/effects';
import { FONTS } from '../src/lib/render/fonts';
import { GRADIENTS } from '../src/lib/render/recipe';

describe('i18n', () => {
	it('has an English string for every key', () => {
		for (const key of Object.keys(ja)) expect(en[key as keyof typeof ja], key).toBeTruthy();
	});

	it('switches language and fills parameters', () => {
		i18n.lang = 'en';
		expect(t('editor.limit', { kb: 256 })).toBe('Limit 256KB');
		i18n.lang = 'ja';
		expect(t('editor.limit', { kb: 256 })).toBe('上限 256KB');
	});

	it('has English names for fonts, effects, categories and gradients', () => {
		i18n.lang = 'en';
		for (const item of [...FONTS, ...EFFECTS, ...CATEGORIES, ...GRADIENTS]) {
			expect(localized(item)).toMatch(/^[A-Za-z0-9 ]+$/);
		}
		i18n.lang = 'ja';
	});
});
