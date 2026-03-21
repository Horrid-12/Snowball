package com.howwid.snowball;

import android.os.Build;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DynamicColor")
public class DynamicColorPlugin extends Plugin {

    @PluginMethod
    public void getAccentColor(PluginCall call) {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                int colorRes = android.R.color.system_accent1_500;
                int colorInt = ContextCompat.getColor(getContext(), colorRes);
                String hexColor = String.format("#%06X", (0xFFFFFF & colorInt));
                ret.put("value", hexColor);
                call.resolve(ret);
            } catch (Exception e) {
                ret.put("value", null);
                call.resolve(ret);
            }
        } else {
            ret.put("value", null);
            call.resolve(ret);
        }
    }
}
