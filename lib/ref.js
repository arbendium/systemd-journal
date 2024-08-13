/**
 * @template T
 * @param {bigint} offset
 * @param {(offset: bigint) => Promise<T>} read
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
 * @param {bigint} offset
 * @param {(offset: bigint) => Promise<T>} read
 * @return {import('./index.js').Ref<T>}
 */
export function ref(offset, read) {
	return {
		offset,
		read: () => read(offset)
	};
}
