package com.exfin.oms;

import android.content.Context;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;
import java.util.Set;

@CapacitorPlugin(name = "GreetingTts")
public class GreetingTtsPlugin extends Plugin {
    public static final String TAG = "GreetingTts";

    private TextToSpeech tts = null;
    private boolean isInitialized = false;
    private String pendingSpeakText = null;
    private PluginCall pendingSpeakCall = null;

    @Override
    public void load() {
        super.load();
        initTextToSpeech();
    }

    private synchronized void initTextToSpeech() {
        if (tts != null) return;
        Context context = getContext();
        if (context == null) return;

        Log.i(TAG, "[GREETING NATIVE TTS] initialization started");
        try {
            tts = new TextToSpeech(context.getApplicationContext(), status -> {
                if (status == TextToSpeech.SUCCESS) {
                    Log.i(TAG, "[GREETING NATIVE TTS] initialized");
                    isInitialized = true;
                    configureEngine();

                    // Process pending speak call if any
                    if (pendingSpeakText != null) {
                        String queuedText = pendingSpeakText;
                        PluginCall queuedCall = pendingSpeakCall;
                        pendingSpeakText = null;
                        pendingSpeakCall = null;
                        speakTextInternal(queuedText, queuedCall);
                    }
                } else {
                    Log.e(TAG, "[GREETING NATIVE TTS] error: initialization failed with status " + status);
                    isInitialized = false;
                    if (pendingSpeakCall != null) {
                        pendingSpeakCall.reject("TextToSpeech initialization failed with status " + status);
                        pendingSpeakCall = null;
                        pendingSpeakText = null;
                    }
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "[GREETING NATIVE TTS] error initializing TextToSpeech: " + e.getMessage(), e);
        }
    }

    private void configureEngine() {
        if (tts == null) return;

        Locale localeToUse = null;
        try {
            Locale enIn = new Locale("en", "IN");
            int inRes = tts.isLanguageAvailable(enIn);
            if (inRes >= TextToSpeech.LANG_AVAILABLE) {
                tts.setLanguage(enIn);
                localeToUse = enIn;
                Log.i(TAG, "[GREETING NATIVE TTS] language selected: en-IN");
            } else {
                int usRes = tts.isLanguageAvailable(Locale.US);
                if (usRes >= TextToSpeech.LANG_AVAILABLE) {
                    tts.setLanguage(Locale.US);
                    localeToUse = Locale.US;
                    Log.i(TAG, "[GREETING NATIVE TTS] language selected: en-US");
                } else {
                    tts.setLanguage(Locale.ENGLISH);
                    localeToUse = Locale.ENGLISH;
                    Log.i(TAG, "[GREETING NATIVE TTS] language selected: English (default)");
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "[GREETING NATIVE TTS] language selection error: " + e.getMessage());
        }

        // Voice selection check (Android API 21+)
        try {
            Voice selectedVoice = tts.getVoice();
            if (selectedVoice != null) {
                Log.i(TAG, "[GREETING NATIVE TTS] voice selected: " + selectedVoice.getName());
            } else if (localeToUse != null) {
                Set<Voice> voices = tts.getVoices();
                if (voices != null && !voices.isEmpty()) {
                    for (Voice v : voices) {
                        if (v.getLocale() != null && v.getLocale().equals(localeToUse) && !v.isNetworkConnectionRequired()) {
                            tts.setVoice(v);
                            Log.i(TAG, "[GREETING NATIVE TTS] voice selected: " + v.getName());
                            break;
                        }
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "[GREETING NATIVE TTS] voice selection exception: " + e.getMessage());
        }

        tts.setSpeechRate(0.95f);
        tts.setPitch(1.0f);

        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override
            public void onStart(String utteranceId) {
                Log.i(TAG, "[GREETING NATIVE TTS] started: " + utteranceId);
                JSObject data = new JSObject();
                data.put("utteranceId", utteranceId);
                notifyListeners("ttsStarted", data);
            }

            @Override
            public void onDone(String utteranceId) {
                Log.i(TAG, "[GREETING NATIVE TTS] completed: " + utteranceId);
                JSObject data = new JSObject();
                data.put("utteranceId", utteranceId);
                notifyListeners("ttsCompleted", data);
            }

            @Override
            public void onError(String utteranceId) {
                Log.e(TAG, "[GREETING NATIVE TTS] error on utteranceId: " + utteranceId);
                JSObject data = new JSObject();
                data.put("utteranceId", utteranceId);
                data.put("error", "General TTS error");
                notifyListeners("ttsError", data);
            }

            @Override
            public void onError(String utteranceId, int errorCode) {
                Log.e(TAG, "[GREETING NATIVE TTS] error on utteranceId: " + utteranceId + " errorCode: " + errorCode);
                JSObject data = new JSObject();
                data.put("utteranceId", utteranceId);
                data.put("errorCode", errorCode);
                notifyListeners("ttsError", data);
            }
        });
    }

    private synchronized void speakTextInternal(String text, PluginCall call) {
        if (tts == null || !isInitialized) {
            if (call != null) {
                call.reject("TTS not initialized");
            }
            return;
        }

        try {
            Log.i(TAG, "[GREETING NATIVE TTS] speaking: " + text);
            String utteranceId = "exfin_greeting_" + System.currentTimeMillis();
            Bundle params = new Bundle();
            params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId);

            int result = tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId);
            if (result == TextToSpeech.SUCCESS) {
                if (call != null) {
                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    ret.put("utteranceId", utteranceId);
                    call.resolve(ret);
                }
            } else {
                Log.e(TAG, "[GREETING NATIVE TTS] error: speak() returned code " + result);
                if (call != null) {
                    call.reject("speak() failed with code " + result);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "[GREETING NATIVE TTS] error: " + e.getMessage(), e);
            if (call != null) {
                call.reject("Exception during TTS speak: " + e.getMessage());
            }
        }
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text");
        if (text == null || text.trim().isEmpty()) {
            call.reject("Text parameter cannot be empty");
            return;
        }

        if (tts == null) {
            initTextToSpeech();
        }

        if (!isInitialized) {
            Log.i(TAG, "[GREETING NATIVE TTS] speak queued until initialization completes");
            pendingSpeakText = text.trim();
            pendingSpeakCall = call;
            return;
        }

        speakTextInternal(text.trim(), call);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            pendingSpeakText = null;
            pendingSpeakCall = null;
            if (tts != null) {
                tts.stop();
            }
            JSObject ret = new JSObject();
            ret.put("stopped", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to stop TTS: " + e.getMessage());
        }
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", isInitialized && tts != null);
        call.resolve(ret);
    }

    @PluginMethod
    public void isFirebaseConfigured(PluginCall call) {
        try {
            Context context = getContext();
            int resId = context.getResources().getIdentifier("google_app_id", "string", context.getPackageName());
            boolean configured = (resId != 0);
            JSObject ret = new JSObject();
            ret.put("configured", configured);
            call.resolve(ret);
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("configured", false);
            call.resolve(ret);
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) {
            try {
                tts.stop();
                tts.shutdown();
            } catch (Exception ignored) {}
            tts = null;
        }
        isInitialized = false;
        super.handleOnDestroy();
    }
}
