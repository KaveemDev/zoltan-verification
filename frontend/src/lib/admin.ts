import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AccessLogItem,
  CreateTemplate,
  CreateTemplateResult,
  CreateUser,
  Paginated,
  RetentionItem,
  TemplateView,
  UpdateUser,
  UserView,
} from '../shared/index';
import { api } from './api';

export function useUsers() {
  return useQuery({ queryKey: ['users'], queryFn: () => api<UserView[]>('/users') });
}

export function useUserMutations() {
  const qc = useQueryClient();
  const onSuccess = () => qc.invalidateQueries({ queryKey: ['users'] });
  return {
    create: useMutation({
      mutationFn: (u: CreateUser) => api<UserView>('/users', { method: 'POST', body: u }),
      onSuccess,
    }),
    update: useMutation({
      mutationFn: ({ id, ...body }: UpdateUser & { id: string }) =>
        api<UserView>(`/users/${id}`, { method: 'PATCH', body }),
      onSuccess,
    }),
  };
}

export function useAllTemplates() {
  return useQuery({
    queryKey: ['templates', 'all'],
    queryFn: () => api<TemplateView[]>('/templates?all=1'),
  });
}

export const getTemplate = (id: string) => api<TemplateView>(`/templates/${id}`);

export function useTemplateMutations() {
  const qc = useQueryClient();
  const onSuccess = () => qc.invalidateQueries({ queryKey: ['templates'] });
  return {
    create: useMutation({
      mutationFn: (t: CreateTemplate) =>
        api<CreateTemplateResult>('/templates', { method: 'POST', body: t }),
      onSuccess,
    }),
    setActive: useMutation({
      mutationFn: ({ id, active }: { id: string; active: boolean }) =>
        api<TemplateView>(`/templates/${id}`, { method: 'PATCH', body: { active } }),
      onSuccess,
    }),
  };
}

export function useAccessLog(page: number, agreementId?: string) {
  const q = new URLSearchParams({ page: String(page), ...(agreementId && { agreementId }) });
  return useQuery({
    queryKey: ['access-log', page, agreementId],
    queryFn: () => api<Paginated<AccessLogItem>>(`/access-log?${q}`),
  });
}

export function useRetention() {
  return useQuery({ queryKey: ['retention'], queryFn: () => api<RetentionItem[]>('/retention') });
}

export function usePurge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, confirmId }: { id: string; confirmId: string }) =>
      api<void>(`/retention/${id}/purge`, { method: 'POST', body: { confirmId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['retention'] });
      qc.invalidateQueries({ queryKey: ['agreements'] });
    },
  });
}
