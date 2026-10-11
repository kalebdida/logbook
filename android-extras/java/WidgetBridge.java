package com.kaleb.logbook;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** js/widget.js calls LogbookWidget.update({...}) whenever today changes. */
@CapacitorPlugin(name = "LogbookWidget")
public class WidgetBridge extends Plugin {
    @PluginMethod
    public void update(PluginCall call) {
        SharedPreferences.Editor e = getContext().getSharedPreferences(LogbookWidget.PREFS, Context.MODE_PRIVATE).edit();
        e.putString("day", call.getString("day", ""));
        Integer streak = call.getInt("streak", 0);
        e.putInt("streak", streak == null ? 0 : streak);
        e.putString("tasksHead", call.getString("tasksHead", ""));
        e.putString("tasks", call.getString("tasks", ""));
        e.putString("nextTitle", call.getString("nextTitle", ""));
        e.putString("nextDate", call.getString("nextDate", ""));
        e.apply();
        LogbookWidget.refresh(getContext());
        call.resolve();
    }
}
