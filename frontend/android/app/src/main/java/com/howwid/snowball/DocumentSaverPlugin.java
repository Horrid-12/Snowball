package com.howwid.snowball;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "DocumentSaver")
public class DocumentSaverPlugin extends Plugin {

    private static final String TAG = "DocumentSaverPlugin";

    @PluginMethod
    public void saveTextFile(PluginCall call) {
        String suggestedName = call.getString("suggestedName");
        String mimeType = call.getString("mimeType", "application/json");

        if (suggestedName == null || suggestedName.trim().isEmpty()) {
            call.reject("suggestedName must be provided.");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, suggestedName);

        startActivityForResult(call, intent, "saveTextFileResult");
    }

    @ActivityCallback
    private void saveTextFileResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        try {
            if (result.getResultCode() == Activity.RESULT_CANCELED) {
                call.resolve();
                return;
            }

            if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
                call.reject("Document save was not completed.");
                return;
            }

            Uri uri = result.getData().getData();
            String content = call.getString("content", "");

            OutputStream outputStream = getContext().getContentResolver().openOutputStream(uri, "wt");
            if (outputStream == null) {
                call.reject("Could not open the selected file for writing.");
                return;
            }

            outputStream.write(content.getBytes(StandardCharsets.UTF_8));
            outputStream.flush();
            outputStream.close();

            JSObject ret = new JSObject();
            ret.put("uri", uri.toString());
            call.resolve(ret);
        } catch (Exception error) {
            Log.e(TAG, error.getMessage(), error);
            call.reject(error.getMessage());
        }
    }
}
