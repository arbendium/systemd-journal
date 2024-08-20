// @ts-check

/* eslint-disable no-bitwise */
import assert from 'node:assert';
import {
	headerSize, incompatibleFlags, objectFlags, objectTypes, signature
} from './constants.js';
import { ref, nullableRef } from './ref.js';

/**
 * @param {import('node:fs/promises').FileHandle} handle
 * @returns {Promise<import('./index.d.ts').Header>}
 */
export async function readHeader(handle) {
	const buffer = Buffer.allocUnsafe(headerSize);

	const { bytesRead } = await handle.read(buffer, undefined, undefined, 0);

	if (bytesRead !== headerSize) {
		throw new Error(`Unexpected number of bytes read: ${bytesRead}`);
	}

	/** @type {import('./index.d.ts').Header254} */
	const header = /** @type {any} */({
		signature: buffer.subarray(0, 8)
	});

	if (Buffer.compare(header.signature, signature) !== 0) {
		throw new Error('Invalid signature');
	}

	const specializedReadObject = readObject(handle, header);

	header.compatible_flags = buffer.readUInt32LE(8);
	header.incompatible_flags = buffer.readUInt32LE(12);
	header.state = buffer.readUInt8(16);
	header.reserved = buffer.subarray(17, 24);
	header.file_id = buffer.subarray(24, 40);
	header.machine_id = buffer.subarray(40, 56);
	header.tail_entry_boot_id = buffer.subarray(56, 72);
	header.seqnum_id = buffer.subarray(72, 88);
	header.header_size = buffer.readBigUInt64LE(88);
	header.arena_size = buffer.readBigUInt64LE(96);
	// eslint-disable-next-line max-len
	header.data_hash_table_offset = ref(buffer.readBigUInt64LE(104), /** @type {import('./index.d.ts').Reader<import('./index.d.ts').HashTableObjectPayload<import('./index.d.ts').DataObjectPayload>>} */(offset => readHashTableObjectPayload(handle, header, { size: header.data_hash_table_size, flags: 0 })(offset)));
	header.data_hash_table_size = buffer.readBigUInt64LE(112);
	// eslint-disable-next-line max-len
	header.field_hash_table_offset = ref(buffer.readBigUInt64LE(120), /** @type {import('./index.d.ts').Reader<import('./index.d.ts').HashTableObjectPayload<import('./index.d.ts').FieldObjectPayload>>} */(offset => readHashTableObjectPayload(handle, header, { size: header.field_hash_table_size, flags: 0 })(offset)));
	header.field_hash_table_size = buffer.readBigUInt64LE(128);
	header.tail_object_offset = ref(buffer.readBigUInt64LE(136), specializedReadObject);
	header.n_objects = buffer.readBigUint64LE(144);
	header.n_entries = buffer.readBigUint64LE(152);
	header.tail_entry_seqnum = buffer.readBigUint64LE(160);
	header.head_entry_seqnum = buffer.readBigUint64LE(168);
	// eslint-disable-next-line max-len
	header.entry_array_offset = nullableRef(buffer.readBigUInt64LE(176), /** @type {import('./index.d.ts').ObjectReader<import('./index.d.ts').EntryArrayObjectPayload>} */(specializedReadObject));
	header.head_entry_realtime = buffer.readBigUInt64LE(184);
	header.tail_entry_realtime = buffer.readBigUInt64LE(192);
	header.tail_entry_monotonic = buffer.readBigUInt64LE(200);
	/* Added in 187 */
	header.n_data = buffer.readBigUInt64LE(208);
	header.n_fields = buffer.readBigUInt64LE(216);
	/* Added in 189 */
	header.n_tags = buffer.readBigUInt64LE(224);
	header.n_entry_arrays = buffer.readBigUInt64LE(232);
	/* Added in 246 */
	header.data_hash_chain_depth = buffer.readBigUInt64LE(240);
	header.field_hash_chain_depth = buffer.readBigUInt64LE(248);
	/* Added in 252 */
	// eslint-disable-next-line max-len
	header.tail_entry_array_offset = nullableRef(BigInt(buffer.readUInt32LE(256)), /** @type {import('./index.d.ts').ObjectReader<import('./index.d.ts').EntryArrayObjectPayload>} */(specializedReadObject));
	header.tail_entry_array_n_entries = buffer.readUInt32LE(260);
	/* Added in 254 */
	// eslint-disable-next-line max-len
	header.tail_entry_offset = nullableRef(buffer.readBigUInt64LE(264), /** @type {import('./index.d.ts').ObjectReader<import('./index.d.ts').EntryObjectPayload>} */(specializedReadObject));

	header.head_object_offset = ref(header.header_size, specializedReadObject);

	return header;
}

/**
 * @param {import('node:fs/promises').FileHandle} handle
 * @param {import('./index.d.ts').Header} header
 * @returns {import('./index.d.ts').Reader<import('./index.d.ts').JournalObject>}
 */
export function readObject(handle, header) {
	return async offset => {
		const buffer = Buffer.allocUnsafe(16);

		const { bytesRead } = await handle.read(
			buffer,
			undefined,
			undefined,
			/** @type {any} */(offset)
		);

		if (bytesRead !== 16) {
			throw new Error(`Unexpected number of bytes read: ${bytesRead}`);
		}

		/** @type {import('./index.d.ts').JournalObject} */
		const object = {
			type: buffer.readUInt8(0),
			flags: buffer.readUInt8(1),
			reserved: buffer.subarray(2, 8),
			size: buffer.readBigUInt64LE(8),
			payload: /** @type {any} */(undefined)
		};

		if (object.size < 16) {
			throw new Error(`Invalid object header size: ${object.size}`);
		}

		switch (object.type) {
		case objectTypes.DATA:
			object.payload = ref(offset + 16n, readDataObjectPayload(handle, header, object));

			break;
		case objectTypes.DATA_HASH_TABLE:
		case objectTypes.FIELD_HASH_TABLE:
			// eslint-disable-next-line max-len
			object.payload = ref(offset + 16n, /** @type {import('./index.d.ts').Reader<any>} */(readHashTableObjectPayload(handle, header, object)));

			break;
		case objectTypes.ENTRY_ARRAY:
			object.payload = ref(offset + 16n, readEntryArrayObjectPayload(handle, header, object));

			break;
		case objectTypes.ENTRY:
			object.payload = ref(offset + 16n, readEntryObjectPayload(handle, header, object));

			break;
		default:
			assert(object.type === objectTypes.UNUSED, `Unsupported payload for object type '${object.type}'`);
		}

		return object;
	};
}

/**
 * @param {import('node:fs/promises').FileHandle} handle
 * @param {import('./index.d.ts').Header} header
 * @param {Pick<import('./index.d.ts').JournalObject, 'flags' | 'size'>} object
 * @returns {import('./index.d.ts').Reader<import('./index.d.ts').DataObjectPayload>}
 */
export function readDataObjectPayload(handle, header, object) {
	const specializedReadObject = readObject(handle, header);

	return async offset => {
		const minSize = header.incompatible_flags & incompatibleFlags.COMPACT
			? 56
			: 48;

		const buffer = await readPayload(handle, object, offset, minSize);

		/** @type {import('./index.d.ts').DataObjectPayload} */
		const payload = {
			hash: buffer.readBigUInt64LE(0),
			/* eslint-disable max-len */
			next_hash_offset: nullableRef(buffer.readBigUInt64LE(8), /** @type {import('./index.d.ts').ObjectReader<import('./index.d.ts').DataObjectPayload>} */(specializedReadObject)),
			next_field_offset: nullableRef(buffer.readBigUInt64LE(16), /** @type {import('./index.d.ts').ObjectReader<import('./index.d.ts').FieldObjectPayload>} */(specializedReadObject)),
			entry_offset: nullableRef(buffer.readBigUInt64LE(24), /** @type {import('./index.d.ts').ObjectReader<import('./index.d.ts').EntryObjectPayload>} */(specializedReadObject)),
			entry_array_offset: nullableRef(buffer.readBigUInt64LE(32), /** @type {import('./index.d.ts').ObjectReader<import('./index.d.ts').EntryArrayObjectPayload>} */(specializedReadObject)),
			/* eslint-enable max-len */
			n_entries: buffer.readUInt32LE(40),
			...header.incompatible_flags & incompatibleFlags.COMPACT
				? {
					tail_entry_array_offset: nullableRef(
						BigInt(buffer.readUInt32LE(48)),
						specializedReadObject
					),
					tail_entry_array_n_entries: buffer.readUInt32LE(52),
					payload: buffer.subarray(56)
				}
				: {
					payload: buffer.subarray(48)
				}
		};

		if (object.flags & objectFlags.COMPRESSED_XZ) {
			throw new Error('Unsupported compression XZ');
		} else if (object.flags & objectFlags.COMPRESSED_LZ4) {
			throw new Error('Unsupported compression LZ4');
		} else if (object.flags & objectFlags.COMPRESSED_ZSTD) {
			throw new Error('Unsupported compression ZSTD');
		}

		return payload;
	};
}

/**
 * @template {(
 *   | import('./index.d.ts').DataObjectPayload
 *   | import('./index.d.ts').FieldObjectPayload
 * )} ContainedObjectPayload
 * @param {import('node:fs/promises').FileHandle} handle
 * @param {import('./index.d.ts').Header} header
 * @param {Pick<import('./index.d.ts').JournalObject, 'flags' | 'size'>} object
 * @returns {import('./index.d.ts').Reader<
 *   import('./index.d.ts').HashTableObjectPayload<ContainedObjectPayload>
 * >}
 */
export function readHashTableObjectPayload(handle, header, object) {
	const specializedReadObject = readObject(handle, header);

	return async offset => {
		const buffer = await readPayload(handle, object, offset);

		if ((buffer.length % 16) !== 0) {
			throw new Error(`Unexpected object size: ${object.size}`);
		}

		/** @type {import('./index.d.ts').HashTableObjectPayload<ContainedObjectPayload>} */
		const items = [];

		for (let offset = 0; offset < buffer.length; offset += 16) {
			items.push({
				// eslint-disable-next-line max-len
				head_hash_offset: nullableRef(buffer.readBigUInt64LE(offset), /** @type {import('./index.d.ts').ObjectReader<ContainedObjectPayload>} */(specializedReadObject)),
				// eslint-disable-next-line max-len
				tail_hash_offset: nullableRef(buffer.readBigUInt64LE(offset + 8), /** @type {import('./index.d.ts').ObjectReader<ContainedObjectPayload>} */(specializedReadObject))
			});
		}

		return items;
	};
}

/**
 * @param {import('node:fs/promises').FileHandle} handle
 * @param {import('./index.d.ts').Header} header
 * @param {Pick<import('./index.d.ts').JournalObject, 'flags' | 'size'>} object
 * @returns {import('./index.d.ts').Reader<import('./index.d.ts').EntryArrayObjectPayload>}
 */
export function readEntryArrayObjectPayload(handle, header, object) {
	const specializedReadObject = readObject(handle, header);

	return async offset => {
		const buffer = await readPayload(handle, object, offset, 8);

		const items = [];

		if (header.incompatible_flags & incompatibleFlags.COMPACT) {
			for (let offset = 8; offset < buffer.length; offset += 4) {
				items.push(BigInt(buffer.readUInt32LE(offset)));
			}
		} else {
			for (let offset = 8; offset < buffer.length; offset += 8) {
				items.push(buffer.readBigUInt64LE(offset));
			}
		}

		const firstZero = items.indexOf(0n);
		assert(firstZero === -1 || items.every((v, i) => i < firstZero ? v !== 0n : v === 0n));

		return /** @type {import('./index.d.ts').EntryArrayObjectPayload} */({
			next_entry_array_offset: nullableRef(buffer.readBigUInt64LE(0), specializedReadObject),
			items: items.filter(offset => offset !== 0n).map(offset => ref(offset, specializedReadObject))
		});
	};
}

/**
 * @param {import('node:fs/promises').FileHandle} handle
 * @param {import('./index.d.ts').Header} header
 * @param {Pick<import('./index.d.ts').JournalObject, 'flags' | 'size'>} object
 * @returns {import('./index.d.ts').Reader<import('./index.d.ts').EntryObjectPayload>}
 */
export function readEntryObjectPayload(handle, header, object) {
	const specializedReadObject = readObject(handle, header);

	return async offset => {
		const buffer = await readPayload(handle, object, offset, 48);

		/** @type {import('./index.d.ts').EntryObjectPayload} */
		const payload = {
			seqnum: buffer.readBigUInt64LE(0),
			realtime: buffer.readBigUInt64LE(8),
			monotonic: buffer.readBigUInt64LE(16),
			boot_id: buffer.subarray(24, 40),
			xor_hash: buffer.readBigUInt64LE(40),
			items: []
		};

		if (header.incompatible_flags & incompatibleFlags.COMPACT) {
			if ((buffer.length - 48) % 4 !== 0) {
				throw new Error(`Unexpected object size: ${buffer.length}`);
			}

			for (let offset = 48; offset < buffer.length; offset += 4) {
				payload.items.push({
					// eslint-disable-next-line max-len
					object_offset: ref(BigInt(buffer.readUInt32LE(offset)), /** @type {import('./index.d.ts').ObjectReader<import('./index.d.ts').DataObjectPayload>} */(specializedReadObject))
				});
			}
		} else {
			if ((buffer.length - 48) % 16 !== 0) {
				throw new Error(`Unexpected object size: ${buffer.length}`);
			}

			for (let offset = 48; offset < buffer.length; offset += 16) {
				payload.items.push({
					// eslint-disable-next-line max-len
					object_offset: ref(buffer.readBigUint64LE(offset), /** @type {import('./index.d.ts').ObjectReader<import('./index.d.ts').DataObjectPayload>} */(specializedReadObject)),
					hash: buffer.readBigUint64LE(offset + 8)
				});
			}
		}

		return payload;
	};
}

/**
 * @param {import('node:fs/promises').FileHandle} handle
 * @param {Pick<import('./index.d.ts').JournalObject, 'size'>} object
 * @param {bigint} offset
 * @param {number} minSize
 * @returns {Promise<Buffer>}
 */
async function readPayload(handle, object, offset, minSize = 0) {
	const payloadSize = object.size - 16n;

	if (payloadSize < minSize) {
		throw new Error(`Unexpected object size: ${object.size}`);
	}

	assert(payloadSize <= Number.MAX_SAFE_INTEGER);

	const buffer = Buffer.allocUnsafe(Number(payloadSize));

	const { bytesRead } = await handle.read(
		buffer,
		undefined,
		undefined,
		/** @type {any} */(offset)
	);

	if (BigInt(bytesRead) !== payloadSize) {
		throw new Error(`Unexpected number of bytes read: ${bytesRead}`);
	}

	return buffer;
}
