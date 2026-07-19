// ignore_for_file: avoid_web_libraries_in_flutter
import 'dart:html' as html;

/// Web haptics via the browser Vibration API (Android Chrome etc.; iOS Safari
/// doesn't support vibration at all). Durations are deliberately tiny — a 4ms
/// pulse reads as a faint tick under the finger, nothing like an alarm.
void scratchTick() => html.window.navigator.vibrate(4);

void revealThud() => html.window.navigator.vibrate(15);

/// A little celebratory da-da-dum for 10x+ wins.
void bigWinThud() => html.window.navigator.vibrate([20, 60, 30]);
