# Profile Key Envelopes

Implemented 2026-09-08 as a trusted-process foundation. It is **not yet wired into app setup,
locking, or database opening**. Existing personal books and backups remain plaintext.

## Version 1 format

`src/services/profileKeys.ts` generates a fresh random 32-byte data key for a new profile and
returns it only to the trusted caller. The serializable envelope contains a format/version,
profile ID, random key ID, authenticated key-check record, and independent credential wraps.
It contains no raw data key, passphrase, or recovery secret.

Each wrap uses AES-256-GCM with a random 12-byte nonce and a 16-byte authentication tag.
Additional authenticated data binds the format/version, profile ID, key ID, and wrap purpose.
Recovery, passphrase, keychain, and key-check records cannot be substituted for each other.
Authenticated decryption verifies the tag before returning a key; a separate encrypted check
confirms that it is the key associated with the envelope.

These use Node's standard [authenticated cipher APIs](https://nodejs.org/api/crypto.html#cryptocreatecipherivalgorithm-key-iv-options).
The implementation is application key-envelope code, not a new cipher or a cryptographic audit.

## Credential modes

- **OS keychain:** the keychain protects a random wrapping key; AES-GCM protects the data key
  under that wrapping key. `src/main/osKeychain.ts` adapts Electron `safeStorage` for the current
  macOS target. Unavailable keychain access and unvalidated platforms are refused. No plaintext
  fallback is provided.
- **Optional passphrase:** scrypt derives a wrapping key with a random 16-byte salt. `scrypt-v1`
  fixes `N=131072`, `r=8`, `p=1`, with a 192 MiB implementation memory limit. These settings follow
  the [OWASP scrypt guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt).
  Only one derivation may run at a time; concurrent attempts must retry. Envelope input cannot
  supply different work/memory parameters.
- **Independent recovery:** a generated random 32-byte secret, encoded as
  `bucky-recovery-v1-<base64url>`, wraps the same data key independently of the keychain. It is
  generated for every new envelope. It must be presented and confirmed during future setup,
  not silently discarded or stored beside the envelope.

Ordinary setup requires a keychain or explicitly selected passphrase mode. If a requested
keychain fails, creation fails even when a passphrase was also supplied: selecting passphrase-only
mode must be explicit. Portable envelope metadata omits the machine-bound keychain record.

Passphrases require at least 12 Unicode code points and at most 1024 UTF-8 bytes. Whitespace and
Unicode are not silently normalized. The UI must communicate these semantics. Length validation
does not establish that a human-chosen passphrase has adequate entropy.

Keychain retrieval is not authentication. Before calling `unlockWithKeychain`, the future
main-owned lock must complete an OS authentication challenge. No key-returning function may
be exposed directly through preload. The one-time recovery code needs a deliberate protected
presentation/confirmation flow; it must not become general renderer-readable state.

## Recovery and credential changes

`unlockWithRecovery` can recover a data key from portable metadata without the original keychain.
`bindKeychain` can then protect that recovered key with a new machine's keychain. It verifies
the supplied key against the envelope before changing any wrap.

`replacePassphrase` creates a new salted passphrase wrap without mutating the original envelope,
data key, or recovery credential. An old passphrase cannot open the updated envelope, but **old
copies and backups still accept their old credentials**. This is rewrapping, not data-key rotation
or revocation of historical backups. Genuine revocation requires a separate database rekey and
explicit treatment of existing copies.

The parser rejects unknown fields/versions/KDF identifiers, invalid profile/key IDs, malformed or
noncanonical encodings, incorrect nonce/tag/key lengths, and input larger than 64 KiB. Credential
failure and authentication failure do not return raw crypto/keychain errors or partial keys.
Temporary mutable key buffers are cleared where possible. JavaScript strings and runtime/native
copies cannot be guaranteed to be erased; no stronger memory-erasure claim is made.

## Verification and remaining integration

Tests cover random key separation, serialization, both credential modes, machine-independent
recovery, new-keychain binding, wrong credentials, metadata/ciphertext/nonce/tag tampering,
profile mismatch, parser limits, concurrency limits, and immutable passphrase replacement.
Keychain tests substitute the OS API; they do not provision or exercise a real macOS keychain item.
A synthetic passphrase/recovery roundtrip and tamper check also pass on Electron's Node 18.18.2.

Remaining work includes protected setup and recovery-code confirmation, atomic envelope
persistence, real OS authentication/keychain acceptance, portable authenticated backup files,
encrypted service/migration integration, lock/relock, and legacy conversion. Do not mark SEC-04
or SEC-05 complete merely because these library tests pass.
