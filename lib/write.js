// @ts-check

import { headerSize, states } from './constants.js';

/**
 * @template T
 * @param {import('node:fs/promises').FileHandle} handle
 * @param {import('./index.d.ts').Header} header
 * @param {(header: import('./index.d.ts').Header) => Promise<T>} callback
 * @returns {Promise<T>}
 */
export async function write(handle, header, callback) {
	if (header.state !== states.OFFLINE) {
		throw new Error(`Unexpected state: ${header.state}`);
	}

	header.state = states.ONLINE;
	await handle.write(Buffer.from([states.ONLINE]), 16); // 16 = &header.state

	const result = await callback(header);

	await handle.write(Buffer.from([states.OFFLINE]), 16); // 16 = &header.state
	header.state = states.OFFLINE;

	return result;
}

/**
 * @param {import('./index.d.ts').Header} header
 * @param {bigint} maxFileUsec
 * @returns {boolean}
 */
export function shouldRotate(header, maxFileUsec = 0n) {
	if (header.header_size < headerSize) {
		return true;
	}

	if ('n_data' in header) {
		if (header.n_data * 4n > (header.data_hash_table_size / 16n /* sizeof(HashItem) */) * 3n) {
			return true;
		}
	}

	if ('n_fields' in header) {
		if (header.n_fields * 4n > (header.field_hash_table_size / 16n /* sizeof(HashItem) */) * 3n) {
			return true;
		}
	}

	if ('data_hash_chain_depth' in header) {
		if (header.data_hash_chain_depth > 100 /* HASH_CHAIN_DEPTH_MAX */) {
			return true;
		}
	}

	if ('field_hash_chain_depth' in header) {
		if (header.field_hash_chain_depth > 100 /* HASH_CHAIN_DEPTH_MAX */) {
			return true;
		}
	}

	if ('n_data' in header && 'n_fields' in header) {
		if (header.n_data > 0 && header.n_fields === 0n) {
			return true;
		}
	}

	if (maxFileUsec > 0) {
		const h = header.head_entry_realtime;
		const t = Date.now() * 1000;

		if (h > 0 && t > h + maxFileUsec) {
			return true;
		}
	}

	return false;
}
