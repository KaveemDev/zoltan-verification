import 'dart:async';

import 'package:flutter/material.dart';

import '../api.dart';
import '../config.dart';
import '../legal.dart';
import '../ui.dart';
import 'read_step.dart';
import 'sign_step.dart';
import 'video_step.dart';

const _errors = {
  'LINK_INVALID': ('This link does not work', 'Please check the code, or ask our staff for a new one.'),
  'LINK_EXPIRED': ('This link has expired', 'Please ask our staff to send you a new link.'),
  'LINK_CANCELLED': ('This agreement was cancelled', 'Please speak to our staff if you think this is a mistake.'),
  'ALREADY_SIGNED': ('Already signed', 'This agreement has already been signed. There is nothing more to do.'),
  'RATE_LIMITED': ('Please wait a moment', 'There were too many attempts. Please try again in a few minutes.'),
};

enum Step { verify, read, consent, video, sign, done }

class FlowScreen extends StatefulWidget {
  const FlowScreen({super.key, required this.token});
  final String token;
  @override
  State<FlowScreen> createState() => _FlowScreenState();
}

class _FlowScreenState extends State<FlowScreen> {
  late final api = SignApi(widget.token);
  Map<String, dynamic>? info;
  Map<String, dynamic>? doc;
  Map<String, dynamic>? result;
  String? fatal;
  String? notice;
  Step step = Step.verify;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => fatal = null);
    try {
      info = await api.call('') as Map<String, dynamic>;
    } on ApiError catch (e) {
      fatal = e.code;
    }
    if (mounted) setState(() {});
  }

  /// Session-authenticated call; an expired session goes back to the code step.
  Future<T> authed<T>(Future<T> Function() fn) async {
    try {
      return await fn();
    } on ApiError catch (e) {
      if (e.code == 'SESSION_EXPIRED') {
        api.session = null;
        setState(() {
          notice = 'For your security, please confirm with a new code.';
          step = Step.verify;
        });
      } else if (_errors.containsKey(e.code)) {
        setState(() => fatal = e.code);
      }
      rethrow;
    }
  }

  Future<void> _loadDoc() async {
    doc = await authed(() async => await api.call('/document', auth: true) as Map<String, dynamic>);
    final p = doc!['progress'] as Map<String, dynamic>;
    setState(() => step = p['viewed'] != true
        ? Step.read
        : p['recordingConsented'] != true
            ? Step.consent
            : p['videoRecorded'] != true
                ? Step.video
                : Step.sign);
  }

  Future<void> _exit() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Leave and start over?'),
        content: const Text('Your progress on this tablet will be cleared.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Stay')),
          TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Leave')),
        ],
      ),
    );
    if (ok == true && mounted) Navigator.popUntil(context, (r) => r.isFirst);
  }

  @override
  Widget build(BuildContext context) {
    final business = '${info?['businessName'] ?? 'Zoltan Global'}';
    Widget body;
    if (fatal != null) {
      final e = _errors[fatal];
      body = Panel(children: [
        H1(e?.$1 ?? 'Something went wrong'),
        gap(),
        Body(e?.$2 ?? 'Please check the internet connection and try again.'),
        gap(24),
        if (e == null) FilledButton(onPressed: _load, child: const Text('Try again')),
        if (e != null) FilledButton(onPressed: () => Navigator.popUntil(context, (r) => r.isFirst), child: const Text('Back to start')),
      ]);
    } else if (info == null) {
      body = const Center(child: CircularProgressIndicator());
    } else {
      body = switch (step) {
        Step.verify => OtpStep(api: api, info: info!, notice: notice, onVerified: () {
            notice = null;
            _loadDoc();
          }),
        Step.read => ReadStep(
            doc: doc!,
            onDone: (v) async {
              await authed(() => api.call('/events', post: true, auth: true, body: {'type': 'AGREEMENT_VIEWED', ...v}));
              setState(() => step = Step.consent);
            }),
        Step.consent => _Consent(business, () async {
            await authed(() => api.call('/events',
                post: true, auth: true, body: {'type': 'RECORDING_CONSENT_GIVEN', 'legalTextVersion': legalTextVersion}));
            setState(() => step = Step.video);
          }),
        Step.video => VideoStep(
            api: api,
            authed: authed,
            script: kiosk.value.videoScript
                .replaceAll('{name}', '${info!['customerName']}')
                .replaceAll('{package}', packageLabel['${info!['packageType']}'] ?? '')
                .replaceAll('{business}', business),
            onDone: () => setState(() => step = Step.sign)),
        Step.sign => SignStep(
            api: api,
            authed: authed,
            onDone: (r) => setState(() {
                  result = r;
                  step = Step.done;
                })),
        Step.done => _Done(business, result!),
      };
    }
    final idx = const {Step.verify: 0, Step.read: 1, Step.consent: 2, Step.video: 3, Step.sign: 4}[step];
    return PopScope(
      canPop: step == Step.done || fatal != null,
      onPopInvokedWithResult: (didPop, _) => didPop ? null : _exit(),
      child: Shell(
        title: business,
        maxWidth: step == Step.read ? 1000 : 760,
        actions: [
          if (step != Step.done)
            TextButton(onPressed: _exit, child: const Text('Exit', style: TextStyle(color: Colors.white))),
        ],
        child: Column(children: [
          if (idx != null) StepBar(index: idx),
          Expanded(child: body),
        ]),
      ),
    );
  }
}

class OtpStep extends StatefulWidget {
  const OtpStep({super.key, required this.api, required this.info, required this.onVerified, this.notice});
  final SignApi api;
  final Map<String, dynamic> info;
  final String? notice;
  final VoidCallback onVerified;
  @override
  State<OtpStep> createState() => _OtpStepState();
}

class _OtpStepState extends State<OtpStep> {
  final _code = TextEditingController();
  DateTime? _resendAt;
  bool _sent = false, _busy = false;
  String _err = '';
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  int get _wait => _resendAt == null ? 0 : _resendAt!.difference(DateTime.now()).inSeconds.clamp(0, 9999) + 1;

  Future<void> _send() async {
    setState(() {
      _busy = true;
      _err = '';
    });
    try {
      final r = await widget.api.call('/otp/send', post: true) as Map<String, dynamic>;
      _resendAt = DateTime.parse(r['resendAvailableAt']);
      _sent = true;
      _code.clear();
    } on ApiError catch (e) {
      if (e.code == 'OTP_COOLDOWN') {
        _resendAt = DateTime.tryParse('${e.body['resendAvailableAt']}');
        _sent = true;
      } else {
        _err = e.message;
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verify() async {
    if (!RegExp(r'^\d{6}$').hasMatch(_code.text)) return setState(() => _err = 'Enter the 6-digit code.');
    setState(() {
      _busy = true;
      _err = '';
    });
    try {
      final r = await widget.api.call('/otp/verify', post: true, body: {'code': _code.text}) as Map<String, dynamic>;
      widget.api.session = r['sessionToken'];
      widget.onVerified();
    } on ApiError catch (e) {
      _err = e.code == 'OTP_INVALID' ? 'That code is not right. ${e.body['attemptsLeft']} tries left.' : e.message;
      _code.clear();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final sms = widget.info['codeChannel'] == 'sms';
    final dest = widget.info['codeDestination'];
    return Center(
      child: Panel(children: [
        const H1('Confirm it’s you'),
        gap(),
        if (widget.notice != null) ...[ErrorText(widget.notice!), gap()],
        Body(sms
            ? 'We’ll text a 6-digit code to your mobile number ending in $dest.'
            : 'We’ll email a 6-digit code to $dest.'),
        gap(24),
        if (!_sent)
          FilledButton(onPressed: _busy ? null : _send, child: Busy(busy: _busy, label: 'Send code'))
        else ...[
          TextField(
            controller: _code,
            keyboardType: TextInputType.number,
            maxLength: 6,
            autofocus: true,
            style: const TextStyle(fontSize: 28, letterSpacing: 8),
            textAlign: TextAlign.center,
            decoration: const InputDecoration(labelText: '6-digit code', counterText: ''),
            onSubmitted: (_) => _verify(),
          ),
          gap(),
          FilledButton(onPressed: _busy ? null : _verify, child: Busy(busy: _busy, label: 'Verify')),
          gap(12),
          OutlinedButton(
            onPressed: _busy || _wait > 0 ? null : _send,
            child: Text(_wait > 0 ? 'New code in ${_wait}s' : 'Send a new code'),
          ),
        ],
        if (_err.isNotEmpty) ...[gap(), ErrorText(_err)],
      ]),
    );
  }
}

class _Consent extends StatefulWidget {
  const _Consent(this.business, this.onDone);
  final String business;
  final Future<void> Function() onDone;
  @override
  State<_Consent> createState() => _ConsentState();
}

class _ConsentState extends State<_Consent> {
  bool _ok = false, _busy = false;
  String _err = '';

  Future<void> _go() async {
    setState(() {
      _busy = true;
      _err = '';
    });
    try {
      await widget.onDone();
    } on ApiError catch (e) {
      _err = e.message;
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Center(
        child: Panel(children: [
          const H1('Video confirmation'),
          gap(),
          Body(recordingNotice.replaceAll('{businessName}', widget.business)),
          gap(),
          CheckboxListTile(
            value: _ok,
            onChanged: (v) => setState(() => _ok = v ?? false),
            title: const Text(recordingConsent, style: TextStyle(fontSize: 18)),
            controlAffinity: ListTileControlAffinity.leading,
            contentPadding: EdgeInsets.zero,
          ),
          gap(),
          FilledButton(onPressed: _ok && !_busy ? _go : null, child: Busy(busy: _busy, label: 'Continue')),
          if (_err.isNotEmpty) ...[gap(), ErrorText(_err)],
        ]),
      );
}

class _Done extends StatefulWidget {
  const _Done(this.business, this.result);
  final String business;
  final Map<String, dynamic> result;
  @override
  State<_Done> createState() => _DoneState();
}

class _DoneState extends State<_Done> {
  Timer? _t;

  @override
  void initState() {
    super.initState();
    // Reset for the next customer so nothing stays on screen.
    _t = Timer(Duration(seconds: kiosk.value.doneSeconds), () => mounted ? Navigator.popUntil(context, (r) => r.isFirst) : null);
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Center(
        child: Panel(children: [
          Icon(Icons.check_circle, size: 72, color: brand),
          gap(),
          const H1('All done, thank you!'),
          gap(),
          Body('You signed your agreement with ${widget.business}.'),
          gap(8),
          Body('Agreement ID: ${widget.result['agreementId']}', muted: true),
          gap(8),
          Body('${widget.business} will share a copy with you.', muted: true),
          gap(24),
          FilledButton(onPressed: () => Navigator.popUntil(context, (r) => r.isFirst), child: const Text('Finish')),
        ]),
      );
}
