import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:zoltan_kiosk/pdf.dart';

void main() {
  test('default agreement template becomes a real multi-page PDF', () async {
    final html = File('../server/templates/default-agreement.html')
        .readAsStringSync()
        .replaceAll(RegExp(r'\{\{\s*\w+\s*\}\}'), 'Asha Rao');
    final pdf = await buildAgreementPdf(html, 'Agreement test');
    expect(String.fromCharCodes(pdf.sublist(0, 5)), '%PDF-');
    expect(RegExp('/Type */Page[^s]').allMatches(String.fromCharCodes(pdf)).length, greaterThan(1));
  });
}
