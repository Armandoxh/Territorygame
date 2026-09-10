import 'package:flutter/material.dart';

const Color kGain = Color(0xFF4CAF50);
const Color kLoss = Color(0xFFE57373);

/// Green for non-negative, red for negative — the universal money convention.
Color gainColor(double v) => v >= 0 ? kGain : kLoss;
