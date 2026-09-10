// ignore_for_file: avoid_web_libraries_in_flutter
import 'dart:async';
import 'dart:html' as html;
import 'dart:js_util' as js_util;

/// Web haptics, two paths:
///
/// - Android browsers: the Vibration API with deliberately tiny pulses — a
///   4ms buzz reads as a faint tick, nothing like an alarm.
/// - iPhone: Safari has never supported the Vibration API, but since iOS 17.4
///   flipping a native `<input type="checkbox" switch>` fires the system's
///   feather-light toggle haptic. We keep an invisible one in the DOM and
///   click it. Unofficial, but it fails silently if Apple ever removes it —
///   and the native app build gets real CoreHaptics via haptics_io.dart.
bool? _vibrateSupported;
bool get _canVibrate => _vibrateSupported ??=
    js_util.hasProperty(html.window.navigator, 'vibrate');

/// Recent SDKs removed `vibrate` from dart:html's Navigator, so call it
/// dynamically — _canVibrate already guarantees it exists before we do.
void _vibrate(Object pattern) {
  try {
    js_util.callMethod(
        html.window.navigator, 'vibrate', [js_util.jsify(pattern)]);
  } catch (_) {}
}

html.InputElement? _switchEl;

html.InputElement get _switch {
  var el = _switchEl;
  if (el == null) {
    el = html.document.createElement('input') as html.InputElement
      ..type = 'checkbox';
    el.setAttribute('switch', '');
    el.setAttribute('aria-hidden', 'true');
    // Full-size but parked above the viewport: zero-size/invisible elements
    // have been reported to not fire the haptic, offscreen ones do.
    el.style
      ..position = 'fixed'
      ..top = '-100px'
      ..left = '0'
      ..width = '51px'
      ..height = '31px';
    html.document.body?.append(el);
    _switchEl = el;
  }
  return el;
}

// ---- Diagnostics (surfaced by the in-game haptics test panel) ----

String debugInfo() {
  _switch; // ensure the element exists before reporting on it
  final ua = html.window.navigator.userAgent;
  return 'vibrate API: $_canVibrate · switch attached: ${_switchEl?.isConnected} · UA: $ua';
}

void debugSwitchTick() => _iosTick();

void debugVibrate(int ms) => _vibrate(ms);

/// One system toggle-tick (iOS). Requires a recent user gesture — scratching
/// is one, so it fires mid-pan exactly when we want it.
void _iosTick() {
  try {
    _switch.click();
  } catch (_) {
    // No DOM, old Safari, or Apple closed the trick — feel nothing, break
    // nothing.
  }
}

void scratchTick() {
  if (_canVibrate) {
    _vibrate(4);
  } else {
    _iosTick();
  }
}

void revealThud() {
  if (_canVibrate) {
    _vibrate(15);
  } else {
    _iosTick();
  }
}

/// A little celebratory da-da-dum for 10x+ wins.
void bigWinThud() {
  if (_canVibrate) {
    _vibrate(const [20, 60, 30]);
  } else {
    _iosTick();
    Timer(const Duration(milliseconds: 90), _iosTick);
    Timer(const Duration(milliseconds: 210), _iosTick);
  }
}
