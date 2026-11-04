/** 絵文字に使う書体。すべて Google Fonts（OFL）。family は CSS 上の名前。 */
export type FontDef = { id: string; family: string; weight: number; label: string };

export const FONTS: FontDef[] = [
	{ id: 'mplus', family: 'M PLUS 1p', weight: 900, label: 'ふとゴシック' },
	{ id: 'notosans', family: 'Noto Sans JP', weight: 900, label: 'ゴシック' },
	{ id: 'dela', family: 'Dela Gothic One', weight: 400, label: 'ごんぶと' },
	{ id: 'zenmaru', family: 'Zen Maru Gothic', weight: 900, label: 'まるゴシック' },
	{ id: 'kosugimaru', family: 'Kosugi Maru', weight: 400, label: 'ほそまる' },
	{ id: 'notoserif', family: 'Noto Serif JP', weight: 900, label: '明朝' },
	{ id: 'kaisei', family: 'Kaisei Decol', weight: 700, label: 'かざり明朝' },
	{ id: 'zenantique', family: 'Zen Antique', weight: 400, label: 'レトロ' },
	{ id: 'yujisyuku', family: 'Yuji Syuku', weight: 400, label: '筆' },
	{ id: 'mochiy', family: 'Mochiy Pop One', weight: 400, label: 'ぽっぷ' },
	{ id: 'potta', family: 'Potta One', weight: 400, label: 'ゆるふで' },
	{ id: 'hachimaru', family: 'Hachi Maru Pop', weight: 400, label: '丸文字' },
	{ id: 'yusei', family: 'Yusei Magic', weight: 400, label: 'マーカー' },
	{ id: 'reggae', family: 'Reggae One', weight: 400, label: 'レゲエ' },
	{ id: 'rocknroll', family: 'RocknRoll One', weight: 400, label: 'ロック' },
	{ id: 'rampart', family: 'Rampart One', weight: 400, label: '立体' },
	{ id: 'trainone', family: 'Train One', weight: 400, label: 'ふちどり' },
	{ id: 'dotgothic', family: 'DotGothic16', weight: 400, label: 'ドット' }
];

export const fontById = (id: string) => FONTS.find((f) => f.id === id) ?? FONTS[0];

export const cssFont = (font: FontDef, px: number) =>
	`${font.weight} ${px}px "${font.family}", "Noto Sans JP", sans-serif`;

/** Google Fonts の CSS URL。日本語は unicode-range で分割されるので、使った字だけ落ちてくる。 */
export const googleFontsHref = () => {
	const families = FONTS.map((f) => {
		const name = f.family.replace(/ /g, '+');
		return f.weight === 400 ? `family=${name}` : `family=${name}:wght@${f.weight}`;
	});
	// UI 用に Noto Sans JP の通常ウェイトも含める
	families.push('family=Noto+Sans+JP:wght@400;500;700;900');
	return `https://fonts.googleapis.com/css2?${[...new Set(families)].join('&')}&display=swap`;
};

/** 指定の文字を描く前にフォントを読み込ませる。canvas は未読込のフォントを待ってくれない。 */
export async function ensureFont(font: FontDef, text: string) {
	if (typeof document === 'undefined' || !document.fonts) return;
	const sample = text.replace(/\s/g, '') || 'あ';
	try {
		await document.fonts.load(cssFont(font, 64), sample);
	} catch {
		// 読み込めなくてもフォールバック書体で描画を続ける
	}
}
