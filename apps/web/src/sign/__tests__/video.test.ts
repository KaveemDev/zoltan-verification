import { afterEach, describe, expect, it, vi } from 'vitest';
import { fillLegal, LEGAL_TEXT } from '@app/shared';
import { fill } from '../copy';
import { classifyCameraError, pickMimeType, sha256Hex } from '../video';

const browser = (supported: string[] | null, getUserMedia = true) => {
  vi.stubGlobal(
    'MediaRecorder',
    supported ? { isTypeSupported: (t: string) => supported.includes(t) } : undefined, // undefined: no MediaRecorder at all
  );
  vi.stubGlobal('navigator', {
    mediaDevices: getUserMedia ? { getUserMedia: () => undefined } : undefined,
  });
};

afterEach(() => vi.unstubAllGlobals());

describe('pickMimeType', () => {
  it('prefers VP9 WebM, then WebM, then MP4 (iOS Safari)', () => {
    browser(['video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4']);
    expect(pickMimeType()).toBe('video/webm;codecs=vp9,opus');
    browser(['video/webm']);
    expect(pickMimeType()).toBe('video/webm');
    browser(['video/mp4']);
    expect(pickMimeType()).toBe('video/mp4');
  });

  it('returns null when recording is impossible', () => {
    browser([]);
    expect(pickMimeType()).toBeNull();
    browser(null);
    expect(pickMimeType()).toBeNull();
    browser(['video/mp4'], false); // e.g. plain http on a phone: no mediaDevices
    expect(pickMimeType()).toBeNull();
  });
});

describe('classifyCameraError', () => {
  const err = (name: string) => Object.assign(new Error(name), { name });
  it('maps getUserMedia errors to the help screen to show', () => {
    expect(classifyCameraError(err('NotAllowedError'))).toBe('denied');
    expect(classifyCameraError(err('SecurityError'))).toBe('denied');
    expect(classifyCameraError(err('NotReadableError'))).toBe('busy');
    expect(classifyCameraError(err('NotFoundError'))).toBe('unsupported');
    expect(classifyCameraError(undefined)).toBe('unsupported');
  });
});

describe('sha256Hex', () => {
  it('matches the standard SHA-256 test vector', async () => {
    expect(await sha256Hex(new Blob(['abc']))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('copy', () => {
  it('fills known placeholders and leaves unknown ones visible', () => {
    expect(fill('Hi {name}, {missing}', { name: 'Asha' })).toBe('Hi Asha, {missing}');
    expect(fillLegal(LEGAL_TEXT.recordingNotice, { businessName: 'Acme' })).toContain(
      'Acme processes',
    );
  });
});
