/* Fingerprint (or face) unlock for this device's PIN screen.

   It sits on top of the PIN, never instead of it: the PIN always works, and
   it's what you fall back to when the sensor doesn't recognise you. Like the
   PIN it only guards the screen on this phone or computer; it isn't your
   account password.

   - In the Android app: the phone's own fingerprint prompt, through the
     native biometric plugin.
   - In a browser or the installed web app: WebAuthn with the device's own
     authenticator (Windows Hello, Touch ID, an Android phone's fingerprint).
     Nothing is sent anywhere; the browser just proves you were present.
   What's stored in this browser is only a note that it's on (and, for the
   browser kind, the id of the credential). */

var KEY = "logbook-bio";

function native() {
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return null;
  return (C.Plugins && C.Plugins.BiometricAuth) || null;
}

function saved() {
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; }
}

export function hasBiometric() { return Boolean(saved()); }

export function clearBiometric() {
  try { localStorage.removeItem(KEY); } catch (e) {}
}

/* Can this device do it at all? */
export async function biometricAvailable() {
  var p = native();
  if (p) {
    try { var r = await p.checkBiometry(); return Boolean(r && r.isAvailable); } catch (e) { return false; }
  }
  try {
    if (!window.PublicKeyCredential || !window.isSecureContext) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch (e) { return false; }
}

function bytes(n) { return crypto.getRandomValues(new Uint8Array(n)); }
function toB64(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))); }
function fromB64(s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }

/* Turn it on: asks for your fingerprint once, so you know it works.
   Resolves true if it's now on. */
export async function enableBiometric() {
  var p = native();
  try {
    if (p) {
      await p.authenticate({ reason: "Use your fingerprint to unlock Logbook", androidTitle: "Logbook", androidSubtitle: "Confirm it's you", cancelTitle: "Cancel", allowDeviceCredentials: false });
      localStorage.setItem(KEY, JSON.stringify({ kind: "native" }));
      return true;
    }
    var cred = await navigator.credentials.create({
      publicKey: {
        challenge: bytes(32),
        rp: { name: "Logbook" },
        user: { id: bytes(16), name: "logbook-device", displayName: "Logbook on this device" },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
        timeout: 60000
      }
    });
    if (!cred) return false;
    localStorage.setItem(KEY, JSON.stringify({ kind: "web", id: toB64(cred.rawId) }));
    return true;
  } catch (e) {
    return false;
  }
}

/* Ask for the fingerprint. Resolves true only when the device says it's you. */
export async function verifyBiometric() {
  var s = saved();
  if (!s) return false;
  try {
    if (s.kind === "native") {
      var p = native();
      if (!p) return false;
      await p.authenticate({ reason: "Unlock Logbook", androidTitle: "Logbook", androidSubtitle: "Confirm it's you", cancelTitle: "Use PIN", allowDeviceCredentials: false });
      return true;
    }
    var got = await navigator.credentials.get({
      publicKey: {
        challenge: bytes(32),
        allowCredentials: [{ type: "public-key", id: fromB64(s.id), transports: ["internal"] }],
        userVerification: "required",
        timeout: 60000
      }
    });
    return Boolean(got);
  } catch (e) {
    return false;     // cancelled, not recognised, or too many tries: the PIN is still there
  }
}
