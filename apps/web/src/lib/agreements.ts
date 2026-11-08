import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AgreementDetail,
  AgreementListItem,
  FileUrl,
  IntegrityResult,
  CreateAgreementInput,
  ListAgreementsQuery,
  Paginated,
  TemplateSummary,
} from '@app/shared';
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

export function useCreateAgreement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAgreementInput) =>
      api<AgreementListItem>('/agreements', { method: 'POST', body: input }),
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
