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
    // Ready = an admin saved the setup on this device (stays ready after they sign out or close the app).
    final ready = DeviceApi.ready && c.hasAgreement;
    return Shell(
      child: Column(
        children: [
          Expanded(
            child: Center(
              child: Panel(
                children: [
                  H1(ready ? c.welcomeTitle : 'This device is not ready yet'),
                  gap(12),
                  Body(
                    ready
                        ? c.welcomeMessage
                        : 'An admin needs to sign in, choose the agreement and save the device setup.',
                  ),
                  gap(28),
                  if (ready)
                    FilledButton(
                      onPressed: () =>
                          Navigator.push(context, MaterialPageRoute(builder: (_) => const DetailsScreen())),
                      child: Text(c.startLabel),
                    ),
                ],
              ),
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
          // Bump with pubspec `version:` so staff can tell which build a device runs.
          const Padding(
            padding: EdgeInsets.only(bottom: 8),
            child: Text('Version 1.0.1', style: TextStyle(fontSize: 12, color: Colors.black38)),
          ),
        ],
      ),
    );
  }
}
