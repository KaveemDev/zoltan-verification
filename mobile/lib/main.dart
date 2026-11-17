import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'api.dart';
import 'config.dart';
import 'kiosk/welcome.dart';
import 'ui.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Config.load();
  await loadKioskConfig();
  await DeviceApi.load();
  // Customers must never see Flutter's red error page; staff still get the details in debug builds
  // and in the `flutter run` log.
  ErrorWidget.builder = (d) => Material(
    color: Colors.white,
    child: Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          'Something went wrong on this screen. Please ask our staff for help.'
          '${kDebugMode ? '\n\n${d.exceptionAsString()}' : ''}',
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 18, color: Color(0xFF0F172A), decoration: TextDecoration.none),
        ),
      ),
    ),
  );
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
