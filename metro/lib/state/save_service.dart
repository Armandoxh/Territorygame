import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'game_state.dart';

/// Local persistence (localStorage on web, native prefs on mobile). Same
/// battle-tested pattern as the other games: fail quiet on storage errors,
/// treat a corrupt blob as "no save" so a bad write can never brick boot.
class SaveService {
  SaveService._();

  static const String _key = 'metro_magnate_save_v1';

  static Future<void> save(GameState game) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
          _key, jsonEncode(game.toJson(DateTime.now().millisecondsSinceEpoch)));
    } catch (_) {
      // Storage unavailable — the live game is unaffected.
    }
  }

  static Future<GameState?> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_key);
      if (raw == null || raw.isEmpty) return null;
      return GameState.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  static Future<void> clear() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_key);
    } catch (_) {}
  }
}
