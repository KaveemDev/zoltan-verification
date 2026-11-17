import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:signature/signature.dart';

import '../api.dart';
import '../legal.dart';
import '../ui.dart';
import 'video_step.dart';

class SignStep extends StatefulWidget {
  const SignStep({super.key, required this.api, required this.authed, required this.onDone});
  final SignApi api;
  final Authed authed;
  final void Function(Map<String, dynamic>) onDone;
  @override
  State<SignStep> createState() => _SignStepState();
}

class _SignStepState extends State<SignStep> {
  final _name = TextEditingController();
  final _pad = SignatureController(penStrokeWidth: 3, penColor: ink);
  final _ticked = List.filled(declarations.length, false);
  bool _agreed = false, _busy = false;
  String _err = '';

  @override
  void dispose() {
    _pad.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_name.text.trim().length < 2) return setState(() => _err = 'Please type your full name.');
    if (_pad.isEmpty) return setState(() => _err = 'Please draw your signature.');
    if (!_agreed || _ticked.contains(false)) return setState(() => _err = 'Please tick every declaration.');
    setState(() {
      _busy = true;
      _err = '';
    });
    try {
      final png = await _pad.toPngBytes();
      final r = await widget.authed(() async => await widget.api.call('/complete', post: true, auth: true, body: {
            'typedName': _name.text.trim(),
            'signaturePng': 'data:image/png;base64,${base64Encode(png!)}',
            'agreed': true,
            'declarations': _ticked,
            'legalTextVersion': legalTextVersion,
          }) as Map<String, dynamic>);
      widget.onDone(r);
    } on ApiError catch (e) {
      setState(() => _err = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
        child: Panel(scroll: false, children: [
          const H1('Sign the agreement'),
          gap(8),
          const Body('Client Declaration – please tick every statement.', muted: true),
          for (var i = 0; i < declarations.length; i++)
            CheckboxListTile(
              value: _ticked[i],
              onChanged: (v) => setState(() => _ticked[i] = v ?? false),
              title: Text(declarations[i], style: const TextStyle(fontSize: 16)),
              controlAffinity: ListTileControlAffinity.leading,
              contentPadding: EdgeInsets.zero,
              dense: true,
            ),
          const Divider(height: 32),
          TextField(controller: _name, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Type your full name')),
          gap(),
          const Body(signatureNotice, muted: true),
          gap(8),
          Container(
            decoration: BoxDecoration(border: Border.all(color: Colors.black26), borderRadius: BorderRadius.circular(12)),
            clipBehavior: Clip.antiAlias,
            child: Signature(controller: _pad, height: 200, backgroundColor: const Color(0xFFF8FAFC)),
          ),
          Align(alignment: Alignment.centerRight, child: TextButton(onPressed: _pad.clear, child: const Text('Clear'))),
          CheckboxListTile(
            value: _agreed,
            onChanged: (v) => setState(() => _agreed = v ?? false),
            title: const Text('I agree to the agreement and the Client Declaration.', style: TextStyle(fontSize: 17)),
            controlAffinity: ListTileControlAffinity.leading,
            contentPadding: EdgeInsets.zero,
          ),
          gap(),
          FilledButton(onPressed: _busy ? null : _submit, child: Busy(busy: _busy, label: 'Sign agreement')),
          if (_err.isNotEmpty) ...[gap(), ErrorText(_err)],
        ]),
      );
}
