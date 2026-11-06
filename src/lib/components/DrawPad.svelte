<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { t } from '$lib/i18n/index.svelte';
	import { Eraser, PaintBucket, Pencil, Redo2, Trash2, Undo2, X } from 'lucide-svelte';
	import { SOLID_COLORS, type Aspect, type ImageSource } from '$lib/render/recipe';
	import { canvasToDataUrl, ensureImage, floodFill, imageRect, imageSurface } from '$lib/render/image';
	import { TwoFingerTap } from '$lib/two-finger-tap';

	let {
		aspect,
		image,
		oncancel,
		ondone
	}: {
		aspect: Aspect;
		/** 描き足すときの元の画像。今の見え方（収め方・大きさ・位置・背景抜き）のまま下に敷く */
		image: ImageSource | null;
		oncancel: () => void;
		ondone: (src: string) => void;
	} = $props();

	type Tool = 'pen' | 'eraser' | 'fill';
	const TOOLS: { id: Tool; icon: typeof Pencil }[] = [
		{ id: 'pen', icon: Pencil },
		{ id: 'eraser', icon: Eraser },
		{ id: 'fill', icon: PaintBucket }
	];
	const HISTORY = 20;
	/** 塗りつぶしで同じ色とみなす近さ。線のふちの半透明も塗れる程度 */
	const FILL_TOLERANCE = 0.3;

	// 描く解像度。高さ 128 の 4 倍まで、長辺は取り込み画像と同じ 1024 まで。開いている間は横長を変えられない
	const fixedAspect = untrack(() => aspect);
	const H = Math.min(512, Math.floor(1024 / fixedAspect));
	const W = H * fixedAspect;
	const unit = H / 128;

	let canvas: HTMLCanvasElement | undefined = $state();
	let dialog: HTMLDivElement | undefined = $state();
	let ctx: CanvasRenderingContext2D | null = null;
	let tool: Tool = $state('pen');
	let color = $state(SOLID_COLORS[0]);
	/** 太さは絵文字（高さ 128px）上の px */
	let size = $state(4);
	let past: ImageData[] = $state.raw([]);
	let future: ImageData[] = $state.raw([]);
	let stageWidth = $state(0);
	let viewportHeight = $state(800);
	let viewportWidth = $state(1200);
	let ready = $state(false);

	const dirty = $derived(past.length > 0);
	// 横長の画面（横向きタブレットなど）では道具を右に寄せ、縦をキャンバスに回す
	const side = $derived(viewportWidth >= 768 && viewportWidth > viewportHeight);
	// キャンバス以外が縦に使う高さ。横並びなら見出しと余白だけ、縦並びなら道具とフッターも下に積まれる
	const chromeH = $derived(side ? 160 : 340);
	const displayH = $derived(
		Math.max(96, Math.min(800, viewportHeight - chromeH, stageWidth ? (stageWidth - 32) / aspect : 320))
	);

	onMount(() => {
		ctx = canvas!.getContext('2d', { willReadFrequently: true });
		const opener = document.activeElement as HTMLElement | null;
		dialog?.focus();
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		void (async () => {
			if (image) {
				try {
					await ensureImage(image);
					const src = imageSurface(image);
					if (src && ctx) {
						const r = imageRect(src.width, src.height, { x: 0, y: 0, w: W, h: H }, image);
						ctx.imageSmoothingQuality = 'high';
						ctx.drawImage(src, r.x, r.y, r.w, r.h);
					}
				} catch {
					// 元の画像が読めなくても白紙から描ける
				}
			}
			ready = true;
		})();
		return () => {
			document.body.style.overflow = prevOverflow;
			opener?.focus?.();
		};
	});

	function snapshot(before?: ImageData) {
		if (!ctx) return;
		past = [...past, before ?? ctx.getImageData(0, 0, W, H)].slice(-HISTORY);
		future = [];
	}
	function undo() {
		if (!ctx || !past.length) return;
		future = [...future, ctx.getImageData(0, 0, W, H)];
		ctx.putImageData(past[past.length - 1], 0, 0);
		past = past.slice(0, -1);
	}
	function redo() {
		if (!ctx || !future.length) return;
		past = [...past, ctx.getImageData(0, 0, W, H)];
		ctx.putImageData(future[future.length - 1], 0, 0);
		future = future.slice(0, -1);
	}
	function clear() {
		if (!ctx) return;
		snapshot();
		ctx.clearRect(0, 0, W, H);
	}

	const rgba = (hex: string): [number, number, number, number] => [
		parseInt(hex.slice(1, 3), 16),
		parseInt(hex.slice(3, 5), 16),
		parseInt(hex.slice(5, 7), 16),
		255
	];

	function point(e: PointerEvent) {
		const r = canvas!.getBoundingClientRect();
		return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
	}

	let stroke: { id: number; x: number; y: number } | null = null;
	const touchTap = new TwoFingerTap();
	let touchBefore: { image: ImageData; past: ImageData[]; future: ImageData[] } | null = null;

	function down(e: PointerEvent) {
		if (!ctx || !ready || e.button !== 0) return;
		if (e.pointerType === 'touch') {
			if (!touchTap.active) {
				touchBefore = { image: ctx.getImageData(0, 0, W, H), past, future };
			}
			touchTap.down(e);
			canvas!.setPointerCapture(e.pointerId);
			if (touchTap.multiple) {
				// 最初の指の描画を取り消し、履歴もタップ前に戻してから判定する。
				stroke = null;
				ctx.globalCompositeOperation = 'source-over';
				if (touchBefore) {
					ctx.putImageData(touchBefore.image, 0, 0);
					past = touchBefore.past;
					future = touchBefore.future;
					touchBefore = null;
				}
				return;
			}
		} else if (stroke || touchTap.active) return;
		const p = point(e);
		snapshot(touchBefore?.image);
		if (tool === 'fill') {
			const img = ctx.getImageData(0, 0, W, H);
			floodFill(img.data, W, H, Math.floor(p.x), Math.floor(p.y), rgba(color), FILL_TOLERANCE);
			ctx.putImageData(img, 0, 0);
			return;
		}
		canvas!.setPointerCapture(e.pointerId);
		stroke = { id: e.pointerId, ...p };
		ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
		ctx.fillStyle = color;
		ctx.strokeStyle = color;
		ctx.lineWidth = size * unit;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.beginPath();
		ctx.arc(p.x, p.y, (size * unit) / 2, 0, Math.PI * 2);
		ctx.fill();
	}
	function move(e: PointerEvent) {
		if (e.pointerType === 'touch') {
			for (const ev of e.getCoalescedEvents?.() ?? []) touchTap.move(ev);
			touchTap.move(e);
			if (touchTap.multiple) return;
		}
		if (!ctx || !stroke || stroke.id !== e.pointerId) return;
		// 速く動かしても線がかくつかないよう、間引かれた点も使う
		const events = e.getCoalescedEvents?.() ?? [e];
		ctx.beginPath();
		ctx.moveTo(stroke.x, stroke.y);
		for (const ev of events.length ? events : [e]) {
			const p = point(ev);
			ctx.lineTo(p.x, p.y);
			stroke.x = p.x;
			stroke.y = p.y;
		}
		ctx.stroke();
	}
	function up(e: PointerEvent) {
		if (e.pointerType === 'touch') {
			if (touchTap.up(e, e.type === 'pointercancel')) undo();
			if (!touchTap.active) touchBefore = null;
		}
		if (stroke?.id !== e.pointerId) return;
		stroke = null;
		if (ctx) ctx.globalCompositeOperation = 'source-over';
	}

	function onKey(e: KeyboardEvent) {
		const mod = e.ctrlKey || e.metaKey;
		if (mod && e.key.toLowerCase() === 'z') {
			e.preventDefault();
			if (e.shiftKey) redo();
			else undo();
		} else if (mod && e.key.toLowerCase() === 'y') {
			e.preventDefault();
			redo();
		} else if (e.key === 'Escape' && !dirty) {
			oncancel();
		}
	}

	function done() {
		if (canvas) ondone(canvasToDataUrl(canvas, true));
	}
</script>

<svelte:window onkeydown={onKey} bind:innerHeight={viewportHeight} bind:innerWidth={viewportWidth} />

<div class="fixed inset-0 z-50 flex items-end justify-center bg-deep/80 sm:items-center {side ? 'p-3' : 'sm:p-6'}">
	<div
		bind:this={dialog}
		tabindex="-1"
		role="dialog"
		aria-modal="true"
		aria-labelledby="drawpad-title"
		class="flex max-h-dvh w-full flex-col gap-4 overflow-y-auto rounded-t-2xl border border-line bg-card p-4 outline-none sm:rounded-2xl {side ? 'max-w-[1400px] md:p-5' : 'max-w-[960px] md:p-6'}"
	>
		<div class="flex items-center justify-between">
			<h2 id="drawpad-title" class="text-[16px] font-medium">{image ? t('draw.titleOver') : t('draw.title')}</h2>
			<button type="button" class="btn btn-ghost btn-sm px-2" aria-label={t('draw.cancel')} onclick={oncancel}>
				<X size={16} strokeWidth={1.5} />
			</button>
		</div>

		<div class={side ? 'flex min-h-0 gap-5' : 'contents'}>
			<div bind:clientWidth={stageWidth} class="checker grid place-items-center rounded-xl border border-line p-4 {side ? 'min-w-0 flex-1' : ''}">
				<canvas
					bind:this={canvas}
					width={W}
					height={H}
					onpointerdown={down}
					onpointermove={move}
					onpointerup={up}
					onpointercancel={up}
					class="touch-none rounded-sm outline outline-1 outline-line-strong {tool === 'fill' ? 'cursor-cell' : 'cursor-crosshair'}"
					style="height:{displayH}px;width:{displayH * aspect}px"
					aria-label={t('draw.canvas')}
				></canvas>
			</div>

			<div class={side ? 'flex w-[300px] shrink-0 flex-col gap-4' : 'contents'}>
				<div class={side ? 'flex flex-col gap-4' : 'flex flex-wrap items-center gap-x-6 gap-y-3'}>
					<div class="seg {side ? 'w-full' : ''}" role="group" aria-label={t('draw.tool')}>
						{#each TOOLS as tl (tl.id)}
							<button
								type="button"
								aria-pressed={tool === tl.id}
								onclick={() => (tool = tl.id)}
								class="flex items-center justify-center gap-2 whitespace-nowrap {side ? 'flex-1 px-1.5!' : ''}"
							>
								<tl.icon size={16} strokeWidth={1.5} />
								{t(`draw.${tl.id}`)}
							</button>
						{/each}
					</div>

					<div class="flex flex-wrap items-center gap-1 sm:gap-2" role="group" aria-label={t('draw.color')}>
						{#each SOLID_COLORS as c (c)}
							<button
								type="button"
								aria-label={c}
								aria-pressed={color === c}
								disabled={tool === 'eraser'}
								onclick={() => (color = c)}
								class="size-7 rounded-md border border-line-strong disabled:opacity-40 {color === c ? 'outline-2 outline-offset-2 outline-accent' : ''}"
								style="background:{c}"
							></button>
						{/each}
						<label class="relative size-7 overflow-hidden rounded-md border border-dashed border-line-strong" title={t('material.customColor')}>
							<input type="color" bind:value={color} disabled={tool === 'eraser'} class="absolute inset-0 size-full cursor-pointer opacity-0" />
							<span class="pointer-events-none grid size-full place-items-center text-[14px] text-muted">+</span>
						</label>
					</div>

					<label class="flex w-full max-w-[320px] items-center gap-3 {tool === 'fill' ? 'opacity-40' : ''}">
						<span class="text-[13px] text-fg2">{t('draw.size')}</span>
						<input type="range" min="1" max="24" step="1" bind:value={size} disabled={tool === 'fill'} class="flex-1" />
						<!-- 実際の太さ（絵文字 1 倍のときの見え方の 2 倍）を点で見せる -->
						<span class="grid size-8 shrink-0 place-items-center">
							<span
								class="rounded-full outline outline-1 outline-line-strong"
								style="width:{Math.max(2, size * 1.25)}px;height:{Math.max(2, size * 1.25)}px;background:{tool === 'eraser' ? 'transparent' : color}"
							></span>
						</span>
					</label>
				</div>

				<div class="flex flex-wrap items-center gap-2 border-t border-line pt-4 {side ? 'mt-auto' : ''}">
					<button type="button" class="btn btn-ghost btn-sm px-2" aria-label={t('draw.undo')} title={t('draw.undo')} disabled={!past.length} onclick={undo}>
						<Undo2 size={16} strokeWidth={1.5} />
					</button>
					<button type="button" class="btn btn-ghost btn-sm px-2" aria-label={t('draw.redo')} title={t('draw.redo')} disabled={!future.length} onclick={redo}>
						<Redo2 size={16} strokeWidth={1.5} />
					</button>
					<button type="button" class="btn btn-ghost btn-sm" onclick={clear} disabled={!ready}>
						<Trash2 size={16} strokeWidth={1.5} />
						{t('draw.clear')}
					</button>
					<div class="flex items-center gap-2 {side ? 'w-full [&>button]:flex-1' : 'ml-auto'}">
						<button type="button" class="btn btn-secondary" onclick={oncancel}>{t('draw.cancel')}</button>
						<button type="button" class="btn btn-primary" onclick={done} disabled={!ready || (!dirty && !image)}>
							{t('draw.done')}
						</button>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
