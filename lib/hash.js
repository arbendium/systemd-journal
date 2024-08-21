// @ts-check

import siphash24_ from 'siphash24';
import { incompatibleFlags } from './constants.js';

/**
 * @param {Buffer} data
 * @returns {bigint}
 */
// eslint-disable-next-line no-unused-vars
export function jenkinsHash(data) {
	throw new Error('Unimplemented');
}

/**
 * @param {Buffer} data
 * @param {Buffer} fileId
 * @returns {bigint}
 */
export function siphash24(data, fileId) {
	const out = Buffer.allocUnsafe(8);

	return siphash24_(data, fileId, out).readBigUInt64LE(0);
}

/**
 * @param {import('./index.d.ts').Header} header
 * @param {Buffer} data
 */
export default function hashData(header, data) {
	// eslint-disable-next-line no-bitwise
	if (header.incompatible_flags & incompatibleFlags.KEYED_HASH) {
		return siphash24(data, header.file_id);
	}

	return jenkinsHash(data);
}
