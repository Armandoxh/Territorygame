/// Silent stand-in for non-web targets (and the VM test runner): the
/// same surface as the WebAudio implementation, doing nothing.
class CityAudio {
  CityAudio._();

  static bool get isMuted => false;
  static void toggleMute() {}
  static void ensureStarted() {}
  static void boarding(int lineIndex, double strength) {}
  static void commendation() {}
  static void unlock() {}
  static void rush() {}
}
