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
                _kv(theme, 'Current job', game.job.title),
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

        if (game.isStudying) _StudyingCard(game: game),
        if (game.studentLoan > 0) _LoanCard(game: game),

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
        Text('Careers', style: theme.textTheme.titleMedium),
        const SizedBox(height: 2),
        Text(
          'Entry jobs are open to anyone; the rest need the right degree.',
          style: theme.textTheme.bodySmall
              ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
        ),
        const SizedBox(height: 8),
        ...Catalog.jobs.map((j) => _JobTile(game: game, job: j)),
      ],
    );
  }

  Widget _kv(ThemeData theme, String k, String v) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(k,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              )),
          Text(v,
              style: theme.textTheme.bodyMedium
                  ?.copyWith(fontWeight: FontWeight.w600)),
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
                    '${money(game.studentLoan)} · ${pct(Catalog.studentLoanRate)}/yr',
                    style:
                        theme.textTheme.bodySmall?.copyWith(color: kLoss),
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
    final earned = game.eduLevel >= degree.level;
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

class _JobTile extends StatelessWidget {
  const _JobTile({required this.game, required this.job});

  final GameController game;
  final JobDef job;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isCurrent = job.id == game.job.id;
    final qualified = game.meetsEducation(job);

    Widget trailing;
    if (isCurrent) {
      trailing = Chip(
        label: const Text('Current'),
        backgroundColor: theme.colorScheme.primary.withOpacity(0.25),
      );
    } else if (qualified) {
      trailing = FilledButton.tonal(
        onPressed: () => game.takeJob(job),
        child: const Text('Take'),
      );
    } else {
      trailing = Text('Needs\n${educationLabel(job.requiredEdu)}',
          textAlign: TextAlign.end,
          style: theme.textTheme.labelSmall?.copyWith(color: kLoss));
    }

    return Card(
      child: Opacity(
        opacity: qualified ? 1 : 0.55,
        child: ListTile(
          leading: Icon(qualified ? Icons.work_outline : Icons.lock_outline),
          title: Text(job.title),
          subtitle: Text(job.requiredEdu == 0
              ? '${money(job.pay)} / month · no degree needed'
              : '${money(job.pay)} / month · needs ${educationLabel(job.requiredEdu)}'),
          trailing: trailing,
        ),
      ),
    );
  }
}
