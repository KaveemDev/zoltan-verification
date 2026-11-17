import 'package:flutter/material.dart';

import 'api.dart';
import 'kiosk/welcome.dart';
import 'ui.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Config.load();
  runApp(const KioskApp());
}

class KioskApp extends StatelessWidget {
  const KioskApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Zoltan Global',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(),
        home: const WelcomeScreen(),
      );
}
