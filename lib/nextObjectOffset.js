// @ts-check

/**
 * @param {import('./index.d.ts').Header} header
 * @returns {Promise<bigint>}
 */
export default async function nextObjectOffset(header) {
	if (header.tail_object_offset) {
		if (!valid64(header.tail_object_offset.offset)
			|| header.tail_object_offset.offset < header.header_size) {
			throw new Error('Bad value for tail_object_offset');
		}

		const tailObject = await header.tail_object_offset.read();

		const sz = align64(tailObject.size);

		return header.tail_object_offset.offset + sz;
	}

	return header.header_size;
}

/**
 * @param {bigint} offset
 * @returns {boolean}
 */
function valid64(offset) {
	// eslint-disable-next-line no-bitwise
	return !(offset & 7n);
}

/**
 * @param {bigint} offset
 * @returns {bigint}
 */
function align64(offset) {
	// eslint-disable-next-line no-bitwise
	return (offset + 7n) & ~7n;
}
