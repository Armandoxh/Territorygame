import 'dart:html' as html;
import 'dart:js_util' as js_util;
import 'dart:math' as math;

/// The generative city soundtrack (web). Every line owns a pitch on an
/// A-minor pentatonic scale — any mix of lines harmonizes — and the
/// deterministic sim provides the score: boardings pluck the line's
/// note (louder when the scoop was fuller), commendations arpeggiate,
/// line unlocks play a rising fifth. Pure oscillators, zero assets.
///
/// Browsers only allow audio after a user gesture, so [ensureStarted]
/// is called from the first tap. The mute choice persists per device in
/// localStorage (it's a viewer preference, not game state).
class CityAudio {
  CityAudio._();

  static Object? _ctx;
  static bool _muted = _loadMuted();
  static double _lastNoteMs = 0;

  static bool _loadMuted() {
    try {
      return html.window.localStorage['metro_muted'] == '1';
    } catch (_) {
      return false;
    }
  }

  static bool get isMuted => _muted;

  static void toggleMute() {
    _muted = !_muted;
    try {
      html.window.localStorage['metro_muted'] = _muted ? '1' : '0';
    } catch (_) {}
  }

  /// Create/resume the AudioContext — must be reached from a tap.
  static void ensureStarted() {
    try {
      _ctx ??= js_util.callConstructor(
          (js_util.getProperty(html.window, 'AudioContext') ??
              js_util.getProperty(html.window, 'webkitAudioContext')) as Object,
          []);
      if (js_util.getProperty(_ctx!, 'state') == 'suspended') {
        js_util.callMethod(_ctx!, 'resume', []);
      }
    } catch (_) {}
  }

  static double get _now =>
      (js_util.getProperty(_ctx!, 'currentTime') as num).toDouble();

  /// Line index → frequency: A3 pentatonic across three octaves, so all
  /// 24 lines land on consonant pitches.
  static double _freq(int lineIndex) {
    const steps = [0, 3, 5, 7, 10];
    final i = lineIndex < 0 ? 0 : lineIndex;
    final semis = steps[i % 5] + 12 * ((i ~/ 5) % 3);
    return 220.0 * math.pow(2.0, semis / 12.0).toDouble();
  }

  static void _pluck(double freq, double gain, double delay, double decay) {
    final ctx = _ctx;
    if (ctx == null) return;
    try {
      final t = _now + delay;
      final osc = js_util.callMethod(ctx, 'createOscillator', []) as Object;
      final amp = js_util.callMethod(ctx, 'createGain', []) as Object;
      js_util.setProperty(osc, 'type', 'triangle');
      js_util.setProperty(
          js_util.getProperty(osc, 'frequency') as Object, 'value', freq);
      final g = js_util.getProperty(amp, 'gain') as Object;
      js_util.callMethod(g, 'setValueAtTime', [gain, t]);
      js_util.callMethod(
          g, 'exponentialRampToValueAtTime', [0.0001, t + decay]);
      js_util.callMethod(osc, 'connect', [amp]);
      js_util.callMethod(
          amp, 'connect', [js_util.getProperty(ctx, 'destination') as Object]);
      js_util.callMethod(osc, 'start', [t]);
      js_util.callMethod(osc, 'stop', [t + decay + 0.05]);
    } catch (_) {}
  }

  /// One boarding: the line's note. [strength] is scoop fullness 0–1.
  static void boarding(int lineIndex, double strength) {
    if (_muted || _ctx == null) return;
    final nowMs = html.window.performance.now().toDouble();
    if (nowMs - _lastNoteMs < 80) return; // musical, never noisy
    _lastNoteMs = nowMs;
    _pluck(_freq(lineIndex), 0.03 + 0.09 * strength.clamp(0.0, 1.0), 0, 0.35);
  }

  /// A commendation: a little rising pentatonic arpeggio.
  static void commendation() {
    if (_muted || _ctx == null) return;
    _pluck(440.0, 0.10, 0, 0.5);
    _pluck(523.25, 0.10, 0.13, 0.5);
    _pluck(659.25, 0.12, 0.26, 0.8);
  }

  /// A new line opens: root + fifth, held a touch longer.
  static void unlock() {
    if (_muted || _ctx == null) return;
    _pluck(330.0, 0.10, 0, 0.7);
    _pluck(494.0, 0.10, 0.18, 0.9);
  }

  /// Rush hour begins: an urgent low double-strike.
  static void rush() {
    if (_muted || _ctx == null) return;
    _pluck(196.0, 0.12, 0, 0.25);
    _pluck(196.0, 0.12, 0.16, 0.4);
  }
}
