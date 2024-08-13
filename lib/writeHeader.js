// @ts-check

import assert from 'assert';
import { headerSize, signature } from './constants.js';
import {
	isHeader187, isHeader189, isHeader246, isHeader252, isHeader254
} from './header.js';

/**
 * @param {import('fs/promises').FileHandle} handle
 * @param {import('./index.js').Header} header
 */
export default async function writeHeader(handle, header) {
	const buffer = serializeHeader(header);

	await handle.write(buffer, 0);
}

/**
 * @param {import('./index.js').Header} header
 * @returns {Buffer}
 */
function serializeHeader(header) {
	const realHeaderSize = Number(header.header_size);

	if (realHeaderSize !== headerSize) {
		throw new Error(`Invalid header size: ${header.header_size}`);
	}

	const buffer = Buffer.allocUnsafe(realHeaderSize);

	signature.copy(buffer);
	buffer.writeUInt32LE(header.compatible_flags, 8);
	buffer.writeUInt32LE(header.incompatible_flags, 12);

	buffer.writeUInt8(header.state, 16);

	assert.strictEqual(header.reserved.length, 7);
	header.reserved.copy(buffer, 17);
	assert.strictEqual(header.file_id.length, 16);
	header.file_id.copy(buffer, 24);
	assert.strictEqual(header.machine_id.length, 16);
	header.machine_id.copy(buffer, 40);
	assert.strictEqual(header.tail_entry_boot_id.length, 16);
	header.tail_entry_boot_id.copy(buffer, 56);
	assert.strictEqual(header.seqnum_id.length, 16);
	header.seqnum_id.copy(buffer, 72);

	buffer.writeBigUInt64LE(header.header_size, 88);
	buffer.writeBigUInt64LE(header.arena_size, 96);
	buffer.writeBigUInt64LE(header.data_hash_table_offset.offset, 104);
	buffer.writeBigUInt64LE(header.data_hash_table_size, 112);
	buffer.writeBigUInt64LE(header.field_hash_table_offset.offset, 120);
	buffer.writeBigUInt64LE(header.field_hash_table_size, 128);
	buffer.writeBigUInt64LE(header.tail_object_offset.offset, 136);
	buffer.writeBigUInt64LE(header.n_objects, 144);
	buffer.writeBigUInt64LE(header.n_entries, 152);
	buffer.writeBigUInt64LE(header.tail_entry_seqnum, 160);
	buffer.writeBigUInt64LE(header.head_entry_seqnum, 168);
	buffer.writeBigUInt64LE(
		header.entry_array_offset == null ? 0n : header.entry_array_offset.offset,
		176
	);
	buffer.writeBigUInt64LE(header.head_entry_realtime, 184);
	buffer.writeBigUInt64LE(header.tail_entry_realtime, 192);
	buffer.writeBigUInt64LE(header.tail_entry_monotonic, 200);

	if (isHeader187(header)) {
		buffer.writeBigInt64LE(header.n_data, 208);
		buffer.writeBigInt64LE(header.n_fields, 216);
	}

	if (isHeader189(header)) {
		buffer.writeBigInt64LE(header.n_tags, 224);
		buffer.writeBigInt64LE(header.n_entry_arrays, 232);
	}

	if (isHeader246(header)) {
		buffer.writeBigInt64LE(header.data_hash_chain_depth, 240);
		buffer.writeBigInt64LE(header.field_hash_chain_depth, 248);
	}

	if (isHeader252(header)) {
		buffer.writeBigInt64LE(
			header.tail_entry_array_offset == null ? 0n : header.tail_entry_array_offset.offset,
			256
		);
		buffer.writeUInt32LE(header.tail_entry_array_n_entries, 260);
	}

	if (isHeader254(header)) {
		buffer.writeBigInt64LE(
			header.tail_entry_offset == null ? 0n : header.tail_entry_offset.offset,
			264
		);
	}

	return buffer;
}
