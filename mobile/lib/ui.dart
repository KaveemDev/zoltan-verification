import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'config.dart';

// Zoltan Visa web brand: pink accent, slate neutrals, Plus Jakarta Sans headings, Inter body.
const ink = Color(0xFF0F172A);
const line = Color(0xFFE2E8F0);
Color get brand => Color(kiosk.value.primary);

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(seedColor: brand, primary: brand, surface: Colors.white);
  final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(12));
  const btnText = TextStyle(fontSize: 18, fontWeight: FontWeight.w600);
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    textTheme: GoogleFonts.interTextTheme(),
    scaffoldBackgroundColor: const Color(0xFFF8FAFC),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: Color(0xFFCBD5E1)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: Color(0xFFCBD5E1)),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(60), textStyle: btnText, shape: shape),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(60),
        textStyle: btnText,
        shape: shape,
        foregroundColor: brand,
        side: BorderSide(color: brand),
      ),
    ),
  );
}

/// Page frame: white header with the logo, content centred in a readable column (large screens first, fine on phones).
class Shell extends StatelessWidget {
  const Shell({super.key, required this.child, this.title, this.actions = const [], this.leading, this.maxWidth = 760});
  final Widget child;
  final String? title;
  final List<Widget> actions;
  final Widget? leading;
  final double maxWidth;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      backgroundColor: Colors.white,
      foregroundColor: ink,
      elevation: 0,
      scrolledUnderElevation: 0,
      shape: const Border(bottom: BorderSide(color: line)),
      leading: leading,
      automaticallyImplyLeading: false,
      titleSpacing: leading == null ? 20 : 0,
      title: Row(
        children: [
          Image.asset('assets/logo.png', height: 34),
          if (title != null) ...[
            const SizedBox(width: 14),
            Flexible(
              child: Text(
                title!,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.plusJakartaSans(fontSize: 16, fontWeight: FontWeight.w600, color: Colors.black54),
              ),
            ),
          ],
        ],
      ),
      actions: actions,
    ),
    body: SafeArea(
      child: Center(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: maxWidth),
          child: child,
        ),
      ),
    ),
  );
}

class Panel extends StatelessWidget {
  const Panel({super.key, required this.children, this.scroll = true});
  final List<Widget> children;
  final bool scroll;

  @override
  Widget build(BuildContext context) {
    final card = Container(
      margin: const EdgeInsets.all(20),
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: const [BoxShadow(color: Color(0x14000000), blurRadius: 24, offset: Offset(0, 8))],
      ),
      // Material: checkbox/switch tiles paint on the nearest Material, not on this white box.
      child: Material(
        type: MaterialType.transparency,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: children,
        ),
      ),
    );
    return scroll ? SingleChildScrollView(child: card) : card;
  }
}

Widget gap([double h = 16]) => SizedBox(height: h);

class H1 extends StatelessWidget {
  const H1(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Text(
    text,
    style: GoogleFonts.plusJakartaSans(fontSize: 28, fontWeight: FontWeight.w800, color: ink),
  );
}

class Body extends StatelessWidget {
  const Body(this.text, {super.key, this.muted = false});
  final String text;
  final bool muted;
  @override
  Widget build(BuildContext context) =>
      Text(text, style: TextStyle(fontSize: 18, height: 1.45, color: muted ? Colors.black54 : Colors.black87));
}

class ErrorText extends StatelessWidget {
  const ErrorText(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(color: const Color(0xFFFDECEA), borderRadius: BorderRadius.circular(10)),
    child: Text(text, style: const TextStyle(color: Color(0xFFB3261E), fontSize: 16)),
  );
}

/// Shows a spinner inside the button while [busy].
class Busy extends StatelessWidget {
  const Busy({super.key, required this.busy, required this.label});
  final bool busy;
  final String label;
  @override
  Widget build(BuildContext context) => busy
      ? const SizedBox(height: 24, width: 24, child: CircularProgressIndicator(strokeWidth: 3, color: Colors.white))
      : Text(label);
}

class StepBar extends StatelessWidget {
  const StepBar({super.key, required this.index});
  static const labels = ['Verify', 'Read', 'Consent', 'Video', 'Sign'];
  final int index;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
    child: Row(
      children: [
        for (var i = 0; i < labels.length; i++)
          Expanded(
            child: Column(
              children: [
                Container(
                  height: 6,
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  decoration: BoxDecoration(
                    color: i <= index ? brand : const Color(0xFFE2E8F0),
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  labels[i],
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: i == index ? FontWeight.w700 : FontWeight.w400,
                    color: i == index ? ink : Colors.black45,
                  ),
                ),
              ],
            ),
          ),
      ],
    ),
  );
}
