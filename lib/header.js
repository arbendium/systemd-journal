// @ts-check

/**
 * @param {import('./index.d.ts').Header} header
 * @returns {header is import('./index.js').Header187}
 */
export function isHeader187(header) {
	return header.header_size >= 224;
}

/**
 * @param {import('./index.d.ts').Header} header
 * @returns {header is import('./index.js').Header189}
 */
export function isHeader189(header) {
	return header.header_size >= 240;
}

/**
 * @param {import('./index.d.ts').Header} header
 * @returns {header is import('./index.js').Header246}
 */
export function isHeader246(header) {
	return header.header_size >= 256;
}

/**
 * @param {import('./index.d.ts').Header} header
 * @returns {header is import('./index.js').Header252}
 */
export function isHeader252(header) {
	return header.header_size >= 264;
}

/**
 * @param {import('./index.d.ts').Header} header
 * @returns {header is import('./index.js').Header254}
 */
export function isHeader254(header) {
	return header.header_size >= 272;
}
