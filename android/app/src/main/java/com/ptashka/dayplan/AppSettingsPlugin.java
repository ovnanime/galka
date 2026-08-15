package com.ptashka.dayplan;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.PowerManager;
import android.provider.MediaStore;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "AppSettings")
public class AppSettingsPlugin extends Plugin {

    public static final String REMINDERS_CHANNEL = "reminders_v3";
    public static final String DIGEST_CHANNEL = "digest_v3";

    // Расписания — это текст, мегабайты означают, что выбрали не тот файл
    private static final long MAX_IMPORT_BYTES = 8L * 1024 * 1024;

    @PluginMethod
    public void getStatus(PluginCall call) {
        Context context = getContext();
        createNotificationChannels(context);

        JSObject result = new JSObject();
        result.put("sdkInt", Build.VERSION.SDK_INT);
        result.put("notificationsEnabled", NotificationManagerCompat.from(context).areNotificationsEnabled());

        boolean batteryExempt = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager powerManager = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            batteryExempt = powerManager != null &&
                powerManager.isIgnoringBatteryOptimizations(context.getPackageName());
        }
        result.put("batteryExempt", batteryExempt);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            NotificationChannel reminders = manager == null ? null : manager.getNotificationChannel(REMINDERS_CHANNEL);
            NotificationChannel digest = manager == null ? null : manager.getNotificationChannel(DIGEST_CHANNEL);
            putChannelStatus(result, "reminders", reminders);
            putChannelStatus(result, "digest", digest);
        } else {
            result.put("remindersChannelEnabled", true);
            result.put("remindersChannelImportance", NotificationManager.IMPORTANCE_HIGH);
            result.put("remindersChannelSound", true);
            result.put("remindersChannelVibration", true);
            result.put("digestChannelEnabled", true);
            result.put("digestChannelImportance", NotificationManager.IMPORTANCE_DEFAULT);
            result.put("digestChannelSound", true);
            result.put("digestChannelVibration", true);
        }

        try {
            PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            result.put("versionName", info.versionName == null ? "" : info.versionName);
            long versionCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? info.getLongVersionCode() : info.versionCode;
            result.put("versionCode", versionCode);
        } catch (PackageManager.NameNotFoundException ignored) {
            result.put("versionName", "");
            result.put("versionCode", 0);
        }

        call.resolve(result);
    }

    @PluginMethod
    public void ensureNotificationChannels(PluginCall call) {
        createNotificationChannels(getContext());
        call.resolve();
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Context context = getContext();
        Intent fallback = appDetailsIntent(context);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, context.getPackageName());
            startSettings(intent, fallback, call);
        } else {
            startSettings(fallback, null, call);
        }
    }

    @PluginMethod
    public void openNotificationChannelSettings(PluginCall call) {
        Context context = getContext();
        String channelId = call.getString("channelId", REMINDERS_CHANNEL);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, context.getPackageName())
                .putExtra(Settings.EXTRA_CHANNEL_ID, channelId);
            Intent fallback = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, context.getPackageName());
            startSettings(intent, fallback, call);
        } else {
            startSettings(appDetailsIntent(context), null, call);
        }
    }

    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        Context context = getContext();
        Intent fallback = appDetailsIntent(context);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            startSettings(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS), fallback, call);
        } else {
            startSettings(fallback, null, call);
        }
    }

    @PluginMethod
    public void openAppDetails(PluginCall call) {
        startSettings(appDetailsIntent(getContext()), null, call);
    }

    /** Закрыть приложение. Подтверждение выхода рисует веб-часть,
     *  системный диалог остался только как запасной вариант. */
    @PluginMethod
    public void exitApp(PluginCall call) {
        call.resolve();
        getActivity().runOnUiThread(() -> getActivity().finish());
    }

    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url", "").trim();
        Uri uri = Uri.parse(url);
        String scheme = uri.getScheme();
        if (!("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme))) {
            call.reject("Поддерживаются только ссылки http и https");
            return;
        }
        try {
            getActivity().startActivity(new Intent(Intent.ACTION_VIEW, uri));
            call.resolve();
        } catch (Exception error) {
            call.reject("Не удалось открыть ссылку", error);
        }
    }

    @PluginMethod
    public void exportFile(PluginCall call) {
        String filename = call.getString("filename", "galka.galka");
        String content = call.getString("content", "");
        try {
            File dir = new File(getContext().getCacheDir(), "export");
            if (!dir.exists() && !dir.mkdirs()) {
                call.reject("Не удалось создать временный каталог");
                return;
            }
            // Каталог общий на все выгрузки — старые файлы там не копим
            File[] old = dir.listFiles();
            if (old != null) for (File f : old) f.delete();

            File file = new File(dir, filename);
            try (OutputStreamWriter writer =
                     new OutputStreamWriter(new FileOutputStream(file), StandardCharsets.UTF_8)) {
                writer.write(content);
            }

            Uri uri = FileProvider.getUriForFile(getContext(),
                getContext().getPackageName() + ".fileprovider", file);

            Intent send = new Intent(Intent.ACTION_SEND)
                .setType("application/json")
                .putExtra(Intent.EXTRA_STREAM, uri)
                .putExtra(Intent.EXTRA_TITLE, filename)
                .putExtra(Intent.EXTRA_SUBJECT, filename)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            // Без clipData часть приложений не видит вложение
            send.setClipData(ClipData.newRawUri(filename, uri));

            Intent chooser = Intent.createChooser(send, "Куда сохранить расписания");
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);

            call.resolve(new JSObject().put("saved", true).put("filename", filename));
        } catch (Exception error) {
            call.reject("Не удалось подготовить файл", error);
        }
    }

    /**
     * Копия перед удалением всех данных. Пишется без участия пользователя,
     * поэтому идёт в «Загрузки»: этот каталог переживает удаление приложения,
     * в отличие от его собственной папки.
     */
    @PluginMethod
    public void saveBackup(PluginCall call) {
        String filename = call.getString("filename", "galka-backup.galka");
        String content = call.getString("content", "");
        byte[] bytes = content.getBytes(StandardCharsets.UTF_8);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = getContext().getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                values.put(MediaStore.Downloads.MIME_TYPE, "application/json");
                values.put(MediaStore.Downloads.IS_PENDING, 1);

                Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) {
                    call.reject("Не удалось создать файл в «Загрузках»");
                    return;
                }
                try (OutputStream out = resolver.openOutputStream(uri)) {
                    if (out == null) {
                        call.reject("Не удалось открыть файл для записи");
                        return;
                    }
                    out.write(bytes);
                }
                values.clear();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                resolver.update(uri, values, null, null);

                call.resolve(new JSObject().put("saved", true).put("location", "Загрузки"));
                return;
            }

            // До Android 10 запись в общие «Загрузки» требует разрешения,
            // поэтому кладём в собственный каталог приложения на карте памяти
            File dir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (dir == null) dir = getContext().getFilesDir();
            if (!dir.exists() && !dir.mkdirs()) {
                call.reject("Не удалось создать каталог для копии");
                return;
            }
            File file = new File(dir, filename);
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(bytes);
            }
            call.resolve(new JSObject().put("saved", true).put("location", file.getAbsolutePath()));
        } catch (Exception error) {
            call.reject("Не удалось сохранить копию", error);
        }
    }

    /**
     * Содержимое файла, которым запустили приложение (открытие .galka
     * из проводника). Отдаётся один раз: намерение сразу помечается
     * использованным, иначе тот же файл предложится при каждом возврате.
     */
    @PluginMethod
    public void consumeOpenedFile(PluginCall call) {
        Intent intent = getActivity().getIntent();
        JSObject result = new JSObject();

        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction()) || intent.getData() == null) {
            call.resolve(result.put("has", false));
            return;
        }

        Uri uri = intent.getData();
        intent.setAction(Intent.ACTION_MAIN);
        intent.setData(null);

        try (InputStream in = getContext().getContentResolver().openInputStream(uri);
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            if (in == null) {
                call.resolve(result.put("has", false));
                return;
            }
            byte[] buffer = new byte[8192];
            long total = 0;
            int read;
            while ((read = in.read(buffer)) > 0) {
                total += read;
                if (total > MAX_IMPORT_BYTES) {
                    call.reject("Файл слишком большой");
                    return;
                }
                out.write(buffer, 0, read);
            }
            call.resolve(result
                .put("has", true)
                .put("content", new String(out.toByteArray(), StandardCharsets.UTF_8)));
        } catch (Exception error) {
            call.reject("Не удалось прочитать открытый файл", error);
        }
    }

    @PluginMethod
    public void importFile(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            // У «.galka» нет зарегистрированного типа, поэтому показываем все файлы
            .setType("*/*");
        startActivityForResult(call, intent, "handleImportResult");
    }

    @ActivityCallback
    private void handleImportResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        if (result == null || result.getResultCode() != Activity.RESULT_OK ||
            result.getData() == null || result.getData().getData() == null) {
            call.resolve(new JSObject().put("cancelled", true));
            return;
        }

        Uri uri = result.getData().getData();
        try (InputStream in = getContext().getContentResolver().openInputStream(uri);
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            if (in == null) {
                call.reject("Не удалось открыть файл");
                return;
            }
            byte[] buffer = new byte[8192];
            long total = 0;
            int read;
            while ((read = in.read(buffer)) > 0) {
                total += read;
                if (total > MAX_IMPORT_BYTES) {
                    call.reject("Файл слишком большой для расписаний");
                    return;
                }
                out.write(buffer, 0, read);
            }
            call.resolve(new JSObject()
                .put("cancelled", false)
                .put("content", new String(out.toByteArray(), StandardCharsets.UTF_8)));
        } catch (Exception error) {
            call.reject("Не удалось прочитать файл", error);
        }
    }

    @PluginMethod
    public void sendTestNotification(PluginCall call) {
        Context context = getContext();
        createNotificationChannels(context);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            call.reject("Разрешение на уведомления не выдано");
            return;
        }

        NotificationManagerCompat manager = NotificationManagerCompat.from(context);
        if (!manager.areNotificationsEnabled()) {
            call.reject("Уведомления отключены в настройках Android");
            return;
        }

        boolean headsUpConfigured = Build.VERSION.SDK_INT < Build.VERSION_CODES.O;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager systemManager = context.getSystemService(NotificationManager.class);
            NotificationChannel channel = systemManager == null
                ? null : systemManager.getNotificationChannel(REMINDERS_CHANNEL);
            if (channel != null && channel.getImportance() == NotificationManager.IMPORTANCE_NONE) {
                call.reject("Канал напоминаний отключён в настройках Android");
                return;
            }
            headsUpConfigured = channel != null &&
                channel.getImportance() >= NotificationManager.IMPORTANCE_HIGH;
        }

        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent contentIntent = null;
        if (launchIntent != null) {
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            contentIntent = PendingIntent.getActivity(
                context,
                941,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, REMINDERS_CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_dayplan)
            .setContentTitle("Галка: проверка уведомлений")
            .setContentText("Всё работает — не забудь про галочку!")
            .setStyle(new NotificationCompat.BigTextStyle()
                .bigText("Всё работает — не забудь про галочку!"))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(Notification.CATEGORY_REMINDER)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setDefaults(Notification.DEFAULT_ALL)
            .setShowWhen(true)
            .setWhen(System.currentTimeMillis())
            .setAutoCancel(true);
        if (contentIntent != null) builder.setContentIntent(contentIntent);

        int notificationId = 700000 + (int) (System.currentTimeMillis() % 100000);
        manager.notify(notificationId, builder.build());
        call.resolve(new JSObject()
            .put("shown", true)
            .put("id", notificationId)
            .put("headsUpConfigured", headsUpConfigured));
    }

    private void createNotificationChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        // Поведение уже созданного канала Android менять не разрешает. Версия 3
        // получает новые идентификаторы с корректным звуком и приоритетом.
        manager.deleteNotificationChannel("reminders");
        manager.deleteNotificationChannel("digest");
        manager.deleteNotificationChannel("reminders_v2");
        manager.deleteNotificationChannel("digest_v2");

        Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        AudioAttributes audio = new AudioAttributes.Builder()
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
            .build();

        NotificationChannel reminders = new NotificationChannel(
            REMINDERS_CHANNEL,
            "Напоминания о задачах",
            NotificationManager.IMPORTANCE_HIGH
        );
        reminders.setDescription("Задачи со временем и проверочные уведомления");
        reminders.enableVibration(true);
        reminders.setVibrationPattern(new long[] { 0, 250, 120, 250 });
        reminders.setSound(sound, audio);
        reminders.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        reminders.setShowBadge(true);
        manager.createNotificationChannel(reminders);

        NotificationChannel digest = new NotificationChannel(
            DIGEST_CHANNEL,
            "Сводки за день",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        digest.setDescription("Утренний список задач и вечернее напоминание");
        digest.enableVibration(true);
        digest.setSound(sound, audio);
        digest.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        digest.setShowBadge(true);
        manager.createNotificationChannel(digest);
    }

    private void putChannelStatus(JSObject result, String prefix, NotificationChannel channel) {
        boolean enabled = channel != null && channel.getImportance() != NotificationManager.IMPORTANCE_NONE;
        result.put(prefix + "ChannelEnabled", enabled);
        result.put(prefix + "ChannelImportance",
            channel == null ? NotificationManager.IMPORTANCE_NONE : channel.getImportance());
        result.put(prefix + "ChannelSound", channel != null && channel.getSound() != null);
        result.put(prefix + "ChannelVibration", channel != null && channel.shouldVibrate());
    }

    private Intent appDetailsIntent(Context context) {
        return new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.parse("package:" + context.getPackageName()));
    }

    private void startSettings(Intent primary, Intent fallback, PluginCall call) {
        try {
            getActivity().startActivity(primary);
            call.resolve();
        } catch (Exception firstError) {
            if (fallback == null) {
                call.reject("Не удалось открыть системные настройки", firstError);
                return;
            }
            try {
                getActivity().startActivity(fallback);
                call.resolve();
            } catch (Exception secondError) {
                call.reject("Не удалось открыть системные настройки", secondError);
            }
        }
    }
}
