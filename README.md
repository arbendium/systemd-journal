**NodeJS utilities for reading, writing and verifying Systemd journal files**

I was looking for a robust file format with a mature ecosystem for storing generic log and other high-fidelity telemetry data. Systemd journal file format is the only such candidate I found. It has built-in support for indexing, compression, deduplication, monotonic clock and is stream-oriented.

**Spec:** [Journal file format](https://systemd.io/JOURNAL_FILE_FORMAT/)

Note that the spec strongly discourages writing a new implementation and encourages contacting the upstream in case their implementation is missing something that would facilitate a new one. Unfortunately, I read that part too late and wasn't deterred by it. The upstream library would require a dependency on a native code, which makes portability hard if not impossbile. The upstream implementation also isn't as unopinionated as I'd like.

Why not use Journald CLI or socket interface?:

1. It doesn't support reliable log delivery features. Due to inherently one-way nature of official API-s (using UNIX DGRAM messages internally), it's impossible for applications to know if the log was successfully written or, in many cases, if something failed. The official tooling doesn't acknoledge writes nor provide features to gracefully retry on failures.
2. Official tooling is too opinionated. The journal export format lists a lot of special fields, some of which are specially handled by official tooling. Those opinions might make sense for generic system logging but are a significant headache for those trying to use it for application logging.
3. Official tooling is a bit broken. It has happened that a journal file gets to the point where sytemd-journal-remote begins to silently drop valid messages. Overall, the official tooling is not reliable enough.

## Design goals

1. **Fully featured** - The library supports all the features of the official implementation, including working with older journal formats.
1. **Unopinionated** - The library doesn't have many of the checks, restrictions and fallbacks that the official implementation has. For example, it doesn't deduplicate and reorder entry fields (reordering might be coming though since it's not something that can be handled on the userland). It doesn't check that the monotonic clock is actually monotonic. It's up the the user to not do stupid things without being prepared for the consequences.
1. **Typesafe** - The library has quite compherensive typings.
1. **Performant** - While not every redundant RW operation is avoidable, a reasonable effort is made to avoid unnecessary operations.

## Basic principles

1. All data structures are plain JSON objects. The property values are `BigInt`-s, `Buffer`-s or `Ref`-s.
1. All file IO is done via Node's promise-based file IO API (unlike the official implementation which uses memory mapping).
1. Data structures map to those in the upstream implementation.
1. All >32-bit numbers (which is most of them) are unsigned `BigInt`-s.
1. `BigInt` ranges aren't explicitly checked. Out-of-range number would throw at the time of writing.
1. Non-numeric data (including ID-s, reserved bytes) are `Buffer`-s.
1. Offsets are presented as `Ref` objects, which allow convenient and typesafe reading of the data stored at the offset (or `undefined` in case the offset is `0`).

## Example

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

	const payload = await (await entryArray.read()).payload.read();

	const { items } = payload;

	for (const item of items) {
		const entry = await item.read();

		assert.strictEqual(entry.type, objectTypes.ENTRY);
		assert.strictEqual(entry.flags, 0);

		console.log('');
		const payload = await entry.payload.read();

		console.log(`${payload.boot_id.toString('hex')} ${new Date(payload.realtime / 1000n).toISOString()} %o`, {
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

# Documentation

## Journal file header

# LICENSE

MIT
