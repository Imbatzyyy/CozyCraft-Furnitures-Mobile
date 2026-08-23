package com.cozycraft.furniture;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Capacitor injects safe-area CSS variables into the host document. The
        // CozyCraft storefront runs in a same-app iframe, so those variables do
        // not cross the document boundary. Reserve the Android navigation-bar
        // inset on the native content root instead. This keeps every page,
        // modal and fixed bottom action above both gesture navigation and the
        // classic Samsung three-button navigation bar.
        View appContent = findViewById(android.R.id.content);
        int cozyIvory = Color.parseColor("#F7F6F3");
        appContent.setBackgroundColor(cozyIvory);
        getWindow().getDecorView().setBackgroundColor(cozyIvory);
        final int initialLeft = appContent.getPaddingLeft();
        final int initialTop = appContent.getPaddingTop();
        final int initialRight = appContent.getPaddingRight();
        final int initialBottom = appContent.getPaddingBottom();

        ViewCompat.setOnApplyWindowInsetsListener(appContent, (view, windowInsets) -> {
            Insets safeArea = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            Insets ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
            boolean keyboardVisible = windowInsets.isVisible(WindowInsetsCompat.Type.ime());

            // When the keyboard opens it becomes the bottom obstruction. Using
            // the larger inset prevents focused fields and actions being hidden.
            int bottomInset = keyboardVisible
                ? Math.max(safeArea.bottom, ime.bottom)
                : safeArea.bottom;
            view.setPadding(
                initialLeft + safeArea.left,
                initialTop + safeArea.top,
                initialRight + safeArea.right,
                initialBottom + bottomInset
            );

            return windowInsets;
        });
        ViewCompat.requestApplyInsets(appContent);

        // Match both system-bar areas to the storefront. Samsung/Android 16 can
        // otherwise add a gray contrast scrim to the transparent status bar.
        getWindow().setStatusBarColor(cozyIvory);
        getWindow().setNavigationBarColor(cozyIvory);
        getWindow().setStatusBarContrastEnforced(false);
        getWindow().setNavigationBarContrastEnforced(false);
        getWindow().setNavigationBarDividerColor(cozyIvory);
        WindowInsetsControllerCompat barsController = WindowCompat.getInsetsController(
            getWindow(),
            getWindow().getDecorView()
        );
        barsController.setAppearanceLightStatusBars(true);
        barsController.setAppearanceLightNavigationBars(true);
    }
}
