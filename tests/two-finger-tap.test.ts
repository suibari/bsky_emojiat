import { describe, expect, it } from 'vitest';
import { TwoFingerTap } from '../src/lib/two-finger-tap';

const point = (pointerId: number, timeStamp: number, clientX = 50, clientY = 50) => ({
	pointerId, timeStamp, clientX, clientY
});

describe('TwoFingerTap', () => {
	it('recognizes a tap once, after both fingers lift in either order', () => {
		for (const order of [[1, 2], [2, 1]]) {
			const tap = new TwoFingerTap();
			tap.down(point(1, 0));
			tap.down(point(2, 40, 100));
			expect(tap.multiple).toBe(true);
			expect(tap.up(point(order[0], 80, order[0] === 1 ? 50 : 100))).toBe(false);
			expect(tap.multiple).toBe(true);
			expect(tap.up(point(order[1], 120, order[1] === 1 ? 50 : 100))).toBe(true);
			expect(tap.up(point(order[1], 130))).toBe(false);
			expect(tap.active).toBe(false);
		}
	});

	it('does not treat single taps or separate taps as an undo gesture', () => {
		const tap = new TwoFingerTap();
		tap.down(point(1, 0));
		expect(tap.up(point(1, 30))).toBe(false);
		tap.down(point(2, 40));
		expect(tap.multiple).toBe(false);
		expect(tap.up(point(2, 70))).toBe(false);
	});

	it('rejects movement even if the finger returns to its starting point', () => {
		const tap = new TwoFingerTap();
		tap.down(point(1, 0));
		tap.move(point(1, 20, 63));
		tap.down(point(2, 40));
		tap.up(point(1, 80));
		expect(tap.up(point(2, 100))).toBe(false);
	});

	it('checks movement when lifting a finger', () => {
		const tap = new TwoFingerTap();
		tap.down(point(1, 0));
		tap.down(point(2, 40));
		tap.up(point(1, 80));
		expect(tap.up(point(2, 100, 50, 70))).toBe(false);
	});

	it('rejects a long press or cancelled touch', () => {
		for (const cancelled of [false, true]) {
			const tap = new TwoFingerTap();
			tap.down(point(1, 0));
			tap.down(point(2, 40));
			tap.up(point(1, 80), cancelled);
			expect(tap.up(point(2, cancelled ? 100 : 301))).toBe(false);
		}
	});

	it('rejects three fingers and resets for the next gesture', () => {
		const tap = new TwoFingerTap();
		tap.down(point(1, 0));
		tap.down(point(2, 10));
		tap.down(point(3, 20));
		tap.up(point(1, 40));
		tap.up(point(2, 50));
		expect(tap.up(point(3, 60))).toBe(false);
		tap.down(point(4, 100));
		tap.down(point(5, 110));
		tap.up(point(4, 140));
		expect(tap.up(point(5, 150))).toBe(true);
	});
});
