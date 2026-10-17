package it.ritvio.android;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.media.AudioManager;
import androidx.activity.OnBackPressedCallback;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle state) {
        registerPlugin(RitvioPlaybackPlugin.class);
        // A preference I/O failure must not prevent the existing player from opening.
        try { LanguagePreferences.INSTANCE.restore(this); } catch (RuntimeException ignored) {}
        super.onCreate(state);
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
        getBridge().getWebView().getSettings().setTextZoom(Math.round(getResources().getConfiguration().fontScale * 100));
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (getBridge().getWebView().canGoBack()) getBridge().getWebView().goBack();
                else moveTaskToBack(true);
            }
        });
    }
}
