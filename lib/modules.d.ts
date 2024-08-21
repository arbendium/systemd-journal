declare module 'siphash24' {
export default function siphash24<T>(data: Buffer, key: Buffer, out?: T): T
}
