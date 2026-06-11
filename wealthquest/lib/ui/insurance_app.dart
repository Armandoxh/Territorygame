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
            'Insurance is a bet against yourself. Premiums are a small, certain '
            'drain; going without saves that cash — until a medical, auto, or '
            'home disaster hits at full price and you can\'t cover it. '
            'Covered today: ${money(total)}/mo.',
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
    final pctChance = (policy.incidentChance * 100).toStringAsFixed(1);
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
                    covered
                        ? '✓ Covered — incidents are handled.'
                        : 'Uninsured: ~$pctChance%/mo of a '
                            '${money(policy.incidentMin)}–'
                            '${money(policy.incidentMax)} bill, all on you.',
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
