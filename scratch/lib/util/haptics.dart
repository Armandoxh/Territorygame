/// Scratch-feel haptics, platform-split: on the web we call the browser's
/// Vibration API directly with tiny millisecond pulses (far lighter than
/// Flutter's default mapping); on native builds we use the system haptic
/// engine's light taps.
///
/// Honest platform note: iPhone browsers do NOT support web vibration at all
/// (Safari has never shipped it) — on iOS these are silent until we ship the
/// native app, where CoreHaptics takes over via the io implementation.
export 'haptics_io.dart' if (dart.library.html) 'haptics_web.dart';
