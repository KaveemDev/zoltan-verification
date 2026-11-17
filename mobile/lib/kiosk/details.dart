import 'package:flutter/material.dart';

import '../api.dart';
import '../config.dart';
import '../pdf.dart';
import '../ui.dart';
import 'flow.dart';

const packageTitle = {'VISA': 'Visa', 'TRAVEL': 'Travel', 'BOTH': 'Visa + Travel'};

class DetailsScreen extends StatefulWidget {
  const DetailsScreen({super.key});
  @override
  State<DetailsScreen> createState() => _DetailsScreenState();
}

class _DetailsScreenState extends State<DetailsScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController(), _phone = TextEditingController(), _email = TextEditingController();
  final _dest = TextEditingController(), _notes = TextEditingController();
  final c = kiosk.value;
  late String _pkg = c.packages.contains(c.defaultPackage) ? c.defaultPackage : c.packages.first;
  bool _busy = false;
  String _status = '', _err = '';

  @override
  void initState() {
    super.initState();
    _dest.text = c.defaultDestination;
  }

  @override
  void dispose() {
    for (final t in [_name, _phone, _email, _dest, _notes]) {
      t.dispose();
    }
    super.dispose();
  }

  String? _req(String? v, [int min = 2]) => (v ?? '').trim().length < min ? 'Required' : null;

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _err = '';
      _status = 'Preparing your agreement…';
    });
    try {
      final draft =
          await DeviceApi.call(
                '/agreements',
                body: {
                  'customerName': _name.text.trim(),
                  'customerPhone': '${c.phonePrefix}${_phone.text.replaceAll(RegExp(r'\D'), '')}',
                  'customerEmail': _email.text.trim(),
                  'packageType': _pkg,
                  'destination': c.askDestination ? _dest.text.trim() : c.defaultDestination,
                  if (c.askNotes && _notes.text.trim().isNotEmpty) 'notes': _notes.text.trim(),
                },
              )
              as Map<String, dynamic>;
      final pdf = await buildAgreementPdf(draft['html'], draft['footer']);
      setState(() => _status = 'Almost ready…');
      final r = await DeviceApi.call('/agreements/${draft['id']}/original-pdf', raw: pdf) as Map<String, dynamic>;
      final token = r['signingToken'];
      if (token is! String) throw ApiError(0, 'SERVER_OUTDATED', '');
      if (!mounted) return;
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => FlowScreen(token: token)));
    } on ApiError catch (e) {
      if (e.code == 'KIOSK_SETUP_INVALID') await DeviceApi.clear();
      _err = switch (e.code) {
        'KIOSK_SETUP_INVALID' => 'This device needs to be set up again. Please ask our staff for help.',
        'PACKAGE_NOT_OFFERED' => 'This package is not available here. Please choose another or ask our staff for help.',
        'TEMPLATE_NOT_FOUND' => 'The agreement for this device is no longer available. Please ask our staff for help.',
        'SERVER_OUTDATED' || 'NOT_FOUND' =>
          'This device can’t start signing right now. Please ask our staff for help. (Staff: the server is running an old version without on-device signing.)',
        _ => e.message,
      };
    } catch (_) {
      _err = 'We could not prepare your agreement. Please try again or ask our staff for help.';
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Shell(
    leading: _busy ? null : const BackButton(),
    child: SingleChildScrollView(
      child: Panel(
        scroll: false,
        children: [
          Form(
            key: _form,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const H1('Your details'),
                gap(8),
                const Body('Please enter them exactly as they appear on your passport.', muted: true),
                gap(20),
                TextFormField(
                  controller: _name,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(labelText: 'Full name'),
                  validator: _req,
                ),
                gap(),
                TextFormField(
                  controller: _phone,
                  keyboardType: TextInputType.phone,
                  decoration: InputDecoration(labelText: 'Mobile number', prefixText: '${c.phonePrefix}  '),
                  validator: (v) =>
                      RegExp(
                        r'^\+[1-9]\d{7,14}$',
                      ).hasMatch('${c.phonePrefix}${(v ?? '').replaceAll(RegExp(r'\D'), '')}')
                      ? null
                      : 'Enter a valid mobile number',
                ),
                gap(),
                TextFormField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  autocorrect: false,
                  decoration: const InputDecoration(labelText: 'Email address'),
                  validator: (v) =>
                      RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch((v ?? '').trim()) ? null : 'Enter a valid email',
                ),
                if (c.askDestination) ...[
                  gap(),
                  TextFormField(
                    controller: _dest,
                    textCapitalization: TextCapitalization.words,
                    decoration: const InputDecoration(labelText: 'Destination country'),
                    validator: _req,
                  ),
                ],
                if (c.packages.length > 1) ...[
                  gap(20),
                  const Text('Package', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                  gap(8),
                  Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: [
                      for (final p in c.packages)
                        ChoiceChip(
                          label: Padding(
                            padding: const EdgeInsets.all(6),
                            child: Text(packageTitle[p] ?? p, style: const TextStyle(fontSize: 17)),
                          ),
                          selected: _pkg == p,
                          selectedColor: brand.withValues(alpha: 0.15),
                          onSelected: (_) => setState(() => _pkg = p),
                        ),
                    ],
                  ),
                ],
                if (c.askNotes) ...[
                  gap(),
                  TextFormField(
                    controller: _notes,
                    maxLines: 3,
                    decoration: const InputDecoration(labelText: 'Anything we should know? (optional)'),
                  ),
                ],
                gap(24),
                FilledButton(
                  onPressed: _busy ? null : _submit,
                  child: Busy(busy: _busy, label: 'Continue'),
                ),
                if (_busy) ...[gap(12), Center(child: Body(_status, muted: true))],
                if (_err.isNotEmpty) ...[gap(), ErrorText(_err)],
              ],
            ),
          ),
        ],
      ),
    ),
  );
}
