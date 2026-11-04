/** A placed box, assignable to any timeline item's transform. */
export interface PlacedBox {
	x: number;
	y: number;
	width: number;
	height: number;
	opacity: number;
}

/**
 * A timeline item's transform places its centre as an offset from the centre of the
 * canvas (x: 0, y: 0 is centred). Layouts read more naturally as a box measured from
 * the top-left corner, so generated layers describe that box and convert it here.
 */
export function boxTransform(
	canvas: { width: number; height: number },
	box: { left: number; top: number; width: number; height: number },
	opacity = 1
): PlacedBox {
	return {
		x: box.left + box.width / 2 - canvas.width / 2,
		y: box.top + box.height / 2 - canvas.height / 2,
		width: box.width,
		height: box.height,
		opacity
	};
}

/** A box of the given size centred on the canvas. */
export function centredTransform(
	canvas: { width: number; height: number },
	size: { width: number; height: number },
	opacity = 1
): PlacedBox {
	return boxTransform(
		canvas,
		{
			left: (canvas.width - size.width) / 2,
			top: (canvas.height - size.height) / 2,
			width: size.width,
			height: size.height
		},
		opacity
	);
}
