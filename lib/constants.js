// @ts-check

export const signature = Buffer.from('LPKSHHRH');

export const headerSize = 272;

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
