import 'package:flutter/material.dart';

import '../admin/admin_login.dart';
import '../ui.dart';
import 'flow.dart';

class WelcomeScreen extends StatefulWidget {
  const WelcomeScreen({super.key});
  @override
  State<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends State<WelcomeScreen> {
  final _c = TextEditingController();
  String? _err;

  /// Accepts the full signing link or just the code at its end.
  String _token(String v) => v.trim().split(RegExp(r'[/?#]')).where((s) => s.isNotEmpty).lastOrNull ?? '';

  void _start() {
    final t = _token(_c.text);
    if (t.length < 8) return setState(() => _err = 'Please enter the full code or link from your message.');
    _c.clear();
    setState(() => _err = null);
    Navigator.push(context, MaterialPageRoute(builder: (_) => FlowScreen(token: t)));
  }

  @override
  Widget build(BuildContext context) => Shell(
        actions: [
          IconButton(
            tooltip: 'Staff sign in',
            icon: const Icon(Icons.lock_outline),
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AdminLoginScreen())),
          ),
        ],
        child: Center(
          child: Panel(children: [
            const Icon(Icons.verified_user_outlined, size: 64, color: teal),
            gap(),
            const H1('Welcome to Zoltan Global'),
            gap(8),
            const Body('Sign your agreement securely on this tablet. It takes about 3 minutes.'),
            gap(24),
            TextField(
              controller: _c,
              autocorrect: false,
              enableSuggestions: false,
              onSubmitted: (_) => _start(),
              decoration: InputDecoration(
                labelText: 'Your agreement link or code',
                helperText: 'Find it in the email or message we sent you.',
                errorText: _err,
              ),
            ),
            gap(20),
            FilledButton(onPressed: _start, child: const Text('Get started')),
          ]),
        ),
      );
}
