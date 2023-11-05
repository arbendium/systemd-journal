### NodeJS utilities for reading and writing Systemd journal files

[Journal file format spec](https://systemd.io/JOURNAL_FILE_FORMAT/)

#### Why?

Systemd journal file format is the only one (that I'm aware of) that's specifically designed and optimizzed for logging. It supports seamless compression, indexing and even log authentication. It has built-in mechanism to deal with unstable clocks by enforcing the use of monotonic clock. And it has a variety of tooling that, as a bonus, is included in most Linux installations.

However, Systemd journal's official tooling has a few deficiencies:
1. It doesn't support reliable log delivery features. Due to inherently one-way nature of official API-s (using UNIX DGRAM messages internally), it's impossible for applications to know if the log was successfully written or, in many cases, if something failed. The official tooling doesn't acknoledge writes nor provide features to gracefully retry on failures.
2. Official tooling is too opinionated. The journal export format lists a lot of special fields, some of which are specially handled by official tooling. Those opinions might make sense for generic system logging but are a significant headache for those trying to use it for application logging.
3. Official tooling is a bit broken. It has happened that a journal file gets to the point where sytemd-journal-remote begins to reject valid messages. Overall, the official tooling is not reliable enough.

#### Example

**Reading:**

```js
import assert from 'node:assert';
import fs from 'node:fs/promises';
import {
	compatibleFlags, incompatibleFlags, objectTypes, readHeader
} from '@arbendium/systemd-journal';

const handle = await fs.open('test.journal');

const header = await readHeader(handle);

assert.strictEqual(header.compatible_flags, compatibleFlags.TAIL_ENTRY_BOOT_ID);
assert.strictEqual(header.incompatible_flags, incompatibleFlags.KEYED_HASH | incompatibleFlags.COMPRESSED_ZSTD | incompatibleFlags.COMPACT);

console.log('Header:', header);

let entryArray = header.entry_array_offset;

while (entryArray) {
	console.log('=== ENTRY ARRAY ===');

	entryArray = await entryArray.read();
	const payload = await entryArray.payload.read();

	const { items } = payload;

	for (const item of items) {
		const entry = await item.read();

		assert.strictEqual(entry.type, objectTypes.ENTRY);
		assert.strictEqual(entry.flags, 0);

		console.log('');
		const payload = await entry.payload.read();

		console.log(`${payload.boot_id.toString('hex')} ${new Date(Number(payload.realtime / 1000n)).toISOString()} %o`, {
			boot_id: payload.boot_id.toString('hex'),
			monotonic: payload.monotonic,
			realtime: payload.realtime,
			seqnum: payload.seqnum,
			xor_hash: payload.xor_hash
		});

		for (const item of payload.items) {
			// console.log(`=== ENTRY ITEM: ${item.object_offset.location}`);
			const object = await item.object_offset.read();

			assert.strictEqual(object.type, objectTypes.DATA);

			const payload = await object.payload.read();
			console.log(payload.payload.toString());
		}
	}

	entryArray = payload.next_entry_array_offset;
}

handle.close();
```
