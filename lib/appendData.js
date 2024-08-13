// @ts-check

import appendField from './appendField.js';
import { incompatibleFlags, objectTypes } from './constants.js';
import findDataObjectWithHash from './findDataObjectWithHash.js';
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
 *   import('./index.d.ts').JournalObject<import('./index.d.ts').DataObjectPayload>
 * >>}
 */
export default async function appendData(handle, header, content) {
	const hash = hashData(header, content);

	const existingObject = await findDataObjectWithHash(handle, header, content, hash);

	if (existingObject != null) {
		return existingObject.offset;
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

	await handle.writev([object, content]);

	await linkData(handle, header, hash, offset);

	const objectRef = ref(
		offset,
		/** @type {import('./index.js').ObjectReader<import('./index.js').DataObjectPayload>} */(
			readObject(handle, header)
		)
	);

	header.n_objects++;
	header.tail_object_offset = objectRef;
	if (isHeader187(header)) {
		header.n_data++;
	}

	const fieldRef = await appendField(handle, header, content.subarray(0, eq));
	const field = await fieldRef.read();

	const offsetBuffer = Buffer.allocUnsafe(8);
	offsetBuffer.writeBigUint64LE(offset);
	await handle.write(offsetBuffer, Number(field.payload.offset) + 16);

	const fieldPaylaod = await field.payload.read();
	object.writeBigUint64LE(fieldPaylaod.head_data_offset.offset, 32); // next_field_offset
	await handle.write(object.subarray(32, 40), Number(offset) + 32);

	return objectRef;
}

/**
 * @param {import('fs/promises').FileHandle} handle
 * @param {import('./index.js').Header} header
 * @param {bigint} hash
 * @param {bigint} offset
 */
async function linkData(handle, header, hash, offset) {
	const hashTablePosition = Number(hash % (header.data_hash_table_size / 16n));

	const hashTable = await header.data_hash_table_offset.read();

	const tail = hashTable[hashTablePosition].tail_hash_offset;

	const buffer = Buffer.allocUnsafe(8);
	buffer.writeBigInt64LE(offset);

	if (tail == null) {
		await handle.writev(
			[buffer, buffer],
			Number(header.data_hash_table_offset.offset) + (hashTablePosition * 16)
		);
	} else {
		// next_hash_offset
		await handle.write(
			buffer,
			Number(tail.offset) + 8
		);
		await handle.write(
			buffer,
			Number(header.data_hash_table_offset.offset) + (hashTablePosition * 16) + 8
		);
	}
}
