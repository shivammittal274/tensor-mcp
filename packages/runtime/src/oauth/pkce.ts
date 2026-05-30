export interface PKCEPair {
  verifier: string;
  challenge: string;
  method: "S256";
}

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export async function generatePKCE(): Promise<PKCEPair> {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(64));
  const verifier = base64url(verifierBytes);
  const challengeBytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  const challenge = base64url(challengeBytes);
  return { verifier, challenge, method: "S256" };
}
