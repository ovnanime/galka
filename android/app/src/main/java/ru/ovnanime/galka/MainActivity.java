package ru.ovnanime.galka;

import android.app.AlertDialog;
import android.content.Intent;
import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private boolean exitDialogVisible = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppSettingsPlugin.class);
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                handleDayplanBack();
            }
        });
    }

    /** Файл открыли, когда приложение уже работало — подменяем намерение,
     *  иначе плагин прочитает то, с которым приложение запускалось. */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
    }

    private void handleDayplanBack() {
        if (bridge == null || bridge.getWebView() == null) {
            showExitDialog();
            return;
        }
        String script = "(function(){try{return !!(window.dayplanHandleBack&&window.dayplanHandleBack());}catch(e){return false;}})()";
        bridge.getWebView().evaluateJavascript(script, result -> {
            if (!"true".equals(result)) showExitDialog();
        });
    }

    private void showExitDialog() {
        if (exitDialogVisible || isFinishing()) return;
        exitDialogVisible = true;
        new AlertDialog.Builder(this)
            .setTitle(R.string.exit_title)
            .setMessage(R.string.exit_message)
            .setNegativeButton(R.string.exit_cancel, null)
            .setPositiveButton(R.string.exit_confirm, (dialog, which) -> finish())
            .setOnDismissListener(dialog -> exitDialogVisible = false)
            .show();
    }
}
