import 'package:flutter/material.dart';

import '../data/catalog.dart';
import '../models/education.dart';
import '../models/job.dart';
import '../state/game_controller.dart';
import '../util/format.dart';
import 'widgets/amount_sheet.dart';
import 'widgets/ui_helpers.dart';

/// "Hustl" — careers + education. Better jobs require a degree, which costs
/// years of part-time pay and tuition borrowed as a student loan.
class LifeTab extends StatelessWidget {
  const LifeTab({super.key, required this.game});

  final GameController game;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('You', style: theme.textTheme.titleMedium),
                const SizedBox(height: 8),
                _kv(theme, 'Age', '${game.ageYears}'),
                if (game.currentTrack != null)
                  _kv(theme, 'Career',
                      '${game.currentTrack!.emoji} ${game.currentTrack!.name}'),
                _kv(theme, 'Role', game.job.title),
                _kv(
                    theme,
                    'Monthly pay',
                    game.isStudying
                        ? '${money(game.effectivePay)} (part-time)'
                        : money(game.job.pay)),
                _kv(theme, 'Education', educationLabel(game.eduLevel)),
              ],
            ),
          ),
        ),

        if (game.currentTrack != null) _CareerCard(game: game),
        if (game.isStudying) _StudyingCard(game: game),
        if (game.studentLoan > 0) _LoanCard(game: game),

        const SizedBox(height: 8),
        _RetirementCard(game: game),

        const SizedBox(height: 16),
        Text('Education', style: theme.textTheme.titleMedium),
        const SizedBox(height: 2),
        Text(
          'A degree is a real investment: you go part-time (half pay) for the '
          'whole program and borrow tuition as a student loan that compounds '
          'until you repay it. The payoff is far better jobs.',
          style: theme.textTheme.bodySmall
              ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
        const SizedBox(height: 8),
        ...Catalog.degrees.map((d) => _DegreeTile(game: game, degree: d)),

        const SizedBox(height: 16),
        Text('Career tracks', style: theme.textTheme.titleMedium),
        const SizedBox(height: 2),
        Text(
          'Pick a line and climb it — promotions come automatically the longer '
          'you stay. Each track trades off schooling, ramp time, and ceiling. '
          'Switching restarts you at the bottom of the new ladder.',
          style: theme.textTheme.bodySmall
              ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
        const SizedBox(height: 8),
        ...Catalog.careerTracks.map((t) => _TrackTile(game: game, track: t)),
      ],
    );
  }

  Widget _kv(ThemeData theme, String k, String v) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(k,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              )),
          const SizedBox(width: 12),
          // Let the value take the rest of the row and wrap/right-align instead
          // of overflowing on a narrow phone (long roles, pay strings, etc.).
          Expanded(
            child: Text(v,
                textAlign: TextAlign.right,
                style: theme.textTheme.bodyMedium
                    ?.copyWith(fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }
}

class _StudyingCard extends StatelessWidget {
  const _StudyingCard({required this.game});
  final GameController game;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final d = game.enrolledDegree!;
    final done = d.months - game.enrollMonthsLeft;
    final progress = (done / d.months).clamp(0.0, 1.0);
    return Card(
      color: theme.colorScheme.primary.withOpacity(0.10),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.school, size: 18),
                const SizedBox(width: 8),
                Text('Studying: ${d.name}',
                    style: theme.textTheme.titleSmall),
              ],
            ),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(value: progress, minHeight: 8),
            ),
            const SizedBox(height: 6),
            Text(
              '${game.enrollMonthsLeft} months left · on part-time pay until '
              'you graduate.',
              style: theme.textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}

class _LoanCard extends StatelessWidget {
  const _LoanCard({required this.game});
  final GameController game;

  Future<void> _pay(BuildContext context) async {
    final maxPay =
        game.studentLoan < game.cash ? game.studentLoan : game.cash;
    final amount = await showAmountSheet(
      context,
      title: 'Pay student loan',
      actionLabel: 'Pay',
      max: maxPay,
      helper: 'Balance ${money(game.studentLoan)} · cash ${money(game.cash)}. '
          'It compounds at ${pct(Catalog.studentLoanRate)}/yr until cleared.',
    );
    if (amount == null || !context.mounted) return;
    final payoff = amount >= game.studentLoan - 0.01;
    final err = game.payStudentLoan(amount, max: payoff);
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
          content: Text(err ?? 'Paid ${money(amount)} toward your loan.')));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Student loan', style: theme.textTheme.titleSmall),
                  Text(
                    '${money(game.studentLoan)} · ${pct(Catalog.studentLoanRate)}/yr'
                    '${game.studentLoanPayment > 0 ? ' · ${money(game.studentLoanPayment)}/mo due' : game.isStudying ? ' · deferred in school' : ''}',
                    style: theme.textTheme.bodySmall?.copyWith(color: kLoss),
                  ),
                ],
              ),
            ),
            FilledButton.tonal(
              onPressed: () => _pay(context),
              child: const Text('Pay loan'),
            ),
          ],
        ),
      ),
    );
  }
}

class _DegreeTile extends StatelessWidget {
  const _DegreeTile({required this.game, required this.degree});

  final GameController game;
  final DegreeDef degree;

  Future<void> _enroll(BuildContext context) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text('Enroll in ${degree.name}?'),
        content: Text(
          'Borrow ${money(degree.tuition)} as a student loan and go part-time '
          '(half pay) for ${degree.years} years. The loan compounds at '
          '${pct(Catalog.studentLoanRate)}/yr until you repay it.',
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Enroll')),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    final err = game.enroll(degree);
    if (err != null) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(err)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final earned = game.completedDegrees.contains(degree.id) ||
        (!degree.professional && game.eduLevel >= degree.level);
    final enrolledHere = game.enrolledDegreeId == degree.id;

    Widget trailing;
    if (earned) {
      trailing = Chip(
        avatar: const Icon(Icons.check, size: 16),
        label: const Text('Earned'),
        backgroundColor: kGain.withOpacity(0.20),
      );
    } else if (enrolledHere) {
      trailing = const Chip(label: Text('In progress'));
    } else if (game.isStudying) {
      trailing = Text('Finish current\nprogram first',
          textAlign: TextAlign.end, style: theme.textTheme.labelSmall);
    } else {
      trailing = FilledButton.tonal(
        onPressed: () => _enroll(context),
        child: const Text('Enroll'),
      );
    }

    return Card(
      child: Opacity(
        opacity: (earned || enrolledHere || !game.isStudying) ? 1 : 0.6,
        child: ListTile(
          leading: const Icon(Icons.school_outlined),
          title: Text(degree.name),
          subtitle: Text(
            '${degree.years} yr · borrow ${money(degree.tuition)}\n${degree.blurb}',
            style: theme.textTheme.bodySmall,
          ),
          isThreeLine: true,
          trailing: trailing,
        ),
      ),
    );
  }
}

/// Your current track + live progress toward the next promotion.
class _CareerCard extends StatelessWidget {
  const _CareerCard({required this.game});
  final GameController game;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final t = game.currentTrack;
    if (t == null) return const SizedBox.shrink();
    final atTop = game.rungIndex >= t.rungs.length - 1;
    return Card(
      color: theme.colorScheme.primary.withOpacity(0.08),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(t.emoji, style: const TextStyle(fontSize: 20)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(t.name,
                      style: theme.textTheme.titleSmall
                          ?.copyWith(fontWeight: FontWeight.bold)),
                ),
                Text('${money(game.job.pay)}/mo',
                    style: theme.textTheme.titleSmall
                        ?.copyWith(color: kGain, fontWeight: FontWeight.bold)),
              ],
            ),
            const SizedBox(height: 2),
            Text(game.job.title, style: theme.textTheme.bodyMedium),
            const SizedBox(height: 10),
            if (atTop)
              Text('🏆 Top of the ladder — you\'ve hit the ceiling.',
                  style: theme.textTheme.bodySmall?.copyWith(color: kGain))
            else
              Builder(builder: (_) {
                final need = t.rungMonths[game.rungIndex];
                final left = (need - game.monthsInRung).clamp(0, need);
                final progress =
                    need == 0 ? 1.0 : (game.monthsInRung / need).clamp(0.0, 1.0);
                final next = t.rungs[game.rungIndex + 1];
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child:
                          LinearProgressIndicator(value: progress, minHeight: 8),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      game.isStudying
                          ? 'Career paused while you study.'
                          : '$left mo to ${next.title} (${money(next.pay)}/mo).',
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                );
              }),
            const SizedBox(height: 6),
            Text('Ceiling: ${t.top.title} · ${money(t.top.pay)}/mo',
                style: theme.textTheme.labelSmall
                    ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
          ],
        ),
      ),
    );
  }
}

/// One career track you can start or switch into.
class _TrackTile extends StatelessWidget {
  const _TrackTile({required this.game, required this.track});

  final GameController game;
  final CareerTrack track;

  String get _reqText {
    final id = track.requiredDegreeId;
    if (id != null) {
      final d = Catalog.degrees.firstWhere((x) => x.id == id);
      return 'requires ${d.name}';
    }
    if (track.minEduLevel > 0) {
      return 'requires ${educationLabel(track.minEduLevel)}';
    }
    return 'no degree needed';
  }

  Future<void> _join(BuildContext context) async {
    final isSwitch =
        game.currentTrackId != null && game.currentTrackId != track.id;
    if (isSwitch) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (_) => AlertDialog(
          title: Text('Switch to ${track.name}?'),
          content: Text(
            'You\'ll start over at the bottom — ${track.entry.title}, '
            '${money(track.entry.pay)}/mo — and lose your current rank. You '
            'climb back up from there.',
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Cancel')),
            FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Switch')),
          ],
        ),
      );
      if (ok != true || !context.mounted) return;
    }
    final err = game.joinTrack(track);
    if (err != null) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(err)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isCurrent = game.currentTrackId == track.id;
    final prestigeLocked = track.unlockLevel > game.prestige;
    final qualifies = game.qualifiesForTrack(track);
    final years = (track.monthsToTop / 12).round();

    Widget trailing;
    if (isCurrent) {
      trailing = Chip(
        label: const Text('Current'),
        backgroundColor: theme.colorScheme.primary.withOpacity(0.25),
      );
    } else if (prestigeLocked) {
      trailing = Text('Prestige ${track.unlockLevel}',
          textAlign: TextAlign.end,
          style: theme.textTheme.labelSmall?.copyWith(color: kLoss));
    } else if (qualifies) {
      trailing = FilledButton.tonal(
        onPressed: () => _join(context),
        child: Text(game.currentTrackId == null ? 'Start' : 'Switch'),
      );
    } else {
      trailing = Text(_reqText,
          textAlign: TextAlign.end,
          style: theme.textTheme.labelSmall?.copyWith(color: kLoss));
    }

    return Card(
      child: Opacity(
        opacity: (isCurrent || qualifies) && !prestigeLocked ? 1 : 0.6,
        child: ListTile(
          isThreeLine: true,
          leading: Text(track.emoji, style: const TextStyle(fontSize: 22)),
          title: Text(track.name),
          subtitle: Text(
            '${money(track.entry.pay)} → ${money(track.top.pay)}/mo · ~$years yr '
            'to top · $_reqText\n${track.blurb}',
            style: theme.textTheme.bodySmall,
          ),
          trailing: trailing,
        ),
      ),
    );
  }
}

/// 401(k): contribution chips, the employer match, and an early-withdrawal
/// escape hatch. Lives in the job app since it comes straight off your paycheck.
class _RetirementCard extends StatelessWidget {
  const _RetirementCard({required this.game});
  final GameController game;

  static const _pcts = [0.0, 0.03, 0.05, 0.10, 0.15, 0.20];

  Future<void> _withdraw(BuildContext context) async {
    final early = game.ageYears < GameController.retirementAge;
    final penaltyPct =
        (GameController.earlyWithdrawalPenalty * 100).toStringAsFixed(0);
    final amount = await showAmountSheet(
      context,
      title: 'Withdraw from 401(k)',
      actionLabel: 'Withdraw',
      max: game.retirementBalance,
      helper: early
          ? 'Balance ${money(game.retirementBalance)}. You\'re ${game.ageYears} — '
              'an early withdrawal forfeits $penaltyPct%, so \$100 out puts only '
              '\$${(100 * (1 - GameController.earlyWithdrawalPenalty)).toStringAsFixed(0)} in your cash.'
          : 'Balance ${money(game.retirementBalance)}. Penalty-free at your age.',
    );
    if (amount == null || !context.mounted) return;
    final err = game.withdrawRetirement(amount,
        max: amount >= game.retirementBalance - 0.01);
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
          content: Text(err ?? 'Withdrew ${money(amount)} from retirement.')));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final pct = game.retirementContribPct;
    final yourMo = game.effectivePay * pct;
    final matchMo = game.effectivePay *
        (pct < GameController.employerMatchPct
            ? pct
            : GameController.employerMatchPct);
    final locked = game.ageYears < GameController.retirementAge;
    final matchPct =
        (GameController.employerMatchPct * 100).toStringAsFixed(0);
    final penaltyPct =
        (GameController.earlyWithdrawalPenalty * 100).toStringAsFixed(0);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.savings_outlined, size: 18),
                const SizedBox(width: 8),
                Expanded(
                    child: Text('Retirement 401(k)',
                        style: theme.textTheme.titleMedium)),
                Text(moneyWhole(game.retirementBalance),
                    style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: theme.colorScheme.primary)),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              'Employer matches you 100% up to $matchPct% of pay — free money, '
              'and contributions are pre-tax so they trim your income tax too. '
              '${locked ? 'Locked until age ${GameController.retirementAge}; pulling early costs $penaltyPct%.' : 'Penalty-free at your age.'}',
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
            const SizedBox(height: 10),
            Text('Contribute from each paycheck',
                style: theme.textTheme.labelMedium),
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              children: [
                for (final p in _pcts)
                  ChoiceChip(
                    label: Text('${(p * 100).toStringAsFixed(0)}%'),
                    selected: (pct - p).abs() < 1e-6,
                    onSelected: (_) => game.setRetirementContribPct(p),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              pct > 0
                  ? 'You ${money(yourMo)}/mo + employer ${money(matchMo)}/mo → ${money(yourMo + matchMo)}/mo invested.'
                  : 'Not contributing — you\'re leaving the employer match on the table.',
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: pct > 0 ? kGain : kLoss),
            ),
            if (game.retirementBalance > 0) ...[
              const SizedBox(height: 10),
              Align(
                alignment: Alignment.centerRight,
                child: OutlinedButton(
                  onPressed: () => _withdraw(context),
                  child: Text(locked ? 'Withdraw (−$penaltyPct%)' : 'Withdraw'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
