import 'package:flutter/material.dart';

import '../api.dart';
import '../ui.dart';
import 'admin_home.dart';

class AdminLoginScreen extends StatefulWidget {
  const AdminLoginScreen({super.key});
  @override
  State<AdminLoginScreen> createState() => _AdminLoginScreenState();
}

class _AdminLoginScreenState extends State<AdminLoginScreen> {
  final _email = TextEditingController(), _pw = TextEditingController();
  bool _busy = false;
  String _err = '';

  Future<void> _login() async {
    setState(() {
      _busy = true;
      _err = '';
    });
    try {
      final me = await StaffApi.i.login(_email.text.trim(), _pw.text);
      _pw.clear();
      if (!mounted) return;
      Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => AdminHome(me: me)));
    } on ApiError catch (e) {
      _err = e.message;
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Shell(
        title: 'Staff sign in',
        leading: const BackButton(color: Colors.white),
        maxWidth: 520,
        child: Center(
          child: Panel(children: [
            TextField(controller: _email, keyboardType: TextInputType.emailAddress, autocorrect: false, decoration: const InputDecoration(labelText: 'Email')),
            gap(),
            TextField(controller: _pw, obscureText: true, onSubmitted: (_) => _login(), decoration: const InputDecoration(labelText: 'Password')),
            gap(20),
            FilledButton(onPressed: _busy ? null : _login, child: Busy(busy: _busy, label: 'Sign in')),
            if (_err.isNotEmpty) ...[gap(), ErrorText(_err)],
          ]),
        ),
      );
}
