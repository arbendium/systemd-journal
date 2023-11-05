export interface Ref<T> {
	offset: bigint,
	read(handle: import('node:fs/promises').FileHandle, offset: bigint, fileHeader: Header): Promise<T>
}

export interface Header {
	signature: Buffer
	compatible_flags: number
	incompatible_flags: number
	state: number
	reserved: Buffer
	file_id: Buffer
	machine_id: Buffer
	tail_entry_boot_id: Buffer
	seqnum_id: Buffer
	header_size: bigint
	arena_size: bigint
	data_hash_table_offset: Ref<JournalObject<HashTableObjectPayload>>
	data_hash_table_size: bigint
	field_hash_table_offset: Ref<JournalObject<HashTableObjectPayload>>
	field_hash_table_size: bigint
	tail_object_offset: Ref<JournalObject<ObjectPayload>>
	n_objects: number // actually 64-bit
	n_entries: number // actually 64-bit
	tail_entry_seqnum: number // actually 64-bit
	head_entry_seqnum: number // actually 64-bit
	entry_array_offset: Ref<JournalObject<EntryArrayObjectPayload>>
	head_entry_realtime: bigint
	tail_entry_realtime: bigint
	tail_entry_monotonic: bigint
	n_data: number // actually 64-bit
	n_fields: number // actually 64-bit
	n_tags: number // actually 64-bit
	n_entry_arrays: number // actually 64-bit
	data_hash_chain_depth: number // actually 64-bit
	field_hash_chain_depth: number // actually 64-bit
	tail_entry_array_offset: Ref<JournalObject<EntryArrayObjectPayload>>
	tail_entry_array_n_entries: number
	tail_entry_offset: Ref<JournalObject<EntryObjectPayload>>
	head_object_offset: Ref<JournalObject<ObjectPayload>>
}

export interface JournalObject<Payload extends ObjectPayload = ObjectPayload> {
	type: number
	flags: number
	reserved: Buffer
	size: bigint
	payload: Ref<Payload>
}

export type ObjectPayload =
	| DataObjectPayload
	| HashTableObjectPayload
	| EntryArrayObjectPayload
	| EntryObjectPayload

export type DataObjectPayload = RegularDataObjectPayload | CompactDataObjectPayload

export interface RegularDataObjectPayload {
	hash: bigint,
	next_hash_offset: Ref<unknown>,
	next_field_offset: Ref<unknown>,
	entry_offset: Ref<unknown>,
	entry_array_offset: Ref<unknown>,
	n_entries: number,
	payload: Buffer
}

export interface CompactDataObjectPayload extends RegularDataObjectPayload {
	tail_entry_array_offset: Ref<unknown>,
	tail_entry_array_n_entries: number
}

export type HashTableObjectPayload = Array<{
	head_hash_offset: bigint,
	tail_hash_offset: bigint
}>

export type EntryArrayObjectPayload = {
	next_entry_array_offset: Ref<JournalObject<EntryArrayObjectPayload>>,
	items: Ref<JournalObject<DataObjectPayload>>[]
}

export type EntryObjectPayload = {
	seqnum: bigint,
	realtime: bigint,
	monotonic: bigint,
	boot_id: Buffer,
	xor_hash: bigint,
	items: { object_offset: Ref<JournalObject<DataObjectPayload>>, hash?: bigint }[]
}
