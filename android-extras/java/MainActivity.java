package com.kaleb.logbook;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WidgetBridge.class);   // the home screen widget's link to the app
        super.onCreate(savedInstanceState);
    }
}
