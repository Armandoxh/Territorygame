/// The market-wide mood. Drives a weekly drift on every price-based asset
/// (scaled by how volatile the asset is) and, on a crash, a hit to uninsured
/// cash.
enum MarketRegime { boom, normal, downturn, crash, recovery }

extension MarketRegimeX on MarketRegime {
  String get label {
    switch (this) {
      case MarketRegime.boom:
        return 'Bull market';
      case MarketRegime.normal:
        return 'Calm';
      case MarketRegime.downturn:
        return 'Bear market';
      case MarketRegime.crash:
        return 'Market crash';
      case MarketRegime.recovery:
        return 'Recovery';
    }
  }

  String get emoji {
    switch (this) {
      case MarketRegime.boom:
        return '📈';
      case MarketRegime.normal:
        return '🟢';
      case MarketRegime.downturn:
        return '📉';
      case MarketRegime.crash:
        return '💥';
      case MarketRegime.recovery:
        return '🌱';
    }
  }

  String get blurb {
    switch (this) {
      case MarketRegime.boom:
        return 'Risk assets are climbing.';
      case MarketRegime.normal:
        return 'Markets are steady.';
      case MarketRegime.downturn:
        return 'Stocks are sliding.';
      case MarketRegime.crash:
        return 'Severe sell-off — uninsured cash takes a hit.';
      case MarketRegime.recovery:
        return 'Markets are bouncing back.';
    }
  }

  /// Extra weekly return applied to a beta-1 asset under this regime.
  double get weeklyDrift {
    switch (this) {
      case MarketRegime.boom:
        return 0.006;
      case MarketRegime.normal:
        return 0.0;
      case MarketRegime.downturn:
        return -0.005;
      case MarketRegime.crash:
        return -0.09;
      case MarketRegime.recovery:
        return 0.007;
    }
  }

  bool get isCrash => this == MarketRegime.crash;
}

/// A temporary boom or bust concentrated in one industry sector.
class SectorEvent {
  final String sector;
  final int dir; // +1 rally, -1 slump
  final double magnitude; // extra weekly return for assets in this sector
  final String headline;
  int weeksLeft;

  SectorEvent({
    required this.sector,
    required this.dir,
    required this.magnitude,
    required this.headline,
    required this.weeksLeft,
  });

  bool get isRally => dir > 0;
}
