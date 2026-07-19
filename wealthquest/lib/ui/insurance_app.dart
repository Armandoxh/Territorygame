import 'package:flutter/material.dart';

import '../data/insurance.dart';
import '../state/game_controller.dart';
import '../util/format.dart';
import 'widgets/ui_helpers.dart';

/// "Shield" — insurance. A bet against yourself: pay steady premiums and a bad
/// month is a shrug; skip them and a single emergency can spiral into a margin
/// call or bankruptcy.
class InsuranceBody extends StatelessWidget {
  const InsuranceBody({super.key, required this.game});

  final GameController game;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final total = game.monthlyInsurancePremium;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
      children: [
        Container(
          padding: const EdgeInsets.all(14),
          margin: const EdgeInsets.only(bottom: 12),
          decoration: BoxDecoration(
            color: theme.colorScheme.primary.withOpacity(0.10),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            'Each shield covers one kind of life event. When a covered event '
            'hits, the shield pays 80% of the cost above its deductible — you '
            'just eat the deductible and a sliver. Skip it and that event lands '
            'at full price, which can spiral into a margin call. '
            'Carrying ${money(total)}/mo of cover.',
            style: theme.textTheme.bodySmall,
          ),
        ),
        for (final p in Insurance.all) _PolicyCard(game: game, policy: p),
      ],
    );
  }
}

class _PolicyCard extends StatelessWidget {
  const _PolicyCard({required this.game, required this.policy});

  final GameController game;
  final InsurancePolicy policy;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final covered = game.insurancePolicies.contains(policy.id);
    final isIncome = policy.id == 'income';
    // How this shield pays out, in one line.
    final coveredLine = isIncome
        ? '✓ Covered — replaces 60% of your wage while a life event keeps you '
            'off the payroll.'
        : '✓ Covered — pays 80% above a ${money(policy.deductible)} deductible.';
    final uninsuredLine = isIncome
        ? 'Uninsured: lose a life event\'s worth of wages with no backstop.'
        : 'Uninsured: a ${policy.shortName.toLowerCase()} event hits at full '
            'price, all on you.';
    return Card(
      color: covered ? kGain.withOpacity(0.08) : null,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 8, 8, 8),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text('${policy.emoji}  ${policy.name}',
                          style: theme.textTheme.titleSmall),
                      const SizedBox(width: 8),
                      Text('${money(policy.premium)}/mo',
                          style: theme.textTheme.titleSmall?.copyWith(
                              fontWeight: FontWeight.bold,
                              color: theme.colorScheme.primary)),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(policy.blurb, style: theme.textTheme.bodySmall),
                  const SizedBox(height: 6),
                  Text(
                    covered ? coveredLine : uninsuredLine,
                    style: theme.textTheme.labelSmall?.copyWith(
                        color: covered ? kGain : kLoss,
                        fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ),
            Switch(
              value: covered,
              onChanged: (_) => game.toggleInsurance(policy.id),
            ),
          ],
        ),
      ),
    );
  }
}
