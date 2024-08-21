export interface Ref<T, A extends unknown[] = []> {
	offset: bigint,
	read(...args: A): Promise<T>
}

export type Header = HeaderBase | Header187 | Header189 | Header246 | Header252 | Header254

export interface HeaderBase {
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
	data_hash_table_offset: Ref<HashTableItem<DataObjectPayload>, [bigint]>
	data_hash_table_size: bigint
	field_hash_table_offset: Ref<HashTableItem<FieldObjectPayload>, [bigint]>
	field_hash_table_size: bigint
	tail_object_offset: Ref<JournalObject>
	n_objects: bigint
	n_entries: bigint
	tail_entry_seqnum: bigint
	head_entry_seqnum: bigint
	entry_array_offset: undefined | Ref<JournalObject<EntryArrayObjectPayload>>
	head_entry_realtime: bigint
	tail_entry_realtime: bigint
	tail_entry_monotonic: bigint
	head_object_offset: Ref<JournalObject>
}

export interface Header187 extends HeaderBase {
	n_data: bigint
	n_fields: bigint
}

export interface Header189 extends Header187 {
	n_tags: bigint
	n_entry_arrays: bigint
}

export interface Header246 extends Header189 {
	data_hash_chain_depth: bigint
	field_hash_chain_depth: bigint
}

export interface Header252 extends Header246 {
	tail_entry_array_offset: undefined | Ref<JournalObject<EntryArrayObjectPayload>>
	tail_entry_array_n_entries: number
}

export interface Header254 extends Header252 {
	tail_entry_offset: undefined | Ref<JournalObject<EntryObjectPayload>>
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
	| EntryArrayObjectPayload
	| EntryObjectPayload
	| FieldObjectPayload
	| HashTableObjectPayload<DataObjectPayload>
	| HashTableObjectPayload<FieldObjectPayload>

export type DataObjectPayload = RegularDataObjectPayload | CompactDataObjectPayload

export interface RegularDataObjectPayload {
	hash: bigint,
	next_hash_offset: undefined | Ref<JournalObject<DataObjectPayload>>,
	next_field_offset: undefined | Ref<JournalObject<FieldObjectPayload>>,
	entry_offset: undefined | Ref<JournalObject<EntryObjectPayload>>,
	entry_array_offset: undefined | Ref<JournalObject<EntryArrayObjectPayload>>,
	n_entries: number,
	payload: Buffer // TODO: lazy load? (Ref)
}

export interface CompactDataObjectPayload extends RegularDataObjectPayload {
	tail_entry_array_offset: Ref<JournalObject<EntryArrayObjectPayload>>,
	tail_entry_array_n_entries: number
}

export type EntryArrayObjectPayload = {
	next_entry_array_offset: Ref<JournalObject<EntryArrayObjectPayload>>,
	items: Ref<JournalObject<EntryObjectPayload>>[]
}

export type EntryObjectPayload = {
	seqnum: bigint
	realtime: bigint
	monotonic: bigint
	boot_id: Buffer
	xor_hash: bigint
	items: { object_offset: Ref<JournalObject<DataObjectPayload>>, hash?: bigint }[]
}

export type FieldObjectPayload = {
	hash: bigint
	next_hash_offset: undefined | Ref<JournalObject<FieldObjectPayload>>
	head_data_offset: Ref<JournalObject<DataObjectPayload>>
	payload: Buffer
}

export type HashTableObjectPayload<ContainedObjectPayload extends ObjectPayload> = Array<HashTableItem<ContainedObjectPayload>>

export type HashTableItem<ContainedObjectPayload extends ObjectPayload> = {
	head_hash_offset: undefined | Ref<JournalObject<ContainedObjectPayload>>,
	tail_hash_offset: undefined | Ref<JournalObject<ContainedObjectPayload>>
}

export type Unref<T extends Record<string, any>> = {
	[k in keyof T]: T[k] extends Ref<infer U>
		? U extends Record<string, any>
			? Unref<U>
			: U
		: T[k]
}

export type Reader<T, A extends unknown[] = []> = (offset: bigint, ...args: A) => Promise<T>
export type ObjectReader<T extends ObjectPayload> = Reader<JournalObject<T>>
