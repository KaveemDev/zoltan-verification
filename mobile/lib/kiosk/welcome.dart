import 'package:flutter/material.dart';

import '../admin/admin_login.dart';
import '../api.dart';
import '../config.dart';
import '../ui.dart';
import 'details.dart';

class WelcomeScreen extends StatefulWidget {
  const WelcomeScreen({super.key});
  @override
  State<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends State<WelcomeScreen> {
  @override
  Widget build(BuildContext context) {
    final c = kiosk.value;
    // Ready = staff have signed in on this tablet and chosen an agreement.
    final ready = StaffApi.i.signedIn && c.hasAgreement;
    return Shell(
      child: Column(children: [
        Expanded(
          child: Center(
            child: Panel(children: [
              H1(ready ? c.welcomeTitle : 'This tablet is not ready yet'),
              gap(12),
              Body(ready ? c.welcomeMessage : 'A staff member needs to sign in and choose the agreement for this tablet.'),
              gap(28),
              if (ready)
                FilledButton(
                  onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const DetailsScreen())),
                  child: Text(c.startLabel),
                ),
            ]),
          ),
        ),
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: TextButton.icon(
            onPressed: () async {
              await Navigator.push(context, MaterialPageRoute(builder: (_) => const AdminLoginScreen()));
              if (mounted) setState(() {});
            },
            icon: const Icon(Icons.lock_outline, size: 18),
            label: const Text('Staff sign in'),
          ),
        ),
      ]),
    );
  }
}
