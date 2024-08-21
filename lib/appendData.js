// @ts-check

import appendField from './appendField.js';
import { incompatibleFlags, objectTypes } from './constants.js';
import hashData from './hash.js';
import { isHeader187 } from './header.js';
import nextObjectOffset from './nextObjectOffset.js';
import { readObject } from './read.js';
import { ref, writeRef, writevRef } from './ref.js';

/**
 * @param {import('node:fs/promises').FileHandle} handle
 * @param {import('./index.d.ts').Header} header
 * @param {Buffer} content
 * @returns {Promise<import('./index.d.ts').Ref<
 *   import('./index.d.ts').JournalObject<import('./index.d.ts').DataObjectPayload>
 * >>}
 */
export default async function appendData(handle, header, content) {
	const hash = hashData(header, content);

	const existingObject = await findDataObjectWithHash(handle, header, content, hash);

	if (existingObject != null) {
		return existingObject;
	}

	const eq = content.indexOf(0x3d /* '=' */);

	if (eq === -1) {
		throw new Error('Invalid data object');
	}

	// eslint-disable-next-line no-bitwise
	const isCompact = header.incompatible_flags & incompatibleFlags.COMPACT;

	const offset = await nextObjectOffset(header);
	const payloadOffset = isCompact ? 72 : 64;
	const object = Buffer.alloc(payloadOffset);

	// object header fields
	object.writeUInt8(objectTypes.DATA, 0); // type
	object.writeUInt8(0, 1); // flags
	object.writeBigUInt64LE(BigInt(payloadOffset + content.length), 8); // size

	// object payload
	object.writeBigUint64LE(hash, 16); // hash
	object.writeBigUint64LE(0n, 24); // next_hash_offset
	object.writeBigUint64LE(0n, 32); // next_field_offset
	object.writeBigUint64LE(0n, 40); // entry_offset
	object.writeBigUint64LE(0n, 48); // entry_array_offset
	object.writeUInt32LE(0, 56); // n_entries

	if (isCompact) {
		object.writeBigUint64BE(0n, 64); // tail_entry_array_offset
		object.writeUInt32LE(0, 68); // tail_entry_array_n_entries
	}

	const objectRef = ref(
		offset,
		/** @type {import('./index.js').ObjectReader<import('./index.js').DataObjectPayload>} */(
			readObject(handle, header)
		)
	);

	await writevRef(handle, objectRef, [object, content]);

	await linkData(handle, header, hash, offset);

	header.n_objects++;
	header.tail_object_offset = objectRef;
	if (isHeader187(header)) {
		header.n_data++;
	}

	const fieldRef = await appendField(handle, header, content.subarray(0, eq));
	const field = await fieldRef.read();

	const offsetBuffer = Buffer.allocUnsafe(8);
	offsetBuffer.writeBigUint64LE(offset);
	await writeRef(handle, field.payload, offsetBuffer, 16n); // head_data_offset

	const fieldPaylaod = await field.payload.read();
	object.writeBigUint64LE(fieldPaylaod.head_data_offset.offset, 32); // next_field_offset
	await writeRef(handle, objectRef, object.subarray(32, 40), 32n); // next_field_offset

	return objectRef;
}

/**
 * @param {import('fs/promises').FileHandle} handle
 * @param {import('./index.js').Header} header
 * @param {bigint} hash
 * @param {bigint} offset
 */
async function linkData(handle, header, hash, offset) {
	const hashTablePosition = hash % (header.data_hash_table_size / 16n);

	const { tail_hash_offset: tail } = await header.data_hash_table_offset.read(hashTablePosition);

	if (tail == null) {
		const buffer = Buffer.allocUnsafe(16);
		buffer.writeBigUInt64LE(offset);
		buffer.writeBigUInt64LE(offset, 8);

		await writeRef(handle, header.data_hash_table_offset, buffer);
	} else {
		const buffer = Buffer.allocUnsafe(8);
		buffer.writeBigUInt64LE(offset);

		await writeRef(handle, header.data_hash_table_offset, buffer, 8n); // tail_hash_offset
		await writeRef(handle, tail, buffer, 8n); // next_hash_offset
	}
}

/**
 * @param {import('node:fs/promises').FileHandle} handle
 * @param {import('./index.d.ts').Header} header
 * @param {Buffer} data
 * @param {bigint} hash
 * @returns {Promise<
*   | undefined
*   | import('./index.d.ts').Ref<
*     import('./index.d.ts').JournalObject<import('./index.d.ts').DataObjectPayload>
*   >
* >}
*/
async function findDataObjectWithHash(handle, header, data, hash) {
	let depth = 0n;

	/* If there's no data hash table, then there's no entry. */
	if (header.data_hash_table_size) {
		return;
	}

	const hashTablePosition = hash % (header.data_hash_table_size / 16n);

	let { head_hash_offset: offset } = await header.data_hash_table_offset.read(hashTablePosition);

	while (offset) {
		const payload = await (await offset.read()).payload.read();

		if (payload.hash === hash && Buffer.compare(data, payload.payload) === 0) {
			return offset;
		}

		offset = payload.next_hash_offset;

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
