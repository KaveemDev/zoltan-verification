import { LEGAL_TEXT } from '../../shared/index';
import { useEffect, useRef, useState } from 'react';
import SignaturePad from 'signature_pad';
import { copy } from '../copy';
import { Card, Checkbox, ErrorText, PrimaryButton } from '../ui';

export function SignatureStep({
  onSubmit,
}: {
  onSubmit: (v: { typedName: string; signaturePng: string; declarations: true[] }) => Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [typedName, setTypedName] = useState('');
  // One box per Client Declaration statement; like the paper form, each must be ticked.
  const [ticked, setTicked] = useState(() => LEGAL_TEXT.declarations.map(() => false));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const canvas = canvasRef.current!;
    const pad = new SignaturePad(canvas, { minWidth: 1, maxWidth: 2.5, penColor: '#0b1f4d' });
    padRef.current = pad;
    // Match the canvas to its CSS size at device resolution, or strokes land in the wrong place.
    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const data = pad.toData();
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext('2d')!.scale(ratio, ratio);
      pad.clear();
      pad.fromData(data);
    };
    resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      pad.off();
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const pad = padRef.current!;
    if (typedName.trim().length < 2) return setError(copy.sign.needName);
    if (pad.isEmpty()) return setError(copy.sign.needSignature);
    if (!ticked.every(Boolean)) return setError(copy.sign.needDeclarations);
    setBusy(true);
    setError('');
    try {
      await onSubmit({
        typedName: typedName.trim(),
        signaturePng: pad.toDataURL('image/png'),
        declarations: ticked.map(() => true as const),
      });
    } catch (err) {
      setError((err as Error).message || copy.common.genericError);
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <h1 className="text-2xl font-semibold">{copy.sign.title}</h1>
        <fieldset className="space-y-2">
          <legend className="mb-1 font-semibold">{copy.sign.declarationsTitle}</legend>
          <p className="text-sm text-slate-600">{copy.sign.declarationsHint}</p>
          {LEGAL_TEXT.declarations.map((text, i) => (
            <Checkbox
              key={text}
              id={`declaration-${i}`}
              checked={ticked[i]!}
              onChange={(v) => setTicked((t) => t.map((x, j) => (j === i ? v : x)))}
            >
              {text}
            </Checkbox>
          ))}
        </fieldset>
        <p className="text-slate-700">{LEGAL_TEXT.signatureNotice}</p>
        <div>
          <label htmlFor="typedName" className="block font-medium">
            {copy.sign.nameLabel}
          </label>
          <input
            id="typedName"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            autoComplete="name"
            className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg"
          />
        </div>
        <div>
          <div className="flex items-end justify-between">
            <span id="pad-label" className="font-medium">
              {copy.sign.padLabel}
            </span>
            <button
              type="button"
              onClick={() => padRef.current?.clear()}
              className="px-2 py-1 text-brand-600 underline"
            >
              {copy.sign.clear}
            </button>
          </div>
          <p className="text-sm text-slate-600">{copy.sign.padHint}</p>
          <canvas
            ref={canvasRef}
            aria-labelledby="pad-label"
            className="mt-1 h-48 w-full touch-none rounded-xl border-2 border-dashed border-slate-400 bg-white"
          />
        </div>
        <ErrorText>{error}</ErrorText>
        <PrimaryButton type="submit" disabled={busy}>
          {busy ? copy.sign.submitting : copy.sign.submit}
        </PrimaryButton>
      </form>
    </Card>
  );
}
