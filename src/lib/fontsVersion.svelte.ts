/**
 * Web フォントの読み込みが進むたびに増える値。canvas は読み込み前のフォントだと
 * 代替書体で描いてしまうので、これを読むことで読み込み後に描き直す。
 */
class FontsVersion {
	value = $state(0);
	constructor() {
		if (typeof document !== 'undefined' && document.fonts) {
			document.fonts.addEventListener('loadingdone', () => this.value++);
		}
	}
}
export const fontsVersion = new FontsVersion();
