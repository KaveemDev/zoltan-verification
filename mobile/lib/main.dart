import 'package:flutter/material.dart';

import 'api.dart';
import 'config.dart';
import 'kiosk/welcome.dart';
import 'ui.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Config.load();
  await loadKioskConfig();
  runApp(const KioskApp());
}

class KioskApp extends StatelessWidget {
  const KioskApp({super.key});
  @override
  Widget build(BuildContext context) => ValueListenableBuilder(
        valueListenable: kiosk,
        builder: (_, _, _) => MaterialApp(
          title: 'Zoltan Sign',
          debugShowCheckedModeBanner: false,
          theme: buildTheme(),
          home: const WelcomeScreen(),
        ),
      );
}
