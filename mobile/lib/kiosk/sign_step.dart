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
    if (!_agreed) return setState(() => _err = 'Please tick the box to agree to the agreement.');
    setState(() {
      _busy = true;
      _err = '';
    });
    try {
      final png = await _pad.toPngBytes();
      final r = await widget.authed(
        () async =>
            await widget.api.call(
                  '/complete',
                  post: true,
                  auth: true,
                  body: {
                    'typedName': _name.text.trim(),
                    'signaturePng': 'data:image/png;base64,${base64Encode(png!)}',
                    'agreed': true,
                    // One tick confirms the whole Client Declaration, as on the website.
                    'declarations': List.filled(declarations.length, true),
                    'legalTextVersion': legalTextVersion,
                  },
                )
                as Map<String, dynamic>,
      );
      widget.onDone(r);
    } on ApiError catch (e) {
      setState(() => _err = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    child: Panel(
      scroll: false,
      children: [
        const H1('Sign the agreement'),
        gap(8),
        CheckboxListTile(
          value: _agreed,
          onChanged: (v) => setState(() => _agreed = v ?? false),
          title: const Text('I agree to the agreement and the Client Declaration.', style: TextStyle(fontSize: 17)),
          controlAffinity: ListTileControlAffinity.leading,
          contentPadding: EdgeInsets.zero,
        ),
        gap(8),
        const Body(signatureNotice, muted: true),
        gap(),
        TextField(
          controller: _name,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(labelText: 'Type your full name'),
        ),
        gap(20),
        Row(
          children: [
            const Expanded(
              child: Text(
                'Draw your signature',
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: ink),
              ),
            ),
            TextButton(onPressed: _pad.clear, child: const Text('Clear')),
          ],
        ),
        const Body('Use your finger in the box below.', muted: true),
        gap(8),
        Container(
          decoration: BoxDecoration(
            border: Border.all(color: Colors.black38, width: 1.5),
            borderRadius: BorderRadius.circular(12),
          ),
          clipBehavior: Clip.antiAlias,
          child: Signature(controller: _pad, height: 200, backgroundColor: Colors.white),
        ),
        gap(),
        FilledButton(
          onPressed: _busy ? null : _submit,
          child: Busy(busy: _busy, label: 'Sign agreement'),
        ),
        if (_err.isNotEmpty) ...[gap(), ErrorText(_err)],
      ],
    ),
  );
}
