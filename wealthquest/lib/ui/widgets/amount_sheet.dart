import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../util/format.dart';

/// A bottom sheet that collects a dollar amount. Returns the entered amount,
/// or null if dismissed. [max] is the available amount; the quick chips fill in
/// a percentage of it (10/25/50%) or Max.
Future<double?> showAmountSheet(
  BuildContext context, {
  required String title,
  required String actionLabel,
  required double max,
  String? helper,
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
    ),
  );
}

class _AmountSheet extends StatefulWidget {
  const _AmountSheet({
    required this.title,
    required this.actionLabel,
    required this.max,
    required this.helper,
  });

  final String title;
  final String actionLabel;
  final double max;
  final String? helper;

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
    // Floor to whole cents so "Max" never rounds UP past what you can afford.
    final capped = v.clamp(0, widget.max).toDouble();
    final floored = (capped * 100).floorToDouble() / 100;
    _controller.text = floored.toStringAsFixed(2);
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
              for (final p in const [0.10, 0.25, 0.50])
                ActionChip(
                  label: Text('${(p * 100).toStringAsFixed(0)}%'),
                  onPressed: () => _set(widget.max * p),
                ),
              ActionChip(
                label: const Text('MAX'),
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
