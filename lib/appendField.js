// @ts-check

import { objectTypes } from './constants.js';
import hashData from './hash.js';
import { isHeader187 } from './header.js';
import nextObjectOffset from './nextObjectOffset.js';
import { readObject } from './read.js';
import { ref, writeRef, writevRef } from './ref.js';

/**
 * Depends:
 *  - header.incompatible_flags
 *  - header.field_hash_table_size
 *  - header.field_hash_table_offset
 *  - header.field_hash_table_offset[hashTablePosition]
 *  -
 * @param {import('node:fs/promises').FileHandle} handle
 * @param {import('./index.d.ts').Header} header
 * @param {Buffer} content
 * @returns {Promise<import('./index.d.ts').Ref<
 *   import('./index.d.ts').JournalObject<import('./index.d.ts').FieldObjectPayload>
 * >>}
 */
export default async function appendField(handle, header, content) {
	const hash = hashData(header, content);

	const existingObject = await findFieldObjectWithHash(handle, header, content, hash);

	if (existingObject != null) {
		return existingObject;
	}

	const offset = await nextObjectOffset(header);
	const payloadOffset = 40;
	const object = Buffer.alloc(payloadOffset);

	// object header fields
	object.writeUInt8(objectTypes.FIELD, 0); // type
	object.writeUInt8(0, 1); // flags
	object.writeBigUInt64LE(BigInt(payloadOffset + content.length), 8); // size

	// object payload
	object.writeBigUint64LE(hash, 16); // hash
	object.writeBigUint64LE(0n, 24); // next_hash_offset
	object.writeBigUint64LE(0n, 32); // head_data_offset

	const objectRef = ref(
		offset,
		/** @type {import('./index.js').ObjectReader<import('./index.js').FieldObjectPayload>} */(
			readObject(handle, header)
		)
	);

	await writevRef(handle, objectRef, [object, content]);

	await linkField(handle, header, hash, offset);

	header.n_objects++;
	header.tail_object_offset = objectRef;
	if (isHeader187(header)) {
		header.n_fields++;
	}

	return objectRef;
}

/**
 * @param {import('fs/promises').FileHandle} handle
 * @param {import('./index.js').Header} header
 * @param {bigint} hash
 * @param {bigint} offset
 */
async function linkField(handle, header, hash, offset) {
	const hashTablePosition = hash % (header.field_hash_table_size / 16n);

	const { tail_hash_offset: tail } = await header.field_hash_table_offset.read(hashTablePosition);

	if (tail == null) {
		const buffer = Buffer.allocUnsafe(16);
		buffer.writeBigUInt64LE(offset);
		buffer.writeBigUInt64LE(offset, 8);

		await writeRef(handle, header.field_hash_table_offset, buffer);
	} else {
		const buffer = Buffer.allocUnsafe(8);
		buffer.writeBigUInt64LE(offset);

		await writeRef(handle, header.field_hash_table_offset, buffer, 8n); // tail_hash_offset
		await writeRef(handle, tail, buffer, 8n); // next_hash_offset
	}
}

/**
 * @param {import('node:fs/promises').FileHandle} handle
 * @param {import('./index.d.ts').Header} header
 * @param {Buffer} field
 * @param {bigint} hash
 * @returns {Promise<
*   | undefined
*   | import('./index.d.ts').Ref<
*     import('./index.d.ts').JournalObject<import('./index.d.ts').FieldObjectPayload>
*   >
* >}
*/
async function findFieldObjectWithHash(handle, header, field, hash) {
	let depth = 0n;

	/* If there's no data hash table, then there's no entry. */
	if (header.field_hash_table_size) {
		return;
	}

	const hashTablePosition = hash % (header.field_hash_table_size / 16n);

	let { head_hash_offset: offset } = await header.field_hash_table_offset.read(hashTablePosition);

	while (offset) {
		const payload = await (await offset.read()).payload.read();

		if (payload.hash === hash && Buffer.compare(field, payload.payload) === 0) {
			return offset;
		}

		offset = payload.next_hash_offset;

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
