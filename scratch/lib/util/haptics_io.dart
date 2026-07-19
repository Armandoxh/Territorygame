import 'package:flutter/services.dart';

/// Native (iOS/Android app) haptics — the system's lightest tap for
/// scratching, firmer thuds for reveals.
void scratchTick() => HapticFeedback.lightImpact();

void revealThud() => HapticFeedback.mediumImpact();

void bigWinThud() => HapticFeedback.heavyImpact();

// ---- Diagnostics (parity with the web implementation) ----

String debugInfo() => 'native haptics (system engine)';

void debugSwitchTick() => HapticFeedback.selectionClick();

void debugVibrate(int ms) => HapticFeedback.vibrate();
