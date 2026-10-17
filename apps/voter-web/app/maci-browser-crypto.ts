// Adapter for MACI v3's Node randomBytes call using the browser Web Crypto CSPRNG.
export function randomBytes(length: number) {
  if (!Number.isInteger(length) || length < 1 || length > 65536) throw new Error('Invalid random byte length.');
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(length));
  return { toString(encoding: string) {
    if (encoding !== 'hex') throw new Error('Unsupported random byte encoding.');
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  } };
}
