import { keccak256, stringToHex } from 'viem';
import { z } from 'zod';

export const candidateSchema = z.object({ name: z.string().trim().min(1).max(100), biography: z.string().trim().max(2000) }).strict();
export const manifestSchema = z.object({ title: z.string().trim().min(1).max(200), description: z.string().trim().max(4000), candidates: z.array(candidateSchema).min(2).max(100) }).strict();
export type Manifest = z.infer<typeof manifestSchema>;
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
}
export function payloadHash(value: unknown) { return keccak256(stringToHex(canonicalJson(value))); }
export const states = ['Draft', 'Upcoming', 'Active', 'Closed', 'Cancelled'] as const;
export function jsonSafe(value: unknown): unknown { return JSON.parse(JSON.stringify(value, (_, item: unknown) => typeof item === 'bigint' ? item.toString() : item)); }
