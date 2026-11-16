import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AgreementDetail,
  AgreementDraft,
  AgreementListItem,
  FileUrl,
  IntegrityResult,
  CreateAgreementInput,
  ListAgreementsQuery,
  Paginated,
  TemplateSummary,
} from '../shared/index';
import { useRef } from 'react';
import { buildAgreementPdf } from './agreementPdf';
import { api, API_BASE } from './api';

export function useAgreements(query: ListAgreementsQuery) {
  const params = new URLSearchParams(
    Object.entries(query).filter(([, v]) => v !== undefined && v !== '') as [string, string][],
  );
  return useQuery({
    queryKey: ['agreements', query],
    queryFn: () => api<Paginated<AgreementListItem>>(`/agreements?${params}`),
    placeholderData: keepPreviousData,
  });
}

export function useTemplates() {
  return useQuery({ queryKey: ['templates'], queryFn: () => api<TemplateSummary[]>('/templates') });
}

/**
 * Creates an agreement in two steps: the server saves a draft and returns the filled-in HTML, this
 * browser turns it into the PDF, and uploading the PDF makes the server email the signing link.
 * If the upload fails, pressing the button again retries it with the same draft (no duplicate).
 */
export function useCreateAgreement() {
  const qc = useQueryClient();
  const pending = useRef<{ input: string; draft: AgreementDraft; pdf?: Uint8Array } | null>(null);
  return useMutation({
    mutationFn: async (input: CreateAgreementInput) => {
      const key = JSON.stringify(input);
      if (pending.current?.input !== key) {
        const draft = await api<AgreementDraft>('/agreements', { method: 'POST', body: input });
        pending.current = { input: key, draft };
      }
      const p = pending.current;
      p.pdf ??= await buildAgreementPdf(p.draft.html, p.draft.footer);
      const created = await api<AgreementListItem>(`/agreements/${p.draft.id}/original-pdf`, {
        method: 'POST',
        raw: new Blob([p.pdf as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }),
      });
      pending.current = null;
      return created;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agreements'] }),
  });
}

export function useAgreement(id: string) {
  return useQuery({
    queryKey: ['agreement', id],
    queryFn: () => api<AgreementDetail>(`/agreements/${id}`),
  });
}

/** Staff actions on one agreement; each refreshes the detail and the list. */
export function useAgreementActions(id: string) {
  const qc = useQueryClient();
  const done = (detail: AgreementDetail) => {
    qc.setQueryData(['agreement', id], detail);
    qc.invalidateQueries({ queryKey: ['agreements'] });
  };
  return {
    cancel: useMutation({
      mutationFn: (reason?: string) =>
        api<AgreementDetail>(`/agreements/${id}/cancel`, { method: 'POST', body: { reason } }),
      onSuccess: done,
    }),
    extend: useMutation({
      mutationFn: (hours: number) =>
        api<AgreementDetail>(`/agreements/${id}/extend`, { method: 'POST', body: { hours } }),
      onSuccess: done,
    }),
    resend: useMutation({
      mutationFn: () =>
        api<{ sent: boolean; agreement: AgreementDetail }>(`/agreements/${id}/resend`, {
          method: 'POST',
        }),
      onSuccess: (r) => done(r.agreement),
    }),
    verify: useMutation({
      mutationFn: () =>
        api<IntegrityResult>(`/agreements/${id}/verify-integrity`, { method: 'POST' }),
    }),
  };
}

export const getVideoUrl = (id: string) => api<FileUrl>(`/agreements/${id}/video-url`);
export const getPdfUrl = (id: string, which: 'original' | 'signed', download = false) =>
  api<FileUrl>(`/agreements/${id}/pdf-url?which=${which}&download=${download ? 1 : 0}`);
export const evidenceBundleHref = (id: string) => `${API_BASE}/agreements/${id}/evidence-bundle`;
