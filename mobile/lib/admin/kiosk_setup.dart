import 'package:flutter/material.dart';

import '../api.dart';
import '../config.dart';
import '../kiosk/details.dart' show packageTitle;
import '../ui.dart';

const _swatches = [0xFFD6194A, 0xFFFF3366, 0xFFB8123D, 0xFF0B2545, 0xFF0F766E, 0xFF4338CA, 0xFF334155];

/// Admin-only: everything that decides what the customer sees on this tablet.
class KioskSetup extends StatefulWidget {
  const KioskSetup({super.key, required this.isAdmin});
  final bool isAdmin;
  @override
  State<KioskSetup> createState() => _KioskSetupState();
}

class _KioskSetupState extends State<KioskSetup> {
  late final c = KioskConfig.fromJson(kiosk.value.toJson()); // editable copy
  late final _title = TextEditingController(text: c.welcomeTitle);
  late final _msg = TextEditingController(text: c.welcomeMessage);
  late final _start = TextEditingController(text: c.startLabel);
  late final _prefix = TextEditingController(text: c.phonePrefix);
  late final _dest = TextEditingController(text: c.defaultDestination);
  late final _cur = TextEditingController(text: c.currency);
  late final _script = TextEditingController(text: c.videoScript);
  late final _done = TextEditingController(text: '${c.doneSeconds}');
  late final _hex = TextEditingController(text: c.primary.toRadixString(16).substring(2).toUpperCase());
  late final _price = {for (final p in packageTitle.keys) p: TextEditingController(text: c.prices[p] == 0 ? '' : '${c.prices[p]}')};
  late final Future<List> _templates = StaffApi.i.call('GET', '/templates').then((r) => r as List);
  String _err = '';

  Future<void> _save() async {
    c
      ..welcomeTitle = _title.text.trim()
      ..welcomeMessage = _msg.text.trim()
      ..startLabel = _start.text.trim().isEmpty ? 'Get started' : _start.text.trim()
      ..phonePrefix = _prefix.text.trim()
      ..defaultDestination = _dest.text.trim()
      ..currency = _cur.text.trim().toUpperCase()
      ..videoScript = _script.text.trim()
      ..doneSeconds = (int.tryParse(_done.text) ?? 30).clamp(5, 600);
    for (final p in packageTitle.keys) {
      c.prices[p] = double.tryParse(_price[p]!.text.trim()) ?? 0;
    }
    final hex = int.tryParse('FF${_hex.text.trim().replaceAll('#', '')}', radix: 16);
    if (hex != null && _hex.text.trim().replaceAll('#', '').length == 6) c.primary = hex;

    final problem = !c.hasAgreement
        ? 'Choose the agreement customers will sign.'
        : c.packages.isEmpty
            ? 'Allow at least one package.'
            : c.packages.any((p) => (c.prices[p] ?? 0) <= 0)
                ? 'Set a price above 0 for every allowed package.'
                : !RegExp(r'^\+[1-9]\d{0,3}$').hasMatch(c.phonePrefix)
                    ? 'Phone prefix looks like +91.'
                    : !RegExp(r'^[A-Z]{3}$').hasMatch(c.currency)
                        ? 'Currency is a 3-letter code, e.g. INR.'
                        : !c.askDestination && c.defaultDestination.length < 2
                            ? 'Enter the fixed destination, or let customers choose it.'
                            : '';
    if (problem.isNotEmpty) return setState(() => _err = problem);
    if (!c.packages.contains(c.defaultPackage)) c.defaultPackage = c.packages.first;
    await saveKioskConfig(c);
    if (!mounted) return;
    setState(() => _err = '');
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Saved.')));
  }

  Widget _section(String t) => Padding(
        padding: const EdgeInsets.only(top: 28, bottom: 10),
        child: Text(t, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: ink)),
      );

  Widget _field(TextEditingController t, String label, {int lines = 1, String? hint, TextInputType? type}) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: TextField(controller: t, maxLines: lines, keyboardType: type, decoration: InputDecoration(labelText: label, hintText: hint)),
      );

  @override
  Widget build(BuildContext context) => ListView(padding: const EdgeInsets.fromLTRB(20, 8, 20, 40), children: [
        Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 760),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              _section('Kiosk'),
              Body(widget.isAdmin ? 'Choose what customers see, then start kiosk mode. The tablet stays signed in until you sign out.' : 'Start kiosk mode with the saved setup.', muted: true),
              gap(),
              FilledButton.icon(
                icon: const Icon(Icons.play_arrow),
                onPressed: kiosk.value.hasAgreement ? () => Navigator.popUntil(context, (r) => r.isFirst) : null,
                label: const Text('Start kiosk mode'),
              ),
              if (widget.isAdmin) ...[
                _section('Agreement'),
                FutureBuilder<List>(
                  future: _templates,
                  builder: (_, s) {
                    if (s.connectionState != ConnectionState.done) return const LinearProgressIndicator();
                    if (s.hasError) return ErrorText('${s.error}');
                    final items = s.data!;
                    return DropdownButtonFormField<String>(
                      initialValue: items.any((t) => t['id'] == c.templateId) ? c.templateId : null,
                      decoration: const InputDecoration(labelText: 'Agreement customers will sign'),
                      items: [for (final t in items) DropdownMenuItem(value: '${t['id']}', child: Text('${t['name']} (v${t['version']})'))],
                      onChanged: (v) => setState(() {
                        c.templateId = v ?? '';
                        c.templateName = '${items.firstWhere((t) => t['id'] == v)['name']}';
                      }),
                    );
                  },
                ),
                _section('Packages and price'),
                Wrap(spacing: 10, children: [
                  for (final p in packageTitle.keys)
                    FilterChip(
                      label: Text(packageTitle[p]!),
                      selected: c.packages.contains(p),
                      onSelected: (v) => setState(() => v ? c.packages.add(p) : c.packages.remove(p)),
                    ),
                ]),
                gap(),
                Row(children: [
                  Expanded(child: _field(_cur, 'Currency')),
                  const SizedBox(width: 12),
                  for (final p in packageTitle.keys) ...[
                    Expanded(child: _field(_price[p]!, '${packageTitle[p]} price', type: const TextInputType.numberWithOptions(decimal: true))),
                    if (p != 'BOTH') const SizedBox(width: 12),
                  ],
                ]),
                if (c.packages.length > 1)
                  DropdownButtonFormField<String>(
                    initialValue: c.packages.contains(c.defaultPackage) ? c.defaultPackage : c.packages.first,
                    decoration: const InputDecoration(labelText: 'Pre-selected package'),
                    items: [for (final p in c.packages) DropdownMenuItem(value: p, child: Text(packageTitle[p]!))],
                    onChanged: (v) => c.defaultPackage = v ?? c.defaultPackage,
                  ),
                _section('Customer form'),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Customer chooses the destination'),
                  value: c.askDestination,
                  onChanged: (v) => setState(() => c.askDestination = v),
                ),
                _field(_dest, c.askDestination ? 'Pre-filled destination (optional)' : 'Fixed destination'),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Show an optional notes box'),
                  value: c.askNotes,
                  onChanged: (v) => setState(() => c.askNotes = v),
                ),
                _field(_prefix, 'Phone country prefix', hint: '+91'),
                const Body('Name, mobile and email are always asked: the one-time code and the agreement need them.', muted: true),
                _section('Welcome screen'),
                _field(_title, 'Title'),
                _field(_msg, 'Message', lines: 3),
                _field(_start, 'Start button text'),
                _section('Brand colour'),
                Wrap(spacing: 12, runSpacing: 12, children: [
                  for (final s in _swatches)
                    GestureDetector(
                      onTap: () => setState(() {
                        c.primary = s;
                        _hex.text = s.toRadixString(16).substring(2).toUpperCase();
                      }),
                      child: Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: Color(s),
                          shape: BoxShape.circle,
                          border: Border.all(color: c.primary == s ? ink : Colors.transparent, width: 3),
                        ),
                      ),
                    ),
                ]),
                gap(),
                _field(_hex, 'Custom colour (hex)', hint: 'D6194A'),
                _section('Behaviour'),
                _field(_script, 'Video sentence', lines: 2, hint: '{name}, {package}, {business}'),
                _field(_done, 'Reset to welcome screen after (seconds)', type: TextInputType.number),
                if (_err.isNotEmpty) ...[ErrorText(_err), gap()],
                FilledButton(onPressed: _save, child: const Text('Save changes')),
                gap(8),
                const Body('Settings are saved on this tablet. The signing steps themselves (code, reading, video, signature) are fixed by the server.', muted: true),
              ],
            ]),
          ),
        ),
      ]);
}
