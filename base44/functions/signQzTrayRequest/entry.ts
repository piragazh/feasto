/**
 * QZ Tray signing service.
 *
 * QZ Tray requires an RSA key pair for trusted, prompt-free connections:
 *  - The public certificate is added to QZ Tray's qz-tray.properties
 *    (wss.trusted.certificates) on each POS machine.
 *  - The private key (stored in the QZ_TRAY_PRIVATE_KEY secret) signs the
 *    connection challenge QZ Tray sends during websocket handshake.
 *
 * This function exposes two actions:
 *  - getCert  → returns the public certificate PEM (for setCertificatePromise)
 *  - sign     → RSA-SHA256 signs the `toSign` challenge (for setSignaturePromise)
 *
 * The private key never leaves the backend — the browser only receives
 * signatures and the public cert.
 */

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { action, toSign } = body || {};

    const cert = Deno.env.get("QZ_TRAY_CERTIFICATE");
    const privateKeyPem = Deno.env.get("QZ_TRAY_PRIVATE_KEY");

    if (!cert || !privateKeyPem) {
      return Response.json(
        { error: "QZ Tray signing not configured. Set QZ_TRAY_CERTIFICATE and QZ_TRAY_PRIVATE_KEY secrets." },
        { status: 503 }
      );
    }

    // Return the public certificate (called once by the browser, then cached)
    if (action === "getCert") {
      return Response.json({ certificate: cert });
    }

    // Sign the connection challenge with the RSA private key
    if (action === "sign" && toSign) {
      const b64 = privateKeyPem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
      const der = base64ToBytes(b64);

      const key = await crypto.subtle.importKey(
        "pkcs8",
        der,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"]
      );

      const signature = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        key,
        new TextEncoder().encode(toSign)
      );

      return Response.json({ signature: bytesToBase64(new Uint8Array(signature)) });
    }

    return Response.json({ error: "Invalid action. Use 'getCert' or 'sign'." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});