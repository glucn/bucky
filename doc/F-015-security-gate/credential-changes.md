# Durable profile credential changes

Trusted-process services and application controls implemented 2026-11-04. Real OS/native-dialog
and representative personal acceptance remain pending. These operations rewrap the existing data key; they do not rotate that key,
erase old copies, or revoke credentials accepted by retained backups/envelopes.

`updateProfileCredentials` requires an authenticated key and the exact expected current envelope.
It reserves an exclusive per-profile credential lock, checks current metadata, and stages a
replacement passphrase or OS-keychain wrap in a private file. Other configured wraps and the
saved recovery code remain unchanged. The staged metadata must match the intended envelope;
the new credential must independently recover the same key before publication.

After a final directory/metadata check and cancellation check, a single rename replaces the
envelope. The profile directory is synced before success. The encrypted book is never opened,
migrated, or rewritten by this service. Raw keys, passphrases and recovery codes are not written
to disk or returned. Callers own and must clear their authenticated key buffers.

Failure or cancellation before rename retains existing credentials. After rename, late
cancellation or sync/cleanup failure preserves the new envelope and reports uncertainty; it
never restores an old envelope over it. Use the new credential after interrupted publication,
or the previous credential if publication did not occur. Independent recovery remains available.

Stale/failed-cleanup credential locks are inventoried. They do not prevent ordinary unlock or
backup/recovery. `preserveCredentialUpdateLock` can retain the entire reviewed lock by rename
after verification of the current key/envelope. The main caller must hold single-instance and
exclusive security ownership, drain other work, freshly authenticate, and obtain native consent
before calling it. No lock is automatically declared stale or deleted. Preserved locks remain
visible, and a new credential update can then be attempted against the current envelope.

From the locked launch screen, choose **Change profile protection**, verify a current passphrase,
fresh OS authentication, or the saved recovery code, then set a passphrase or refresh OS-keychain
protection. New passphrases require exact repetition. Using recovery establishes ordinary
protection; it does not unlock financial storage. Return to the launch screen and separately
authenticate. Financial views remain unmounted during the change, and secrets are cleared from
the form after success or failure. Failed authentication shares the bounded unlock cooldown.

Main owns an exclusive maintenance operation, drains setup/recovery, and rejects financial and
competing security requests. Lock revokes the operation, cancels it, and waits for drainage.
Late OS/native responses cannot publish new work after revocation. A verified publication
already completed before locking remains available. Retained-lock repair requires fresh current
authentication and native consent, then retries against the same expected envelope.

Tests cover persisted passphrase replacement, adding a fallback to keychain-only profiles,
OS-wrap refresh, preserved recovery/alternate credentials and old copies, wrong/stale keys,
links, competing writers, disk-full, concurrent metadata replacement, staged tampering, final
cancellation, post-publication sync/cleanup failure, and retained-lock recovery. Main/UI tests
cover authentication, cooldowns, cancellation/drainage, native consent denial and late responses,
and separate unlock. A packaged scenario replaces a passphrase, rejects the old one, restarts
and unlocks, then uses the original saved code to establish another passphrase and restarts
again. Actual Touch ID/keychain and native preservation acceptance remain manual gates.
