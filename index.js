// @ts-check

/* eslint-disable no-bitwise */
import assert from 'node:assert';

const signature = Buffer.from('LPKSHHRH');
const headerSize = 272;

export const incompatibleFlags = {
	COMPRESSED_XZ: 1,
	COMPRESSED_LZ4: 2,
	KEYED_HASH: 4,
	COMPRESSED_ZSTD: 8,
	COMPACT: 16
};

export const compatibleFlags = {
	SEALED: 1,
	TAIL_ENTRY_BOOT_ID: 2
};

export const objectTypes = {
	UNUSED: 0,
	DATA: 1,
	FIELD: 2,
	ENTRY: 3,
	DATA_HASH_TABLE: 4,
	FIELD_HASH_TABLE: 5,
	ENTRY_ARRAY: 6,
	TAG: 7
};

export const objectFlags = {
	COMPRESSED_XZ: 1,
	COMPRESSED_LZ4: 2,
	COMPRESSED_ZSTD: 4
};

export const states = {
	OFFLINE: 0,
	ONLINE: 1,
	ARCHIVED: 2
};

/**
 *
 * @param {import('node:fs/promises').FileHandle} handle
 * @returns {Promise<import('./index.d.ts').Header>}
 */
export async function readHeader(handle) {
	const buffer = Buffer.allocUnsafe(headerSize);

	const { bytesRead } = await handle.read(buffer, 0, headerSize, 0);

	if (bytesRead !== headerSize) {
		throw new Error(`Unexpected number of bytes read: ${bytesRead}`);
	}

	/** @type {import('./index.d.ts').Header} */
	const header = /** @type {any} */({
		signature: buffer.subarray(0, 8)
	});

	if (Buffer.compare(header.signature, signature) !== 0) {
		throw new Error('Invalid signature');
	}

	/**
	 * @param {bigint} offset
	 * @returns {import('./index.d.ts').Ref<import('./index.d.ts').JournalObject<import('./index.d.ts').ObjectPayload>>}
	 */
	function ref(offset) {
		if (offset) {
			return {
				offset,
				read: () => readObjectHeader(handle, offset, header)
			};
		}

		return /** @type {any} */(undefined);
	}

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
	header.data_hash_table_offset = /** @type {import('./index.d.ts').Ref<import('./index.d.ts').JournalObject<import('./index.d.ts').HashTableObjectPayload>>} */(
		ref(buffer.readBigUInt64LE(104))
	);
	header.data_hash_table_size = buffer.readBigUInt64LE(112);
	header.field_hash_table_offset = /** @type {import('./index.d.ts').Ref<import('./index.d.ts').JournalObject<import('./index.d.ts').HashTableObjectPayload>>} */(
		ref(buffer.readBigUInt64LE(120))
	);
	header.field_hash_table_size = buffer.readBigUInt64LE(128);
	header.tail_object_offset = ref(buffer.readBigUInt64LE(136));
	header.n_objects = buffer.readUInt32LE(144); // actually 64-bit
	header.n_entries = buffer.readUInt32LE(152); // actually 64-bit
	header.tail_entry_seqnum = buffer.readUInt32LE(160); // actually 64-bit
	header.head_entry_seqnum = buffer.readUInt32LE(168); // actually 64-bit
	header.entry_array_offset = /** @type {import('./index.d.ts').Ref<import('./index.d.ts').JournalObject<import('./index.d.ts').EntryArrayObjectPayload>>} */(
		ref(buffer.readBigUInt64LE(176))
	);
	header.head_entry_realtime = buffer.readBigUInt64LE(184);
	header.tail_entry_realtime = buffer.readBigUInt64LE(192);
	header.tail_entry_monotonic = buffer.readBigUInt64LE(200);
	/* Added in 187 */
	header.n_data = buffer.readUInt32LE(208); // actually 64-bit
	header.n_fields = buffer.readUInt32LE(216); // actually 64-bit
	/* Added in 189 */
	header.n_tags = buffer.readUInt32LE(224); // actually 64-bit
	header.n_entry_arrays = buffer.readUInt32LE(232); // actually 64-bit
	/* Added in 246 */
	header.data_hash_chain_depth = buffer.readUInt32LE(240); // actually 64-bit
	header.field_hash_chain_depth = buffer.readUInt32LE(248); // actually 64-bit
	/* Added in 252 */
	header.tail_entry_array_offset = /** @type {import('./index.d.ts').Ref<import('./index.d.ts').JournalObject<import('./index.d.ts').EntryArrayObjectPayload>>} */(
		ref(BigInt(buffer.readUInt32LE(256)))
	);
	header.tail_entry_array_n_entries = buffer.readUInt32LE(260);
	/* Added in 254 */
	header.tail_entry_offset = /** @type {import('./index.d.ts').Ref<import('./index.d.ts').JournalObject<import('./index.d.ts').EntryObjectPayload>>} */(
		ref(buffer.readBigUInt64LE(264))
	);

	// convenience
	header.head_object_offset = ref(header.header_size);

	return header;
}

/**
 * @param {import('node:fs/promises').FileHandle} handle
 * @param {bigint} offset
 * @param {import('./index.d.ts').Header} fileHeader
 * @returns {Promise<import('./index.d.ts').JournalObject>}
 */
async function readObjectHeader(handle, offset, fileHeader) {
	const buffer = Buffer.allocUnsafe(16);

	const { bytesRead } = await handle.read(buffer, 0, 16, /** @type {any} */(offset));

	if (bytesRead !== 16) {
		throw new Error(`Unexpected number of bytes read: ${bytesRead}`);
	}

	/** @type {import('./index.d.ts').JournalObject} */
	const header = {
		type: buffer.readUInt8(0),
		flags: buffer.readUInt8(1),
		reserved: buffer.subarray(2, 8),
		size: buffer.readBigUInt64LE(8),
		payload: /** @type {any} */(undefined)
	};

	if (header.size < 16) {
		throw new Error(`Invalid object header size: ${header.size}`);
	}

	/**
	 * @overload
	 * @param {bigint} offset
	 * @param {undefined} [read]
	 * @return {import('./index.d.ts').Ref<import('./index.d.ts').JournalObject>}
	 */
	/**
	 * @template U
	 * @overload
	 * @param {bigint} offset
	 * @param {(offset: bigint) => Promise<U>} read
	 * @return {import('./index.d.ts').Ref<U>}
	 */
	/**
	 * @param {bigint} offset
	 * @param {(offset: bigint) => Promise<unknown>} read
	 * @return {import('./index.d.ts').Ref<unknown>}
	 */
	function ref(offset, read = offset => readObjectHeader(handle, offset, fileHeader)) {
		if (offset) {
			return {
				offset,
				read: () => read(offset)
			};
		}

		return /** @type {any} */(undefined);
	}

	switch (header.type) {
	case objectTypes.DATA:
		header.payload = ref(offset + 16n, async offset => {
			const minSize = fileHeader.incompatible_flags & incompatibleFlags.COMPACT
				? 56
				: 48;

			const buffer = await readPayload(handle, header, offset, minSize);

			/** @type {any} */
			const payload = {
				hash: buffer.readBigUInt64LE(0),
				next_hash_offset: ref(buffer.readBigUInt64LE(8)),
				next_field_offset: ref(buffer.readBigUInt64LE(16)),
				entry_offset: ref(buffer.readBigUInt64LE(24)),
				entry_array_offset: ref(buffer.readBigUInt64LE(32)),
				n_entries: buffer.readUInt32LE(40)
			};

			if (fileHeader.incompatible_flags & incompatibleFlags.COMPACT) {
				payload.tail_entry_array_offset = ref(BigInt(buffer.readUInt32LE(48)));
				payload.tail_entry_array_n_entries = buffer.readUInt32LE(52);

				payload.payload = buffer.subarray(56);
			} else {
				payload.payload = buffer.subarray(48);
			}

			if (header.flags & objectFlags.COMPRESSED_XZ) {
				throw new Error('Unsupported compression XZ');
			} else if (header.flags & objectFlags.COMPRESSED_LZ4) {
				throw new Error('Unsupported compression LZ4');
			} else if (header.flags & objectFlags.COMPRESSED_ZSTD) {
				throw new Error('Unsupported compression ZSTD');
			}

			return /** @type {import('./index.d.ts').DataObjectPayload} */(payload);
		});

		break;
	case objectTypes.FIELD_HASH_TABLE:
	case objectTypes.DATA_HASH_TABLE:
		header.payload = ref(offset + 16n, async offset => {
			const buffer = await readPayload(handle, header, offset);

			if ((buffer.length % 16) !== 0) {
				throw new Error(`Unexpected object size: ${header.size}`);
			}

			const items = [];
			for (let offset = 0; offset < buffer.length; offset += 16) {
				items.push({
					head_hash_offset: buffer.readBigUInt64LE(offset),
					tail_hash_offset: buffer.readBigUInt64LE(offset + 8)
				});
			}

			return items;
		});

		break;
	case objectTypes.ENTRY_ARRAY:
		header.payload = ref(offset + 16n, async offset => {
			const buffer = await readPayload(handle, header, offset, 8);

			const items = [];

			if (fileHeader.incompatible_flags & incompatibleFlags.COMPACT) {
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
				next_entry_array_offset: ref(buffer.readBigUInt64LE(0)),
				items: items.filter(offset => offset !== 0n).map(offset => ref(offset))
			});
		});

		break;
	case objectTypes.ENTRY:
		header.payload = ref(offset + 16n, async offset => {
			const buffer = await readPayload(handle, header, offset, 48);

			/** @type {import('./index.d.ts').EntryObjectPayload} */
			const payload = {
				seqnum: buffer.readBigUInt64LE(0),
				realtime: buffer.readBigUInt64LE(8),
				monotonic: buffer.readBigUInt64LE(16),
				boot_id: buffer.subarray(24, 40),
				xor_hash: buffer.readBigUInt64LE(40),
				items: []
			};

			if (fileHeader.incompatible_flags & incompatibleFlags.COMPACT) {
				if ((buffer.length - 48) % 4 !== 0) {
					throw new Error(`Unexpected object size: ${buffer.length}`);
				}

				for (let offset = 48; offset < buffer.length; offset += 4) {
					payload.items.push({
						object_offset: /** @type {import('./index.d.ts').Ref<import('./index.d.ts').JournalObject<import('./index.d.ts').DataObjectPayload>>} */(
							ref(BigInt(buffer.readUInt32LE(offset)))
						)
					});
				}
			} else {
				if ((buffer.length - 48) % 16 !== 0) {
					throw new Error(`Unexpected object size: ${buffer.length}`);
				}

				for (let offset = 48; offset < buffer.length; offset += 16) {
					payload.items.push({
						object_offset: /** @type {import('./index.d.ts').Ref<import('./index.d.ts').JournalObject<import('./index.d.ts').DataObjectPayload>>} */(
							ref(buffer.readBigUint64LE(offset))
						),
						hash: buffer.readBigUint64LE(offset + 8)
					});
				}
			}

			return payload;
		});

		break;
	default:
		assert(header.type === objectTypes.UNUSED, `Unsupported payload for object type '${header.type}'`);
	}

	return header;
}

/**
 * @param {import('node:fs/promises').FileHandle} handle
 * @param {import('./index.d.ts').JournalObject} header
 * @param {bigint} offset
 * @param {number} minSize
 * @returns {Promise<Buffer>}
 */
async function readPayload(handle, header, offset, minSize = 0) {
	const payloadSize = Number(header.size - 16n);

	if (payloadSize < minSize) {
		throw new Error(`Unexpected object size: ${header.size}`);
	}

	const buffer = Buffer.allocUnsafe(payloadSize);

	const { bytesRead } = await handle.read(buffer, 0, payloadSize, /** @type {any} */(offset));

	if (bytesRead !== payloadSize) {
		throw new Error(`Unexpected number of bytes read: ${bytesRead}`);
	}

	return buffer;
}
