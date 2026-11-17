import 'package:flutter/material.dart';

import '../api.dart';
import '../ui.dart';
import 'kiosk_setup.dart';

const _statusColor = {
  'SIGNED': Color(0xFF1B8A5A),
  'VERIFIED': Color(0xFF13A89E),
  'OPENED': Color(0xFF3B6FD4),
  'SENT': Color(0xFF3B6FD4),
  'EXPIRED': Color(0xFF8A8F98),
  'CANCELLED': Color(0xFFB3261E),
  'DRAFT': Color(0xFF8A8F98),
};

class AdminHome extends StatelessWidget {
  const AdminHome({super.key, required this.me});
  final Map<String, dynamic> me;

  bool get isAdmin => me['role'] == 'ADMIN';

  Future<void> _out(BuildContext c) async {
    await StaffApi.i.logout().catchError((_) {});
    if (c.mounted) Navigator.popUntil(c, (r) => r.isFirst);
  }

  @override
  Widget build(BuildContext context) => DefaultTabController(
        length: isAdmin ? 4 : 3,
        child: Scaffold(
          appBar: AppBar(
            backgroundColor: Colors.white,
            foregroundColor: ink,
            elevation: 0,
            automaticallyImplyLeading: false,
            title: Row(children: [
              Image.asset('assets/logo.png', height: 32),
              const SizedBox(width: 14),
              Flexible(child: Text('${me['name']} \u00B7 ${me['role']}', overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 15, color: Colors.black54))),
            ]),
            actions: [TextButton.icon(onPressed: () => _out(context), icon: const Icon(Icons.logout), label: const Text('Sign out'))],
            bottom: TabBar(
              labelColor: brand,
              unselectedLabelColor: Colors.black54,
              indicatorColor: brand,
              tabs: [const Tab(text: 'Kiosk'), const Tab(text: 'Agreements'), if (isAdmin) const Tab(text: 'Templates'), const Tab(text: 'Settings')],
            ),
          ),
          body: TabBarView(children: [KioskSetup(isAdmin: isAdmin), const AgreementsTab(), if (isAdmin) const TemplatesTab(), const SettingsTab()]),
        ),
      );
}

String _msg(Object e) => e is ApiError ? e.message : '$e';

class AgreementsTab extends StatefulWidget {
  const AgreementsTab({super.key});
  @override
  State<AgreementsTab> createState() => _AgreementsTabState();
}

class _AgreementsTabState extends State<AgreementsTab> {
  final _q = TextEditingController();
  Future<List>? _f;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  void _reload() => setState(() => _f = StaffApi.i
      .call('GET', '/agreements?pageSize=50${_q.text.trim().isEmpty ? '' : '&q=${Uri.encodeQueryComponent(_q.text.trim())}'}')
      .then((r) => (r as Map)['items'] as List));

  @override
  Widget build(BuildContext context) => Column(children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: TextField(
            controller: _q,
            onSubmitted: (_) => _reload(),
            decoration: InputDecoration(hintText: 'Search name or phone', prefixIcon: const Icon(Icons.search), suffixIcon: IconButton(icon: const Icon(Icons.refresh), onPressed: _reload)),
          ),
        ),
        Expanded(
          child: FutureBuilder<List>(
            future: _f,
            builder: (c, s) {
              if (s.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
              if (s.hasError) return Center(child: Padding(padding: const EdgeInsets.all(24), child: ErrorText(_msg(s.error!))));
              final items = s.data!;
              if (items.isEmpty) return const Center(child: Body('No agreements found.', muted: true));
              return ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                itemCount: items.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (_, i) {
                  final a = items[i] as Map;
                  return Card(
                    margin: EdgeInsets.zero,
                    child: ListTile(
                      title: Text('${a['customerName']}', style: const TextStyle(fontWeight: FontWeight.w600)),
                      subtitle: Text('${a['packageType']} · ${a['destination']} · ${a['customerPhone']}'),
                      trailing: Chip(
                        label: Text('${a['status']}', style: const TextStyle(color: Colors.white, fontSize: 12)),
                        backgroundColor: _statusColor[a['status']] ?? Colors.grey,
                        side: BorderSide.none,
                      ),
                      onTap: () async {
                        await Navigator.push(c, MaterialPageRoute(builder: (_) => AgreementDetail(id: '${a['id']}')));
                        _reload();
                      },
                    ),
                  );
                },
              );
            },
          ),
        ),
      ]);
}

class AgreementDetail extends StatefulWidget {
  const AgreementDetail({super.key, required this.id});
  final String id;
  @override
  State<AgreementDetail> createState() => _AgreementDetailState();
}

class _AgreementDetailState extends State<AgreementDetail> {
  Map? _a;
  String _err = '';
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _act('GET', '');
  }

  Future<void> _act(String method, String path, {Object? body}) async {
    setState(() {
      _busy = true;
      _err = '';
    });
    try {
      final r = await StaffApi.i.call(method, '/agreements/${widget.id}$path', body: body) as Map;
      _a = path == '/resend' ? r['agreement'] as Map : r;
      if (path == '/resend' && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(r['sent'] == true ? 'Link sent.' : 'Could not send the link.')));
      }
    } catch (e) {
      _err = _msg(e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final a = _a;
    final open = a != null && const ['SENT', 'OPENED', 'VERIFIED'].contains(a['status']);
    return Shell(
      title: 'Agreement',
      leading: const BackButton(color: Colors.white),
      child: a == null
          ? Center(child: _err.isEmpty ? const CircularProgressIndicator() : ErrorText(_err))
          : ListView(padding: const EdgeInsets.all(20), children: [
              H1('${a['customerName']}'),
              gap(8),
              _row('Status', '${a['status']}'),
              _row('Package', '${a['packageType']} · ${a['destination']}'),
              _row('Price', '${a['currency']} ${a['price']}'),
              _row('Phone', '${a['customerPhone']}'),
              _row('Email', '${a['customerEmail'] ?? '-'}'),
              _row('Signed', '${a['signedAt'] ?? '-'}'),
              _row('Link expires', '${a['tokenExpiresAt'] ?? '-'}'),
              if (_err.isNotEmpty) ...[gap(), ErrorText(_err)],
              gap(20),
              if (open) ...[
                FilledButton(onPressed: _busy ? null : () => _act('POST', '/resend'), child: const Text('Resend signing link')),
                gap(12),
                OutlinedButton(onPressed: _busy ? null : () => _act('POST', '/extend', body: {'hours': 24}), child: const Text('Extend link by 24 hours')),
                gap(12),
                OutlinedButton(
                  style: OutlinedButton.styleFrom(foregroundColor: const Color(0xFFB3261E)),
                  onPressed: _busy ? null : () => _confirmCancel(),
                  child: const Text('Cancel agreement'),
                ),
                gap(20),
              ],
              const Text('Activity', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: ink)),
              for (final e in (a['events'] as List? ?? []))
                ListTile(dense: true, contentPadding: EdgeInsets.zero, title: Text('${(e as Map)['type']}'.replaceAll('_', ' ')), subtitle: Text('${e['createdAt']}')),
            ]),
    );
  }

  Future<void> _confirmCancel() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Cancel this agreement?'),
        content: const Text('The customer’s link will stop working. This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Keep')),
          TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Cancel agreement')),
        ],
      ),
    );
    if (ok == true) await _act('POST', '/cancel', body: {});
  }

  Widget _row(String k, String v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(width: 130, child: Text(k, style: const TextStyle(color: Colors.black54, fontSize: 16))),
          Expanded(child: Text(v, style: const TextStyle(fontSize: 16))),
        ]),
      );
}

class TemplatesTab extends StatefulWidget {
  const TemplatesTab({super.key});
  @override
  State<TemplatesTab> createState() => _TemplatesTabState();
}

class _TemplatesTabState extends State<TemplatesTab> {
  late Future<List> _f = _load();
  Future<List> _load() => StaffApi.i.call('GET', '/templates?all=1').then((r) => r as List);

  Future<void> _toggle(Map t, bool v) async {
    try {
      await StaffApi.i.call('PATCH', '/templates/${t['id']}', body: {'active': v});
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(_msg(e))));
    }
    setState(() => _f = _load());
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<List>(
        future: _f,
        builder: (c, s) {
          if (s.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          if (s.hasError) return Center(child: ErrorText(_msg(s.error!)));
          return ListView(padding: const EdgeInsets.all(16), children: [
            const Body('Choose which agreement forms staff can use. New templates are created in the web dashboard.', muted: true),
            gap(8),
            for (final t in s.data!)
              Card(
                child: SwitchListTile(
                  title: Text('${(t as Map)['name']}', style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Text('Version ${t['version']}'),
                  value: t['active'] == true,
                  onChanged: (v) => _toggle(t, v),
                ),
              ),
          ]);
        },
      );
}

class SettingsTab extends StatefulWidget {
  const SettingsTab({super.key});
  @override
  State<SettingsTab> createState() => _SettingsTabState();
}

class _SettingsTabState extends State<SettingsTab> {
  final _url = TextEditingController(text: Config.baseUrl);

  @override
  Widget build(BuildContext context) => ListView(padding: const EdgeInsets.all(20), children: [
        const H1('Tablet settings'),
        gap(),
        TextField(controller: _url, keyboardType: TextInputType.url, autocorrect: false, decoration: const InputDecoration(labelText: 'Server address', hintText: 'https://api.example.com')),
        gap(),
        FilledButton(
          onPressed: () async {
            await Config.setBaseUrl(_url.text);
            if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Saved. Sign in again to use the new server.')));
          },
          child: const Text('Save'),
        ),
      ]);
}
