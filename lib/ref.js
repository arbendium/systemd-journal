// @ts-check

import assert from 'node:assert';

/**
 * @template T
 * @param {bigint} offset
 * @param {import('./index.js').Reader<T>} read
 * @return {undefined | import('./index.js').Ref<T>}
 */
export function nullableRef(offset, read) {
	if (offset) {
		return {
			offset,
			read: () => read(offset)
		};
	}
}

/**
 * @template T
 * @template {unknown[]} [A=[]]
 * @param {bigint} offset
 * @param {import('./index.js').Reader<T, A>} read
 * @return {import('./index.js').Ref<T, A>}
 */
export function ref(offset, read) {
	return {
		offset,
		read: (...args) => read(offset, ...args)
	};
}

/**
 * @param {import('node:fs/promises').FileHandle} handle
 * @param {import('./index.js').Ref<unknown, any>} ref
 * @param {Buffer} buffer
 * @param {bigint} position
 * @returns
 */
export function writeRef(handle, ref, buffer, position = 0n) {
	assert.notStrictEqual(ref.offset, 0);

	return handle.write(
		buffer,
		undefined,
		undefined,
		/** @type {any} */(ref.offset + position)
	);
}

/**
 * @param {import('node:fs/promises').FileHandle} handle
 * @param {import('./index.js').Ref<unknown, any>} ref
 * @param {Buffer[]} buffers
 * @param {bigint} position
 * @returns
 */
export function writevRef(handle, ref, buffers, position = 0n) {
	assert.notStrictEqual(ref.offset, 0);

	return handle.writev(
		buffers,
		/** @type {any} */(ref.offset + position)
	);
}
