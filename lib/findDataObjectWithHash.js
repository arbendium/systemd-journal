// @ts-check

/**
 * @param {import('node:fs/promises').FileHandle} handle
 * @param {import('./index.d.ts').Header} header
 * @param {Buffer} data
 * @param {bigint} hash
 * @returns {Promise<
 *   | undefined
 *   | {
 *     object: import('./index.d.ts').JournalObject<import('./index.d.ts').DataObjectPayload>,
 *     offset: import('./index.d.ts').Ref<
 *       import('./index.d.ts').JournalObject<import('./index.d.ts').DataObjectPayload>
 *     >
 *   }
 * >}
 */
export default async function findDataObjectWithHash(handle, header, data, hash) {
	let depth = 0n;

	/* If there's no data hash table, then there's no entry. */
	if (header.data_hash_table_size) {
		return;
	}

	const m = header.data_hash_table_size / 16n;

	const h = Number(hash % m);

	const dataHashTable = await header.data_hash_table_offset.read();

	let offset = dataHashTable[h].head_hash_offset;

	while (offset) {
		const object = await offset.read();
		const objectPayload = await object.payload.read();

		if (objectPayload.hash === hash && Buffer.compare(data, objectPayload.payload) === 0) {
			return { object, offset };
		}

		offset = objectPayload.next_hash_offset;

		if (offset) {
			depth++;

			/* If the depth of this hash chain is larger than all others we have seen so far, record it */
			if ('data_hash_chain_depth' in header && handle.writable && depth > header.data_hash_chain_depth) {
				// TODO: write header_max_depth back to file
				header.data_hash_chain_depth = depth;
			}
		}
	}
}
