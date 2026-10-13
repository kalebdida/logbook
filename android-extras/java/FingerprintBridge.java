package com.kaleb.logbook;

import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Fingerprint unlock for js/biometric.js. Android's own fingerprint prompt is
 * shown straight over Logbook's screen (no extra see-through activity, which
 * left the web view half-drawn when it closed), and the web view is asked to
 * redraw once the prompt is gone.
 *
 * check()        -> { available: boolean }
 * authenticate() -> resolves when it's them; rejects with code
 *                   "userCancel", "systemCancel", "lockout" or "unavailable".
 */
@CapacitorPlugin(name = "LogbookFingerprint")
public class FingerprintBridge extends Plugin {
    private static final int KINDS = BiometricManager.Authenticators.BIOMETRIC_WEAK;

    @PluginMethod
    public void check(PluginCall call) {
        int status = BiometricManager.from(getContext()).canAuthenticate(KINDS);
        JSObject out = new JSObject();
        out.put("available", status == BiometricManager.BIOMETRIC_SUCCESS);
        call.resolve(out);
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        if (BiometricManager.from(getContext()).canAuthenticate(KINDS) != BiometricManager.BIOMETRIC_SUCCESS) {
            call.reject("No fingerprint is set up on this phone", "unavailable");
            return;
        }
        final String title = call.getString("title", "Logbook");
        final String subtitle = call.getString("subtitle", "");
        final String cancel = call.getString("cancel", "Use PIN");
        final FragmentActivity activity = getActivity();
        activity.runOnUiThread(() -> {
            BiometricPrompt prompt = new BiometricPrompt(activity, ContextCompat.getMainExecutor(activity),
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                        redraw();
                        call.resolve();
                    }

                    @Override
                    public void onAuthenticationError(int code, @NonNull CharSequence message) {
                        redraw();
                        String why;
                        if (code == BiometricPrompt.ERROR_USER_CANCELED || code == BiometricPrompt.ERROR_NEGATIVE_BUTTON) why = "userCancel";
                        else if (code == BiometricPrompt.ERROR_LOCKOUT || code == BiometricPrompt.ERROR_LOCKOUT_PERMANENT) why = "lockout";
                        else if (code == BiometricPrompt.ERROR_NO_BIOMETRICS || code == BiometricPrompt.ERROR_HW_NOT_PRESENT
                            || code == BiometricPrompt.ERROR_HW_UNAVAILABLE) why = "unavailable";
                        else why = "systemCancel";
                        call.reject(message.toString(), why);
                    }
                    // a finger that isn't recognised keeps the prompt open (Android shows "Try again")
                });
            BiometricPrompt.PromptInfo.Builder info = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setNegativeButtonText(cancel)
                .setConfirmationRequired(false)
                .setAllowedAuthenticators(KINDS);
            if (!subtitle.isEmpty()) info.setSubtitle(subtitle);
            try {
                prompt.authenticate(info.build());
            } catch (Exception e) {
                call.reject("Couldn't show the fingerprint prompt", "systemCancel");
            }
        });
    }

    /** The prompt is gone: have the web view draw everything again, now and a moment later. */
    private void redraw() {
        if (getBridge() == null) return;
        final WebView web = getBridge().getWebView();
        if (web == null) return;
        web.post(web::invalidate);
        web.postDelayed(web::invalidate, 250);
        web.postDelayed(web::invalidate, 800);
    }
}
