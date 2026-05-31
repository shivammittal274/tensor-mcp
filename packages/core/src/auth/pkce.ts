/**
 * PKCE (RFC 7636) helpers for OAuth 2.0 + PKCE flows.
 *
 * Both functions are pure given a `crypto.getRandomValues` source. The
 * verifier is 32 random bytes, base64url-encoded (~43 chars — within the
 * 43-128 RFC range). The challenge is the SHA-256 of the verifier, also
 * base64url-encoded. We always use `S256` — `plain` is allowed by the spec
 * but rejected by serious providers and offers no security benefit.
 */

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export function randomCodeVerifier(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export function randomState(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(24)));
}

export async function codeChallengeS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64url(new Uint8Array(digest));
}
