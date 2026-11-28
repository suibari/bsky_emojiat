/**
 * 文字の配置計算。描画（canvas）から切り離して、テストできる純粋関数にしておく。
 *
 * 絵文字は小さく表示されるので、各行（縦書きなら各列）をそれぞれ枠いっぱいに伸縮させる。
 * ただし横に伸ばしすぎると字形が崩れるので、縦の倍率の MAX_STRETCH 倍までに留める。
 */
export const MAX_STRETCH = 1.6;

export type Measure = { width: number; ascent: number; descent: number };
export type Placement = {
	text: string;
	/** 字の中心 */
	cx: number;
	cy: number;
	sx: number;
	sy: number;
	/** 基準サイズで測った字の大きさ（スケール前） */
	measure: Measure;
};

export type LayoutInput = {
	text: string;
	width: number;
	height: number;
	padding: number;
	lineHeight: number;
	vertical: boolean;
	measure: (text: string) => Measure;
};

export const splitLines = (text: string) =>
	text
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

export const graphemes = (value: string) =>
	typeof Intl !== 'undefined' && 'Segmenter' in Intl
		? [...new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(value)].map((s) => s.segment)
		: [...value];

/** n 個の枠を gap 比率付きで並べたときの、1枠の大きさと各枠の中心。 */
export function slots(total: number, n: number, lineHeight: number) {
	const gapRatio = lineHeight - 1;
	const size = total / (n + (n - 1) * gapRatio);
	const step = size * lineHeight;
	return { size, centers: Array.from({ length: n }, (_, i) => size / 2 + i * step) };
}

export function layoutText(input: LayoutInput): Placement[] {
	const lines = splitLines(input.text);
	if (lines.length === 0) return [];
	const pad = input.height * input.padding;
	const boxW = Math.max(1, input.width - pad * 2);
	const boxH = Math.max(1, input.height - pad * 2);

	if (!input.vertical) {
		const { size, centers } = slots(boxH, lines.length, input.lineHeight);
		return lines.map((line, i) => {
			const m = input.measure(line);
			const glyphH = Math.max(1, m.ascent + m.descent);
			const sy = size / glyphH;
			const sx = Math.min(boxW / Math.max(1, m.width), sy * MAX_STRETCH);
			return { text: line, cx: input.width / 2, cy: pad + centers[i], sx, sy, measure: m };
		});
	}

	// 縦書き: 1行を1列とし、右の列から並べる。
	const { size: colW, centers } = slots(boxW, lines.length, input.lineHeight);
	const out: Placement[] = [];
	lines.forEach((line, col) => {
		const chars = graphemes(line);
		const cellH = boxH / chars.length;
		const cx = input.width - pad - centers[col];
		const ms = chars.map((c) => input.measure(c));
		const maxW = Math.max(1, ...ms.map((m) => m.width));
		const maxH = Math.max(1, ...ms.map((m) => m.ascent + m.descent));
		const sy = cellH / maxH;
		const sx = Math.min(colW / maxW, sy * MAX_STRETCH);
		chars.forEach((c, i) => {
			out.push({ text: c, cx, cy: pad + cellH * (i + 0.5), sx, sy, measure: ms[i] });
		});
	});
	return out;
}

/** 1文字ぶんの区画。区画どうしは重ならず、合わせると枠全体を覆う。 */
export type Cell = { x0: number; y0: number; x1: number; y1: number };

const mids = (centers: number[]) => centers.slice(1).map((c, i) => (centers[i] + c) / 2);

/**
 * 文字ごとの区画を読む順に返す。1文字ずつ動かすエフェクトが、字をこの区画で切り出して使う。
 * 横書きの行は charEdges(行) が返す文字の境目（キャンバス上の x）で区切る。
 */
export function glyphCells(
	placements: Placement[],
	width: number,
	height: number,
	vertical: boolean,
	charEdges: (p: Placement) => number[]
): Cell[] {
	if (placements.length === 0) return [];
	const out: Cell[] = [];
	if (!vertical) {
		const ys = [0, ...mids(placements.map((p) => p.cy)), height];
		placements.forEach((p, i) => {
			let x0 = 0;
			for (const edge of [...charEdges(p), width]) {
				// 文字送り幅とインク幅は異なるため、測った境目は枠外や前の境目より左に来ることがある。
				const x1 = Number.isFinite(edge) ? Math.min(width, Math.max(x0, edge)) : x0;
				out.push({ x0, y0: ys[i], x1, y1: ys[i + 1] });
				x0 = x1;
			}
		});
		return out;
	}
	// 縦書き: 同じ列（cx が同じ）をまとめる。列は右から読む。
	const cols: Placement[][] = [];
	for (const p of placements) {
		const col = cols.find((c) => c[0].cx === p.cx);
		if (col) col.push(p);
		else cols.push([p]);
	}
	const byX = [...cols].sort((a, b) => a[0].cx - b[0].cx);
	const xs = [0, ...mids(byX.map((c) => c[0].cx)), width];
	for (const col of cols) {
		const j = byX.indexOf(col);
		const ys = [0, ...mids(col.map((p) => p.cy)), height];
		col.forEach((_, i) => out.push({ x0: xs[j], y0: ys[i], x1: xs[j + 1], y1: ys[i + 1] }));
	}
	return out;
}
