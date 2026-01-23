/**
 * Token Encryption Utilities
 * ==========================
 * AES-256-GCM encryption for OAuth tokens at rest.
 *
 * Security:
 * - Uses Web Crypto API (available in Cloudflare Workers)
 * - AES-256-GCM provides authenticated encryption
 * - Random IV per encryption for semantic security
 * - Base64 encoding for safe storage in D1 text columns
 */

/**
 * Encrypt a token object for secure storage.
 *
 * @param data - The data to encrypt (will be JSON stringified)
 * @param key - Base64-encoded 256-bit encryption key
 * @returns Base64-encoded ciphertext (IV prepended)
 */
export async function encryptTokens(
  data: Record<string, unknown>,
  key: string
): Promise<string> {
  // Import key from base64
  const keyData = base64ToArrayBuffer(key);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  // Generate random IV (12 bytes is recommended for GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt the JSON stringified data
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    plaintext
  );

  // Prepend IV to ciphertext and encode as base64
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return arrayBufferToBase64(combined.buffer);
}

/**
 * Decrypt an encrypted token string.
 *
 * @param encrypted - Base64-encoded ciphertext (IV prepended)
 * @param key - Base64-encoded 256-bit encryption key
 * @returns The decrypted data object
 * @throws Error if decryption fails (tampered or wrong key)
 */
export async function decryptTokens<T = Record<string, unknown>>(
  encrypted: string,
  key: string
): Promise<T> {
  // Import key from base64
  const keyData = base64ToArrayBuffer(key);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  // Decode and split IV from ciphertext
  const combined = new Uint8Array(base64ToArrayBuffer(encrypted));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  // Decrypt
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    ciphertext
  );

  // Parse and return
  const text = new TextDecoder().decode(plaintext);
  return JSON.parse(text) as T;
}

/**
 * Generate a new 256-bit encryption key.
 * Use this once during initial setup and store in secrets.
 *
 * @returns Base64-encoded 256-bit key
 */
export async function generateEncryptionKey(): Promise<string> {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  // generateKey returns CryptoKey for symmetric algorithms (not CryptoKeyPair)
  const cryptoKey = key as CryptoKey;
  const exported = await crypto.subtle.exportKey("raw", cryptoKey);
  // exportKey with "raw" returns ArrayBuffer (not JsonWebKey)
  return arrayBufferToBase64(exported as ArrayBuffer);
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)!;
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}
