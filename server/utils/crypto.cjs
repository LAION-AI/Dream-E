/**
 * =============================================================================
 * CRYPTOGRAPHY UTILITY MODULE — AES-256-GCM
 * =============================================================================
 *
 * Provides authenticated encryption for sensitive configuration values stored
 * in the admin_config database table (API keys, secrets, etc.).
 *
 * Algorithm: AES-256-GCM (Galois/Counter Mode)
 *   - 256-bit key provides strong symmetric encryption.
 *   - GCM mode provides both confidentiality AND authenticity (tamper detection).
 *   - Each encryption generates a unique 12-byte IV (initialization vector),
 *     so encrypting the same plaintext twice produces different ciphertexts.
 *
 * Key derivation:
 *   - The master encryption key is derived from a passphrase (environment
 *     variable or file-based secret) using PBKDF2 with a hardcoded salt.
 *   - PBKDF2 with 100,000 iterations makes brute-force passphrase attacks
 *     computationally expensive.
 *   - The hardcoded salt is acceptable here because PBKDF2's purpose is to
 *     slow down brute-force, not to prevent rainbow tables (the master key
 *     is a high-entropy secret, not a user-chosen password).
 *
 * Storage format:
 *   base64( 12-byte IV || ciphertext || 16-byte authTag )
 *   This single base64 string is stored in the admin_config.value column
 *   when is_secret = 1.
 *
 * Master key resolution:
 *   1. DREAME_ADMIN_SECRET environment variable (production)
 *   2. File at server-data/.admin-key (development fallback)
 *   3. Auto-generate random key and save to file (first run)
 *
 * Usage:
 *   const { encrypt, decrypt, getMasterKey } = require('./crypto.cjs');
 *   const key = getMasterKey();
 *   const encrypted = encrypt('my-secret-api-key', key);
 *   const decrypted = decrypt(encrypted, key);  // 'my-secret-api-key'
 *
 * =============================================================================
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Hardcoded salt for PBKDF2 key derivation.
 *
 * WHY HARDCODED: The salt's purpose in PBKDF2 is to ensure that the same
 * passphrase produces different keys across different applications. Since
 * this salt is unique to Dream-E, it fulfills that purpose. It does NOT
 * need to be secret — it just needs to be unique and consistent.
 *
 * Changing this salt would invalidate ALL previously encrypted secrets
 * in the database, requiring them to be re-entered and re-encrypted.
 */
const PBKDF2_SALT = Buffer.from('dream-e-admin-config-v1-salt', 'utf-8');

/** Number of PBKDF2 iterations. 100k provides good security vs. performance. */
const PBKDF2_ITERATIONS = 100000;

/** AES-256-GCM requires a 32-byte (256-bit) key. */
const KEY_LENGTH = 32;

/** GCM standard IV length: 12 bytes (96 bits). */
const IV_LENGTH = 12;

/** GCM authentication tag length: 16 bytes (128 bits). */
const AUTH_TAG_LENGTH = 16;

/** Algorithm identifier for Node.js crypto. */
const ALGORITHM = 'aes-256-gcm';

/** Path to the fallback admin key file (auto-generated in development). */
const ADMIN_KEY_FILE = path.resolve(__dirname, '..', '..', 'server-data', '.admin-key');

// ---------------------------------------------------------------------------
// Key Derivation
// ---------------------------------------------------------------------------

/**
 * Derives a 32-byte AES-256 encryption key from a human-readable passphrase
 * using PBKDF2 (Password-Based Key Derivation Function 2).
 *
 * PBKDF2 stretches the passphrase through many iterations of HMAC-SHA512,
 * making brute-force attacks on weak passphrases computationally expensive.
 * Even if the database is compromised, the attacker needs the passphrase
 * to decrypt the stored secrets.
 *
 * @param {string} secret - The raw passphrase (from env var or file).
 * @returns {Buffer} A 32-byte derived key suitable for AES-256-GCM.
 */
function deriveMasterKey(secret) {
  if (!secret || typeof secret !== 'string' || secret.trim().length === 0) {
    throw new Error('Cannot derive master key from empty secret');
  }

  return crypto.pbkdf2Sync(
    secret,
    PBKDF2_SALT,
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    'sha512'
  );
}

// ---------------------------------------------------------------------------
// Encryption / Decryption
// ---------------------------------------------------------------------------

/**
 * Encrypts a plaintext string using AES-256-GCM.
 *
 * Returns a single base64-encoded string containing the IV, ciphertext,
 * and authentication tag. The IV is randomly generated for each encryption
 * call, ensuring that encrypting the same plaintext twice produces different
 * outputs (semantic security).
 *
 * The authentication tag (authTag) ensures integrity: if anyone tampers
 * with the ciphertext or IV in the database, decryption will fail with
 * an authentication error rather than silently returning garbage.
 *
 * @param {string} plaintext - The secret value to encrypt (e.g., an API key).
 * @param {Buffer} masterKey - The 32-byte derived encryption key.
 * @returns {string} Base64-encoded string: base64(IV + ciphertext + authTag).
 *
 * @throws {Error} If masterKey is not a 32-byte Buffer.
 * @throws {Error} If plaintext is not a string.
 */
function encrypt(plaintext, masterKey) {
  if (!Buffer.isBuffer(masterKey) || masterKey.length !== KEY_LENGTH) {
    throw new Error(`Master key must be a ${KEY_LENGTH}-byte Buffer`);
  }
  if (typeof plaintext !== 'string') {
    throw new Error('Plaintext must be a string');
  }

  // Generate a cryptographically random IV for this encryption.
  // Each IV MUST be unique for a given key to maintain GCM's security guarantees.
  const iv = crypto.randomBytes(IV_LENGTH);

  // Create the cipher and encrypt.
  const cipher = crypto.createCipheriv(ALGORITHM, masterKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf-8'),
    cipher.final(),
  ]);

  // The auth tag must be retrieved AFTER cipher.final().
  const authTag = cipher.getAuthTag();

  // Pack everything into a single buffer: IV + ciphertext + authTag
  // This way we only need to store a single string in the database.
  const packed = Buffer.concat([iv, encrypted, authTag]);

  return packed.toString('base64');
}

/**
 * Decrypts an AES-256-GCM encrypted value back to plaintext.
 *
 * Extracts the IV and authTag from the packed format, then decrypts
 * and verifies the authentication tag. If the data has been tampered
 * with, this will throw an error.
 *
 * @param {string} encryptedBase64 - The base64-encoded packed string
 *                                    (IV + ciphertext + authTag).
 * @param {Buffer} masterKey - The 32-byte derived encryption key (must be
 *                              the same key used to encrypt).
 * @returns {string} The decrypted plaintext string.
 *
 * @throws {Error} If masterKey is not a 32-byte Buffer.
 * @throws {Error} If the encrypted data is too short to contain IV + authTag.
 * @throws {Error} If authentication fails (data was tampered with or wrong key).
 */
function decrypt(encryptedBase64, masterKey) {
  if (!Buffer.isBuffer(masterKey) || masterKey.length !== KEY_LENGTH) {
    throw new Error(`Master key must be a ${KEY_LENGTH}-byte Buffer`);
  }
  if (typeof encryptedBase64 !== 'string' || encryptedBase64.length === 0) {
    throw new Error('Encrypted value must be a non-empty base64 string');
  }

  const packed = Buffer.from(encryptedBase64, 'base64');

  // Minimum size: IV (12) + at least 0 bytes ciphertext + authTag (16) = 28
  const minLength = IV_LENGTH + AUTH_TAG_LENGTH;
  if (packed.length < minLength) {
    throw new Error(`Encrypted data too short (${packed.length} bytes, minimum ${minLength})`);
  }

  // Unpack: first 12 bytes = IV, last 16 bytes = authTag, middle = ciphertext
  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(packed.length - AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH, packed.length - AUTH_TAG_LENGTH);

  // Create decipher and set the auth tag for verification.
  const decipher = crypto.createDecipheriv(ALGORITHM, masterKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  // Decrypt. If the auth tag doesn't match (wrong key or tampered data),
  // decipher.final() will throw "Unsupported state or unable to authenticate data".
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf-8');
}

// ---------------------------------------------------------------------------
// Master Key Resolution
// ---------------------------------------------------------------------------

/** Cached master key to avoid re-deriving on every call. */
let cachedMasterKey = null;

/**
 * Gets (or generates) the master encryption key for admin config secrets.
 *
 * Resolution order:
 *   1. DREAME_ADMIN_SECRET environment variable — preferred for production.
 *      The env var is passed through PBKDF2 to derive the actual AES key.
 *   2. server-data/.admin-key file — development fallback. Contains a
 *      pre-generated random key that persists across server restarts.
 *   3. Auto-generate — if neither exists, generates a random 64-byte hex
 *      string, saves it to the file, and derives the key from it.
 *
 * The result is cached in memory so PBKDF2 only runs once per server lifetime.
 *
 * WARNING: If DREAME_ADMIN_SECRET changes or the .admin-key file is deleted,
 * all previously encrypted secrets in admin_config become unreadable and must
 * be re-entered through the admin panel.
 *
 * @returns {Buffer} A 32-byte Buffer suitable for AES-256-GCM encryption.
 */
function getMasterKey() {
  if (cachedMasterKey) return cachedMasterKey;

  // 1. Check environment variable (production).
  if (process.env.DREAME_ADMIN_SECRET) {
    cachedMasterKey = deriveMasterKey(process.env.DREAME_ADMIN_SECRET);
    console.log('[CRYPTO] Master key derived from DREAME_ADMIN_SECRET env var');
    return cachedMasterKey;
  }

  // 2. Check file-based key (development).
  if (fs.existsSync(ADMIN_KEY_FILE)) {
    const fileSecret = fs.readFileSync(ADMIN_KEY_FILE, 'utf-8').trim();
    if (fileSecret.length > 0) {
      cachedMasterKey = deriveMasterKey(fileSecret);
      console.log('[CRYPTO] Master key loaded from file (server-data/.admin-key)');
      console.warn('[CRYPTO] WARNING: Using file-based key. Set DREAME_ADMIN_SECRET env var for production.');
      return cachedMasterKey;
    }
  }

  // 3. Auto-generate a new key and save it.
  // 64 bytes of random data encoded as hex = 128 characters of entropy.
  const generatedSecret = crypto.randomBytes(64).toString('hex');

  // Ensure the directory exists before writing.
  const dir = path.dirname(ADMIN_KEY_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(ADMIN_KEY_FILE, generatedSecret, 'utf-8');

  cachedMasterKey = deriveMasterKey(generatedSecret);
  console.log('[CRYPTO] Generated new admin key and saved to server-data/.admin-key');
  console.warn('[CRYPTO] WARNING: Using auto-generated file-based key. Set DREAME_ADMIN_SECRET env var for production.');

  return cachedMasterKey;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  deriveMasterKey,
  encrypt,
  decrypt,
  getMasterKey,
};
