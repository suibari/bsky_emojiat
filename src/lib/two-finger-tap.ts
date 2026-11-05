type TouchPoint = Pick<PointerEvent, 'pointerId' | 'clientX' | 'clientY' | 'timeStamp'>;

/** Coordinates are CSS pixels, independent of the drawing canvas resolution. */
export class TwoFingerTap {
	private touches = new Map<number, TouchPoint>();
	private startedAt = 0;
	private count = 0;
	private valid = false;
	private released = false;

	get active() {
		return this.touches.size > 0;
	}

	get multiple() {
		return this.count > 1;
	}

	down(e: TouchPoint) {
		if (!this.active) {
			this.startedAt = e.timeStamp;
			this.count = 0;
			this.valid = true;
			this.released = false;
		}
		this.touches.set(e.pointerId, e);
		this.count++;
		if (this.count > 2 || this.released || e.timeStamp - this.startedAt > 300) {
			this.valid = false;
		}
	}

	move(e: TouchPoint) {
		const start = this.touches.get(e.pointerId);
		if (start && Math.hypot(e.clientX - start.clientX, e.clientY - start.clientY) > 12) {
			this.valid = false;
		}
	}

	up(e: TouchPoint, cancelled = false) {
		if (!this.touches.has(e.pointerId)) return false;
		this.move(e);
		this.touches.delete(e.pointerId);
		this.released = true;
		if (cancelled || e.timeStamp - this.startedAt > 300) this.valid = false;
		return !this.active && this.count === 2 && this.valid;
	}
}
