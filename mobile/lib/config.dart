import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Everything an admin can change for this tablet. Stored on the device, so each tablet keeps
/// its own setup. The server still enforces the signing steps (code, read, video, sign).
class KioskConfig {
  KioskConfig({
    this.templateId = '',
    this.templateName = '',
    this.welcomeTitle = 'Welcome to Zoltan Visa',
    this.welcomeMessage = 'Fill in your details, then read and sign your agreement securely on this tablet. It takes about 5 minutes.',
    this.startLabel = 'Get started',
    this.primary = 0xFFD6194A,
    this.phonePrefix = '+91',
    this.askDestination = true,
    this.defaultDestination = '',
    this.packages = const ['VISA', 'TRAVEL', 'BOTH'],
    this.defaultPackage = 'VISA',
    this.prices = const {'VISA': 0, 'TRAVEL': 0, 'BOTH': 0},
    this.currency = 'INR',
    this.askNotes = false,
    this.doneSeconds = 30,
    this.videoScript = 'I, {name}, agree to proceed with my {package} application with Zoltan Visa.',
  });

  String templateId, templateName, welcomeTitle, welcomeMessage, startLabel;
  String phonePrefix, defaultDestination, defaultPackage, currency, videoScript;
  int primary, doneSeconds;
  bool askDestination, askNotes;
  List<String> packages;
  Map<String, double> prices;

  bool get hasAgreement => templateId.isNotEmpty;

  Map<String, dynamic> toJson() => {
        'templateId': templateId,
        'templateName': templateName,
        'welcomeTitle': welcomeTitle,
        'welcomeMessage': welcomeMessage,
        'startLabel': startLabel,
        'primary': primary,
        'phonePrefix': phonePrefix,
        'askDestination': askDestination,
        'defaultDestination': defaultDestination,
        'packages': packages,
        'defaultPackage': defaultPackage,
        'prices': prices,
        'currency': currency,
        'askNotes': askNotes,
        'doneSeconds': doneSeconds,
        'videoScript': videoScript,
      };

  factory KioskConfig.fromJson(Map<String, dynamic> j) {
    final d = KioskConfig();
    return KioskConfig(
      templateId: j['templateId'] ?? d.templateId,
      templateName: j['templateName'] ?? d.templateName,
      welcomeTitle: j['welcomeTitle'] ?? d.welcomeTitle,
      welcomeMessage: j['welcomeMessage'] ?? d.welcomeMessage,
      startLabel: j['startLabel'] ?? d.startLabel,
      primary: j['primary'] ?? d.primary,
      phonePrefix: j['phonePrefix'] ?? d.phonePrefix,
      askDestination: j['askDestination'] ?? d.askDestination,
      defaultDestination: j['defaultDestination'] ?? d.defaultDestination,
      packages: List<String>.from(j['packages'] ?? d.packages),
      defaultPackage: j['defaultPackage'] ?? d.defaultPackage,
      prices: {for (final e in ((j['prices'] ?? d.prices) as Map).entries) '${e.key}': (e.value as num).toDouble()},
      currency: j['currency'] ?? d.currency,
      askNotes: j['askNotes'] ?? d.askNotes,
      doneSeconds: j['doneSeconds'] ?? d.doneSeconds,
      videoScript: j['videoScript'] ?? d.videoScript,
    );
  }
}

final kiosk = ValueNotifier(KioskConfig());

Future<void> loadKioskConfig() async {
  try {
    final s = (await SharedPreferences.getInstance()).getString('kiosk');
    if (s != null) kiosk.value = KioskConfig.fromJson(jsonDecode(s));
  } catch (_) {
    // A corrupt saved config falls back to defaults; staff can set it up again.
  }
}

Future<void> saveKioskConfig(KioskConfig c) async {
  await (await SharedPreferences.getInstance()).setString('kiosk', jsonEncode(c.toJson()));
  kiosk.value = c;
}
