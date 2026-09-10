import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'game_controller.dart';

/// Persists the current life to local storage (localStorage on web, native
/// prefs on mobile) so closing the tab or app never wipes a run. One slot —
/// the game is single-save, like its phone metaphor.
class SaveService {
  SaveService._();

  static const String _key = 'wealthquest_save_v1';

  /// Write the current game state. Cheap enough to call on every change
  /// (callers debounce). Swallows storage errors rather than crashing play.
  static Future<void> save(GameController game) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_key, jsonEncode(game.toJson()));
    } catch (_) {
      // Storage unavailable (e.g. private-mode quota) — fail quiet; the live
      // game is unaffected, we just couldn't persist this tick.
    }
  }

  /// Load a saved game, or null if there's none (or it's unreadable). A
  /// corrupt/old save is treated as "no save" so a bad blob can't brick boot.
  static Future<GameController?> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_key);
      if (raw == null || raw.isEmpty) return null;
      final map = jsonDecode(raw) as Map<String, dynamic>;
      return GameController.fromJson(map);
    } catch (_) {
      return null;
    }
  }

  /// Whether a save exists (without fully deserializing it).
  static Future<bool> hasSave() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_key);
      return raw != null && raw.isNotEmpty;
    } catch (_) {
      return false;
    }
  }

  /// Wipe the save (used when the player deliberately starts over).
  static Future<void> clear() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_key);
    } catch (_) {}
  }
}
