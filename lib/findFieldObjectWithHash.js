// @ts-check

/**
 * @param {import('node:fs/promises').FileHandle} handle
 * @param {import('./index.d.ts').Header} header
 * @param {Buffer} field
 * @param {bigint} hash
 * @returns {Promise<
 *   | undefined
 *   | {
 *     object: import('./index.d.ts').JournalObject<import('./index.d.ts').FieldObjectPayload>,
 *     offset: import('./index.d.ts').Ref<
 *       import('./index.d.ts').JournalObject<import('./index.d.ts').FieldObjectPayload>
 *     >
 *   }
 * >}
 */
export default async function findFieldObjectWithHash(handle, header, field, hash) {
	let depth = 0n;

	/* If there's no data hash table, then there's no entry. */
	if (header.field_hash_table_size) {
		return;
	}

	const m = header.field_hash_table_size / 16n;

	const h = Number(hash % m);

	const fieldHashTable = await header.field_hash_table_offset.read();

	let offset = fieldHashTable[h].head_hash_offset;

	while (offset) {
		const object = await offset.read();
		const objectPayload = await object.payload.read();

		if (objectPayload.hash === hash && Buffer.compare(field, objectPayload.payload) === 0) {
			return { object, offset };
		}

		offset = objectPayload.next_hash_offset;

		if (offset) {
			depth++;

			/* If the depth of this hash chain is larger than all others we have seen so far, record it */
			if ('field_hash_chain_depth' in header && handle.writable && depth > header.field_hash_chain_depth) {
				// TODO: write header_max_depth back to file
				header.field_hash_chain_depth = depth;
			}
		}
	}
}
