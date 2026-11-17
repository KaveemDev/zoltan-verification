import 'package:flutter/material.dart';
import 'package:pdfrx/pdfrx.dart';

import '../api.dart';
import '../legal.dart';
import '../ui.dart';

class ReadStep extends StatefulWidget {
  const ReadStep({super.key, required this.doc, required this.onDone});
  final Map<String, dynamic> doc;
  final Future<void> Function(Map<String, dynamic>) onDone;
  @override
  State<ReadStep> createState() => _ReadStepState();
}

class _ReadStepState extends State<ReadStep> {
  int _total = 0, _seen = 1;
  bool _agree = false, _busy = false;
  String _err = '';
  final _start = DateTime.now();

  Future<void> _go() async {
    setState(() {
      _busy = true;
      _err = '';
    });
    try {
      await widget.onDone({
        'pagesViewed': _seen,
        'totalPages': _total,
        'secondsOnPage': DateTime.now().difference(_start).inSeconds.clamp(0, 86400),
      });
    } on ApiError catch (e) {
      _err = e.message;
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final readAll = _total > 0 && _seen >= _total;
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
        child: Row(children: [
          const Expanded(child: H1('Read your agreement')),
          Text(_total == 0 ? '' : 'Page $_seen of $_total', style: const TextStyle(fontSize: 16, color: Colors.black54)),
        ]),
      ),
      Expanded(
        child: Container(
          margin: const EdgeInsets.all(20),
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
          child: PdfViewer.uri(
            Uri.parse(widget.doc['pdfUrl']),
            params: PdfViewerParams(
              onViewerReady: (d, _) => setState(() => _total = d.pages.length),
              onPageChanged: (p) {
                if (p != null && p > _seen) setState(() => _seen = p);
              },
            ),
          ),
        ),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(children: [
          if (!readAll) const Body('Scroll to the end of the agreement to continue.', muted: true),
          if (_err.isNotEmpty) ErrorText(_err),
          CheckboxListTile(
            value: _agree,
            onChanged: readAll ? (v) => setState(() => _agree = v ?? false) : null,
            title: const Text(agreementConsent),
            controlAffinity: ListTileControlAffinity.leading,
            contentPadding: EdgeInsets.zero,
          ),
          FilledButton(onPressed: readAll && _agree && !_busy ? _go : null, child: Busy(busy: _busy, label: 'Continue')),
        ]),
      ),
    ]);
  }
}
