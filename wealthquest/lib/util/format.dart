import 'package:intl/intl.dart';

final NumberFormat _money = NumberFormat.simpleCurrency(decimalDigits: 2);
final NumberFormat _moneyWhole = NumberFormat.simpleCurrency(decimalDigits: 0);
final NumberFormat _compact = NumberFormat.compactSimpleCurrency();

/// "$1,234.56"
String money(double v) => _money.format(v);

/// "$1,235" — no cents, for big headline numbers.
String moneyWhole(double v) => _moneyWhole.format(v);

/// "$1.2M" — compact, for axis labels and tight chips.
String moneyCompact(double v) => _compact.format(v);

/// Price formatting that keeps precision for sub-dollar assets (e.g. DOGZ).
String price(double v) {
  if (v >= 1000) return _moneyWhole.format(v);
  if (v >= 1) return _money.format(v);
  return '\$${v.toStringAsFixed(4)}';
}

/// "+3.2%" / "-1.0%"
String signedPct(double v) {
  final sign = v >= 0 ? '+' : '';
  return '$sign${(v * 100).toStringAsFixed(1)}%';
}

/// "4.0%"
String pct(double v) => '${(v * 100).toStringAsFixed(1)}%';
