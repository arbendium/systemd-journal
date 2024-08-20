// @ts-check

import { objectTypes } from './constants.js';
import findFieldObjectWithHash from './findFieldObjectWithHash.js';
import hashData from './hash.js';
import { isHeader187 } from './header.js';
import nextObjectOffset from './nextObjectOffset.js';
import { readObject } from './read.js';
import { ref } from './ref.js';

/**
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
		return existingObject.offset;
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

	await handle.writev([object, content]);

	await linkField(handle, header, hash, offset);

	const objectRef = ref(
		offset,
		/** @type {import('./index.js').ObjectReader<import('./index.js').FieldObjectPayload>} */(
			readObject(handle, header)
		)
	);

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

	const hashTable = await header.field_hash_table_offset.read();

	const tail = hashTable[/** @type {any} */(hashTablePosition)].tail_hash_offset;

	const buffer = Buffer.allocUnsafe(8);
	buffer.writeBigUInt64LE(offset);

	if (tail == null) {
		await handle.writev(
			[buffer, buffer],
			/** @type {any} */(header.field_hash_table_offset.offset + hashTablePosition * 16n)
		);
	} else {
		// next_hash_offset
		await handle.write(
			buffer,
			/** @type {any} */(tail.offset + 8n)
		);
		await handle.write(
			buffer,
			/** @type {any} */(header.field_hash_table_offset.offset + hashTablePosition * 16n + 8n)
		);
	}
}
