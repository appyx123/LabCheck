const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const KEY_LENGTH_BITS = 256;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_LENGTH_BITS
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const derived = await deriveKey(password, salt);
  return `${bytesToHex(salt)}:${bytesToHex(derived)}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  try {
    const salt = hexToBytes(parts[0]);
    const expected = hexToBytes(parts[1]);
    const actual = await deriveKey(password, salt);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function base64UrlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? encoder.encode(input) : input;
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  iat: number;
  exp: number;
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signJwt(
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
  secret: string,
  expiresInSeconds = 60 * 60 * 24 * 7
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };
  const headerB64 = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));
  const data = `${headerB64}.${payloadB64}`;
  const key = await getHmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return `${data}.${base64UrlEncode(new Uint8Array(sig))}`;
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const data = `${headerB64}.${payloadB64}`;
    const key = await getHmacKey(secret);
    const sigBytes = base64UrlDecode(sigB64);
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes as BufferSource, encoder.encode(data));
    if (!valid) return null;
    const payload = JSON.parse(decoder.decode(base64UrlDecode(payloadB64))) as JwtPayload;
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    if (!payload.sub) return null;
    return payload;
  } catch {
    return null;
  }
}

export function newId(): string {
  return crypto.randomUUID();
}
