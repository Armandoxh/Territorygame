import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../util/format.dart';

/// A bottom sheet that collects a dollar amount. Returns the entered amount,
/// or null if dismissed. [max] enables a "Max" shortcut and caps input.
Future<double?> showAmountSheet(
  BuildContext context, {
  required String title,
  required String actionLabel,
  required double max,
  String? helper,
  List<double> quickAmounts = const [50, 100, 500],
}) {
  return showModalBottomSheet<double>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (context) => _AmountSheet(
      title: title,
      actionLabel: actionLabel,
      max: max,
      helper: helper,
      quickAmounts: quickAmounts,
    ),
  );
}

class _AmountSheet extends StatefulWidget {
  const _AmountSheet({
    required this.title,
    required this.actionLabel,
    required this.max,
    required this.helper,
    required this.quickAmounts,
  });

  final String title;
  final String actionLabel;
  final double max;
  final String? helper;
  final List<double> quickAmounts;

  @override
  State<_AmountSheet> createState() => _AmountSheetState();
}

class _AmountSheetState extends State<_AmountSheet> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _set(double v) {
    final capped = v.clamp(0, widget.max);
    _controller.text = capped.toStringAsFixed(capped >= 100 ? 0 : 2);
    setState(() {});
  }

  double get _amount => double.tryParse(_controller.text) ?? 0;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final valid = _amount > 0 && _amount <= widget.max + 0.001;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        4,
        20,
        MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(widget.title, style: theme.textTheme.titleLarge),
          if (widget.helper != null) ...[
            const SizedBox(height: 4),
            Text(
              widget.helper!,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
          const SizedBox(height: 16),
          TextField(
            controller: _controller,
            autofocus: true,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
            ],
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              prefixText: '\$ ',
              border: const OutlineInputBorder(),
              helperText: 'Available: ${money(widget.max)}',
            ),
            style: theme.textTheme.headlineSmall,
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            children: [
              for (final q in widget.quickAmounts)
                ActionChip(
                  label: Text('\$${q.toStringAsFixed(0)}'),
                  onPressed: q <= widget.max ? () => _set(q) : null,
                ),
              ActionChip(
                label: const Text('Max'),
                onPressed: () => _set(widget.max),
              ),
            ],
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: valid ? () => Navigator.pop(context, _amount) : null,
            child: Text(widget.actionLabel),
          ),
        ],
      ),
    );
  }
}
