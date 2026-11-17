import 'dart:typed_data';

import 'package:html/dom.dart' as dom;
import 'package:html/parser.dart' as html_parser;
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

/// Builds the agreement PDF on the device from the server-filled HTML (the web app does the same in the browser).
/// Handles the tags templates use: h1, h2, p, ol/ul/li, table, strong/b, em/i, br, div/span.
/// shortcut: other tags are read as plain text; Latin fonts only, same as the web version.
Future<Uint8List> buildAgreementPdf(String html, String footer) async {
  pw.ThemeData? theme;
  try {
    theme = pw.ThemeData.withFont(
      base: await PdfGoogleFonts.robotoRegular(),
      bold: await PdfGoogleFonts.robotoBold(),
      italic: await PdfGoogleFonts.robotoItalic(),
      boldItalic: await PdfGoogleFonts.robotoBoldItalic(),
    );
  } catch (_) {
    // Offline font download failed: the built-in Helvetica still produces a valid PDF.
  }
  final body = html_parser.parse(html).body!;
  final doc = pw.Document(title: footer, creator: 'Zoltan Visa agreements');
  doc.addPage(pw.MultiPage(
    pageTheme: pw.PageTheme(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.fromLTRB(51, 57, 51, 62),
      theme: theme,
    ),
    footer: (c) => pw.Row(mainAxisAlignment: pw.MainAxisAlignment.spaceBetween, children: [
      pw.Text(footer, style: const pw.TextStyle(fontSize: 7.5, color: PdfColors.grey700)),
      pw.Text('Page ${c.pageNumber} of ${c.pagesCount}', style: const pw.TextStyle(fontSize: 7.5, color: PdfColors.grey700)),
    ]),
    build: (_) => _blocks(body.nodes),
  ));
  return doc.save();
}

const _base = pw.TextStyle(fontSize: 10.5, lineSpacing: 2);

pw.TextAlign? _align(dom.Element e) {
  final m = RegExp(r'text-align:\s*(\w+)').firstMatch(e.attributes['style'] ?? '');
  return switch (m?.group(1)) {
    'center' => pw.TextAlign.center,
    'right' => pw.TextAlign.right,
    _ => null,
  };
}

List<pw.Widget> _blocks(List<dom.Node> nodes) {
  final out = <pw.Widget>[];
  for (final n in nodes) {
    if (n is dom.Text) {
      if (n.text.trim().isNotEmpty) out.add(_para(pw.TextSpan(text: _clean(n.text)), null));
    } else if (n is dom.Element) {
      switch (n.localName) {
        case 'h1':
          out.add(pw.Padding(padding: const pw.EdgeInsets.only(bottom: 10), child: _para(_inline(n.nodes, pw.TextStyle(fontSize: 17, fontWeight: pw.FontWeight.bold)), _align(n))));
        case 'h2':
          out.add(pw.Padding(padding: const pw.EdgeInsets.only(top: 10, bottom: 4), child: _para(_inline(n.nodes, pw.TextStyle(fontSize: 12.5, fontWeight: pw.FontWeight.bold)), _align(n))));
        case 'p':
          out.add(pw.Padding(padding: const pw.EdgeInsets.only(bottom: 6), child: _para(_inline(n.nodes, _base), _align(n))));
        case 'ol' || 'ul':
          var i = 0;
          for (final li in n.children.where((c) => c.localName == 'li')) {
            i++;
            out.add(pw.Padding(
              padding: const pw.EdgeInsets.only(bottom: 2, left: 6),
              child: pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
                pw.SizedBox(width: 20, child: pw.Text(n.localName == 'ol' ? '$i.' : '•', style: _base)),
                pw.Expanded(child: _para(_inline(li.nodes, _base), null)),
              ]),
            ));
          }
          out.add(pw.SizedBox(height: 6));
        case 'table':
          out.add(pw.Padding(padding: const pw.EdgeInsets.only(bottom: 8), child: _table(n)));
        default:
          out.addAll(_blocks(n.nodes));
      }
    }
  }
  return out;
}

pw.Widget _para(pw.InlineSpan s, pw.TextAlign? a) => pw.RichText(text: s, textAlign: a ?? pw.TextAlign.left);

String _clean(String s) => s.replaceAll(RegExp(r'\s+'), ' ');

pw.TextSpan _inline(List<dom.Node> nodes, pw.TextStyle style) {
  final kids = <pw.InlineSpan>[];
  for (final n in nodes) {
    if (n is dom.Text) {
      kids.add(pw.TextSpan(text: _clean(n.text)));
    } else if (n is dom.Element) {
      switch (n.localName) {
        case 'br':
          kids.add(const pw.TextSpan(text: '\n'));
        case 'strong' || 'b':
          kids.add(_inline(n.nodes, style.copyWith(fontWeight: pw.FontWeight.bold)));
        case 'em' || 'i':
          kids.add(_inline(n.nodes, style.copyWith(fontStyle: pw.FontStyle.italic)));
        default:
          kids.add(_inline(n.nodes, style));
      }
    }
  }
  return pw.TextSpan(style: style, children: kids);
}

pw.Widget _table(dom.Element t) {
  final rows = t.querySelectorAll('tr');
  if (rows.isEmpty) return pw.SizedBox();
  final first = rows.first.children;
  final widths = <int, pw.TableColumnWidth>{
    for (var i = 0; i < first.length; i++)
      i: pw.FlexColumnWidth(double.tryParse(RegExp(r'width:\s*(\d+(?:\.\d+)?)%').firstMatch(first[i].attributes['style'] ?? '')?.group(1) ?? '') ?? 100 / first.length),
  };
  return pw.Table(
    border: pw.TableBorder.all(color: PdfColors.grey500, width: 0.5),
    columnWidths: widths,
    children: [
      for (final r in rows)
        pw.TableRow(children: [
          for (final c in r.children)
            pw.Padding(
              padding: const pw.EdgeInsets.all(4),
              child: _para(_inline(c.nodes, c.localName == 'th' ? _base.copyWith(fontWeight: pw.FontWeight.bold) : _base), _align(c)),
            ),
        ]),
    ],
  );
}
