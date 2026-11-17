import 'dart:async';

import 'package:camera/camera.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import '../api.dart';
import '../ui.dart';

typedef Authed = Future<T> Function<T>(Future<T> Function() fn);

const _minSec = 4, _maxSec = 15;

class VideoStep extends StatefulWidget {
  const VideoStep({super.key, required this.api, required this.authed, required this.script, required this.onDone});
  final SignApi api;
  final Authed authed;
  final String script;
  final VoidCallback onDone;
  @override
  State<VideoStep> createState() => _VideoStepState();
}

enum _Phase { intro, starting, ready, countdown, recording, uploading, failed }

class _VideoStepState extends State<VideoStep> {
  CameraController? _cam;
  _Phase _phase = _Phase.intro;
  int _count = 3, _secs = 0;
  String _err = '';
  Timer? _timer;
  XFile? _file;
  double _duration = 0;

  @override
  void dispose() {
    _timer?.cancel();
    _cam?.dispose();
    super.dispose();
  }

  Future<void> _enable() async {
    setState(() {
      _phase = _Phase.starting;
      _err = '';
    });
    try {
      final cams = await availableCameras();
      final front = cams.firstWhere((c) => c.lensDirection == CameraLensDirection.front, orElse: () => cams.first);
      final c = CameraController(front, ResolutionPreset.medium, enableAudio: true);
      await c.initialize();
      await c.prepareForVideoRecording();
      _cam = c;
      setState(() => _phase = _Phase.ready);
    } on CameraException catch (e) {
      final denied = e.code.contains('Denied') || e.code.contains('Restricted');
      setState(() {
        _phase = _Phase.intro;
        _err = denied
            ? 'We need the camera and microphone. Please allow them in the tablet’s Settings, then try again.'
            : 'The camera could not be started. Close other apps that use it and try again.';
      });
    } catch (_) {
      setState(() {
        _phase = _Phase.intro;
        _err = 'No camera was found on this device.';
      });
    }
  }

  Future<void> _record() async {
    for (var n = 3; n >= 1; n--) {
      setState(() {
        _phase = _Phase.countdown;
        _count = n;
      });
      await Future.delayed(const Duration(seconds: 1));
      if (!mounted) return;
    }
    await _cam!.startVideoRecording();
    final started = DateTime.now();
    setState(() {
      _phase = _Phase.recording;
      _secs = 0;
    });
    _timer = Timer.periodic(const Duration(milliseconds: 250), (_) {
      final s = DateTime.now().difference(started).inMilliseconds / 1000;
      if (s >= _maxSec) {
        _stop();
      } else if (s.floor() != _secs) {
        setState(() => _secs = s.floor());
      }
    });
  }

  Future<void> _stop() async {
    if (_phase != _Phase.recording) return;
    _timer?.cancel();
    setState(() => _phase = _Phase.uploading);
    _duration = _secs + 0.5;
    _file = await _cam!.stopVideoRecording();
    await _upload();
  }

  Future<void> _upload() async {
    setState(() {
      _phase = _Phase.uploading;
      _err = '';
    });
    try {
      final bytes = await _file!.readAsBytes();
      final p = await widget.authed(() async => await widget.api.call('/video/presign', post: true, auth: true, body: {
            'mimeType': 'video/mp4',
            'sizeBytes': bytes.length,
            'durationSec': _duration,
            'sha256': sha256.convert(bytes).toString(),
          }) as Map<String, dynamic>);
      final put = await http.put(Uri.parse(p['uploadUrl']),
          headers: Map<String, String>.from(p['headers']), body: bytes);
      if (put.statusCode >= 300) throw Exception('upload ${put.statusCode}');
      await widget.authed(() => widget.api.call('/video/confirm', post: true, auth: true, body: {'uploadId': p['uploadId']}));
      widget.onDone();
    } on ApiError catch (e) {
      if (mounted) {
        setState(() {
          _phase = _Phase.failed;
          _err = e.message;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _phase = _Phase.failed;
          _err = 'The upload didn’t finish. Please check the internet connection.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final live = _phase == _Phase.ready || _phase == _Phase.countdown || _phase == _Phase.recording;
    return Center(
      child: Panel(children: [
        const H1('Quick confirmation video'),
        gap(8),
        if (_phase == _Phase.intro || _phase == _Phase.starting)
          const Body('Look at the camera in a well-lit spot. When you tap Start, read the sentence on screen out loud.'),
        if (live) ...[
          ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: AspectRatio(aspectRatio: 4 / 3, child: Stack(fit: StackFit.expand, children: [
              FittedBox(
                fit: BoxFit.cover,
                child: SizedBox(
                  width: _cam!.value.previewSize!.height,
                  height: _cam!.value.previewSize!.width,
                  child: CameraPreview(_cam!),
                ),
              ),
              if (_phase == _Phase.countdown)
                Center(child: Text('$_count', style: const TextStyle(fontSize: 96, color: Colors.white, fontWeight: FontWeight.w800))),
            ])),
          ),
          gap(),
          const Body('Please say:', muted: true),
          Text('“${widget.script}”', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w600, color: navy)),
        ],
        gap(20),
        switch (_phase) {
          _Phase.intro => FilledButton(onPressed: _enable, child: const Text('Turn on camera')),
          _Phase.starting => const Center(child: CircularProgressIndicator()),
          _Phase.ready => FilledButton(onPressed: _record, child: const Text('Start recording')),
          _Phase.countdown => const SizedBox.shrink(),
          _Phase.recording => FilledButton(
              style: FilledButton.styleFrom(backgroundColor: const Color(0xFFB3261E)),
              onPressed: _secs >= _minSec ? _stop : null,
              child: Text(_secs >= _minSec ? 'Stop  ($_secs s)' : 'Recording $_secs s – keep going…'),
            ),
          _Phase.uploading => const Column(children: [CircularProgressIndicator(), SizedBox(height: 12), Body('Uploading…')]),
          _Phase.failed => Column(children: [
              FilledButton(onPressed: _upload, child: const Text('Try upload again')),
              gap(12),
              OutlinedButton(onPressed: () => setState(() => _phase = _Phase.ready), child: const Text('Record again')),
            ]),
        },
        if (_err.isNotEmpty) ...[gap(), ErrorText(_err)],
      ]),
    );
  }
}
