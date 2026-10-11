package com.kaleb.logbook;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** The home screen widget: streak, today's tasks, and the next date that
 *  matters. The app writes the numbers (WidgetBridge); this only draws them,
 *  so it works with the app closed and costs no battery. */
public class LogbookWidget extends AppWidgetProvider {
    static final String PREFS = "logbook_widget";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            manager.updateAppWidget(id, build(context));
        }
    }

    static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, LogbookWidget.class));
        for (int id : ids) {
            manager.updateAppWidget(id, build(context));
        }
    }

    static String today() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }

    static long daysUntil(String date) {
        try {
            SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            Date due = f.parse(date);
            Date now = f.parse(today());
            if (due == null || now == null) return Long.MIN_VALUE;
            return Math.round((due.getTime() - now.getTime()) / 86400000.0);
        } catch (ParseException e) {
            return Long.MIN_VALUE;
        }
    }

    static String countdown(long days) {
        if (days == 0) return "today";
        if (days == 1) return "tomorrow";
        if (days < 14) return "in " + days + " days";
        if (days < 60) return "in " + Math.round(days / 7.0) + " weeks";
        return "in " + Math.round(days / 30.4) + " months";
    }

    static RemoteViews build(Context context) {
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.logbook_widget);
        boolean fresh = today().equals(p.getString("day", ""));

        int streak = p.getInt("streak", 0);
        v.setTextViewText(R.id.widget_streak, streak > 0 ? streak + (streak == 1 ? " day in a row" : " days in a row") : "Write today");

        if (fresh) {
            v.setTextViewText(R.id.widget_tasks_head, p.getString("tasksHead", "Today"));
            String tasks = p.getString("tasks", "");
            v.setTextViewText(R.id.widget_tasks, tasks.isEmpty() ? "Nothing on the list yet." : tasks);
        } else {
            v.setTextViewText(R.id.widget_tasks_head, "A new day");
            v.setTextViewText(R.id.widget_tasks, "Open Logbook to plan it.");
        }

        String nextTitle = p.getString("nextTitle", "");
        long days = daysUntil(p.getString("nextDate", ""));
        if (!nextTitle.isEmpty() && days != Long.MIN_VALUE && days >= 0) {
            v.setTextViewText(R.id.widget_next, nextTitle + " · " + countdown(days));
            v.setViewVisibility(R.id.widget_next, View.VISIBLE);
        } else {
            v.setViewVisibility(R.id.widget_next, View.GONE);
        }

        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent tap = PendingIntent.getActivity(context, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        v.setOnClickPendingIntent(R.id.widget_root, tap);
        return v;
    }
}
