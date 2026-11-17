import 'package:flutter/material.dart';

import '../api.dart';
import '../config.dart';
import '../kiosk/details.dart' show packageTitle;
import '../ui.dart';

const _swatches = [0xFFD6194A, 0xFFFF3366, 0xFFB8123D, 0xFF0B2545, 0xFF0F766E, 0xFF4338CA, 0xFF334155];

/// "Tablet setup" tab: what the customer sees on this tablet (editable by admins only).
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
  late final _price = {
    for (final p in packageTitle.keys) p: TextEditingController(text: c.prices[p] == 0 ? '' : '${c.prices[p]}'),
  };
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

  /// White card with a heading and a plain-language line about what the section changes.
  Widget _card(String title, String about, List<Widget> children) => Container(
    margin: const EdgeInsets.only(top: 16),
    padding: const EdgeInsets.all(20),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: line),
    ),
    child: Material(
      type: MaterialType.transparency, // lets the switch tiles below paint correctly
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            title,
            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: ink),
          ),
          const SizedBox(height: 4),
          Text(about, style: const TextStyle(fontSize: 15, height: 1.4, color: Color(0xFF475569))),
          const SizedBox(height: 16),
          ...children,
        ],
      ),
    ),
  );

  /// Label above the box (wraps on small screens, unlike a floating label), optional help below it.
  Widget _field(
    TextEditingController t,
    String label, {
    int lines = 1,
    String? hint,
    String? help,
    TextInputType? type,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 18),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: ink),
        ),
        if (help != null) ...[
          const SizedBox(height: 2),
          Text(help, style: const TextStyle(fontSize: 14, height: 1.35, color: Color(0xFF64748B))),
        ],
        const SizedBox(height: 8),
        TextField(
          controller: t,
          maxLines: lines,
          keyboardType: type,
          style: const TextStyle(fontSize: 17, color: ink),
          decoration: InputDecoration(hintText: hint),
        ),
      ],
    ),
  );

  Widget _switch(String title, String help, bool value, ValueChanged<bool> onChanged) => SwitchListTile(
    contentPadding: EdgeInsets.zero,
    title: Text(
      title,
      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: ink),
    ),
    subtitle: Text(help, style: const TextStyle(fontSize: 14, color: Color(0xFF64748B))),
    value: value,
    onChanged: onChanged,
  );

  Widget _label(String t) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Text(
      t,
      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: ink),
    ),
  );

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
    children: [
      Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 760),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _card(
                'Customer screen',
                widget.isAdmin
                    ? 'Set up the options below and save. Then tap the button to show the customer screen and hand the tablet to the customer. The tablet stays signed in until you sign out.'
                    : 'Shows the customer screen with the setup your admin saved. Hand the tablet to the customer after tapping it.',
                [
                  FilledButton.icon(
                    icon: const Icon(Icons.tablet_android),
                    onPressed: kiosk.value.hasAgreement ? () => Navigator.popUntil(context, (r) => r.isFirst) : null,
                    label: const Text('Open customer screen'),
                  ),
                  if (!kiosk.value.hasAgreement) ...[
                    gap(10),
                    const Text(
                      'Choose an agreement below and save first.',
                      style: TextStyle(fontSize: 14, color: Color(0xFFB3261E)),
                    ),
                  ],
                ],
              ),
              if (widget.isAdmin) ...[
                _card('1. Agreement', 'The agreement every customer reads and signs on this tablet.', [
                  FutureBuilder<List>(
                    future: _templates,
                    builder: (_, s) {
                      if (s.connectionState != ConnectionState.done) return const LinearProgressIndicator();
                      if (s.hasError) return ErrorText('${s.error}');
                      final items = s.data!;
                      return DropdownButtonFormField<String>(
                        isExpanded: true,
                        initialValue: items.any((t) => t['id'] == c.templateId) ? c.templateId : null,
                        hint: const Text('Choose an agreement'),
                        style: Theme.of(context).textTheme.bodyLarge!.copyWith(fontSize: 17, color: ink),
                        items: [
                          for (final t in items)
                            DropdownMenuItem(
                              value: '${t['id']}',
                              child: Text('${t['name']} (version ${t['version']})', overflow: TextOverflow.ellipsis),
                            ),
                        ],
                        onChanged: (v) => setState(() {
                          c.templateId = v ?? '';
                          c.templateName = '${items.firstWhere((t) => t['id'] == v)['name']}';
                        }),
                      );
                    },
                  ),
                ]),
                _card(
                  '2. Packages and prices',
                  'Which packages customers can pick, and the price written into their agreement.',
                  [
                    _label('Packages offered'),
                    Wrap(
                      spacing: 10,
                      runSpacing: 10,
                      children: [
                        for (final p in packageTitle.keys)
                          FilterChip(
                            label: Text(packageTitle[p]!, style: const TextStyle(fontSize: 16)),
                            selected: c.packages.contains(p),
                            onSelected: (v) => setState(() => v ? c.packages.add(p) : c.packages.remove(p)),
                          ),
                      ],
                    ),
                    gap(18),
                    _field(_cur, 'Currency', hint: 'INR', help: '3-letter code, e.g. INR or USD.'),
                    for (final p in c.packages)
                      _field(
                        _price[p]!,
                        '${packageTitle[p]} price',
                        hint: 'e.g. 25000',
                        type: const TextInputType.numberWithOptions(decimal: true),
                      ),
                    if (c.packages.length > 1) ...[
                      _label('Selected by default'),
                      DropdownButtonFormField<String>(
                        isExpanded: true,
                        initialValue: c.packages.contains(c.defaultPackage) ? c.defaultPackage : c.packages.first,
                        style: Theme.of(context).textTheme.bodyLarge!.copyWith(fontSize: 17, color: ink),
                        items: [for (final p in c.packages) DropdownMenuItem(value: p, child: Text(packageTitle[p]!))],
                        onChanged: (v) => c.defaultPackage = v ?? c.defaultPackage,
                      ),
                    ],
                  ],
                ),
                _card(
                  '3. Customer form',
                  'What customers fill in before reading the agreement. Name, mobile and email are always asked, because the one-time code and the agreement need them.',
                  [
                    _switch(
                      'Customer types the destination',
                      'Turn off to use one fixed destination for everyone.',
                      c.askDestination,
                      (v) => setState(() => c.askDestination = v),
                    ),
                    gap(8),
                    _field(
                      _dest,
                      c.askDestination ? 'Pre-filled destination' : 'Destination',
                      help: c.askDestination
                          ? 'Optional. Customers can change it.'
                          : 'Used for every customer on this tablet.',
                    ),
                    _switch(
                      'Ask for notes',
                      'Adds an optional "Anything we should know?" box.',
                      c.askNotes,
                      (v) => setState(() => c.askNotes = v),
                    ),
                    gap(8),
                    _field(_prefix, 'Phone country code', hint: '+91', help: 'Added in front of the mobile number.'),
                  ],
                ),
                _card('4. Welcome screen', 'The first screen customers see when they pick up the tablet.', [
                  _field(_title, 'Heading'),
                  _field(_msg, 'Message', lines: 3),
                  _field(_start, 'Button text', hint: 'Get started'),
                ]),
                _card('5. Colour', 'Colour of buttons and highlights. The first one is the Zoltan Visa brand colour.', [
                  Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: [
                      for (final s in _swatches)
                        Semantics(
                          button: true,
                          selected: c.primary == s,
                          label: '#${s.toRadixString(16).substring(2).toUpperCase()}',
                          child: GestureDetector(
                            onTap: () => setState(() {
                              c.primary = s;
                              _hex.text = s.toRadixString(16).substring(2).toUpperCase();
                            }),
                            child: Container(
                              width: 48,
                              height: 48,
                              decoration: BoxDecoration(
                                color: Color(s),
                                shape: BoxShape.circle,
                                border: Border.all(color: c.primary == s ? ink : Colors.transparent, width: 3),
                              ),
                              child: c.primary == s ? const Icon(Icons.check, color: Colors.white) : null,
                            ),
                          ),
                        ),
                    ],
                  ),
                  gap(18),
                  _field(_hex, 'Or enter a colour code', hint: 'D6194A', help: '6 characters, e.g. D6194A.'),
                ]),
                _card(
                  '6. Video and finishing',
                  'What customers say on camera, and when the tablet clears itself for the next person.',
                  [
                    _field(
                      _script,
                      'Sentence the customer reads out',
                      lines: 2,
                      help: '{name}, {package} and {business} are filled in automatically.',
                    ),
                    _field(
                      _done,
                      'Clear the screen after (seconds)',
                      hint: '30',
                      help: 'After signing, the tablet returns to the welcome screen.',
                      type: TextInputType.number,
                    ),
                  ],
                ),
                gap(20),
                if (_err.isNotEmpty) ...[ErrorText(_err), gap()],
                FilledButton(onPressed: _save, child: const Text('Save changes')),
                gap(10),
                const Text(
                  'Saved on this tablet only. The signing steps (code, reading, video, signature) are set by the server.',
                  style: TextStyle(fontSize: 14, color: Color(0xFF64748B)),
                ),
              ],
            ],
          ),
        ),
      ),
    ],
  );
}
