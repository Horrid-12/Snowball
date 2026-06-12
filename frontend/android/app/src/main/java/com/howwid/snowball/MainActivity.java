package com.howwid.snowball;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DynamicColorPlugin.class);
        registerPlugin(DocumentSaverPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
