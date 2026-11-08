import { z } from 'zod';

// Keep these in sync with the Prisma enums in apps/api/prisma/schema.prisma.
export const Role = z.enum(['ADMIN', 'STAFF']);
export type Role = z.infer<typeof Role>;

export const AgreementStatus = z.enum([
  'DRAFT',
  'SENT',
  'OPENED',
  'VERIFIED',
  'SIGNED',
  'EXPIRED',
  'CANCELLED',
]);
export type AgreementStatus = z.infer<typeof AgreementStatus>;

export const PackageType = z.enum(['VISA', 'TRAVEL', 'BOTH']);
export type PackageType = z.infer<typeof PackageType>;

/** E.164: +, country code, up to 15 digits total. */
export const e164 = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, 'Use international format, e.g. +919876543210');

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, 'Password is required').max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const meSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: Role,
});
export type Me = z.infer<typeof meSchema>;

export const AuditEventType = z.enum([
  'CREATED',
  'MESSAGE_SENT',
  'MESSAGE_FAILED',
  'OPENED',
  'OTP_SENT',
  'OTP_FAILED',
  'OTP_VERIFIED',
  'AGREEMENT_VIEWED',
  'RECORDING_CONSENT_GIVEN',
  'VIDEO_RECORDED',
  'SIGNED',
  'RESENT',
  'EXPIRY_EXTENDED',
  'CANCELLED',
  'EXPIRED',
]);
export type AuditEventType = z.infer<typeof AuditEventType>;

export const createAgreementSchema = z.object({
  customerName: z.string().trim().min(2, 'Enter the full name').max(120),
  customerPhone: e164,
  // The signing link is sent by email.
  customerEmail: z.string().trim().toLowerCase().email('Enter a valid email'),
  packageType: PackageType,
  destination: z.string().trim().min(2, 'Enter the destination country').max(80),
  price: z.coerce
    .number<string | number>({ error: 'Enter the price' })
    .positive('Price must be more than 0')
    .max(100_000_000)
    .multipleOf(0.01, 'At most 2 decimal places'),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Use a 3-letter code, e.g. INR'),
  templateId: z.string().min(1, 'Choose a template'),
  notes: z.string().trim().max(2000).optional(),
});
export type CreateAgreementInput = z.input<typeof createAgreementSchema>;
export type CreateAgreement = z.output<typeof createAgreementSchema>;

export const listAgreementsQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: AgreementStatus.optional(),
  packageType: PackageType.optional(),
  /** Created on or after this date (YYYY-MM-DD, IST). */
  from: z.iso.date().optional(),
  /** Created on or before this date (YYYY-MM-DD, IST). */
  to: z.iso.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListAgreementsQuery = z.input<typeof listAgreementsQuery>;

export interface AgreementListItem {
  id: string;
  customerName: string;
  customerPhone: string;
  packageType: PackageType;
  destination: string;
  status: AgreementStatus;
  createdAt: string;
  tokenExpiresAt: string | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TemplateSummary {
  id: string;
  name: string;
  version: number;
}

export * from './legal';

// ---------- Public signing flow ----------

export const SignErrorCode = z.enum([
  'LINK_INVALID',
  'LINK_EXPIRED',
  'LINK_CANCELLED',
  'ALREADY_SIGNED',
  'SESSION_EXPIRED',
  'OTP_COOLDOWN',
  'OTP_EXPIRED',
  'OTP_INVALID',
  'OTP_LOCKED',
  'STEP_MISSING',
  'LEGAL_TEXT_CHANGED',
  'RATE_LIMITED',
  'VIDEO_MISMATCH',
]);
export type SignErrorCode = z.infer<typeof SignErrorCode>;

/** Coarse device details sent by the browser in the X-Device-Info header (JSON). */
export const deviceInfoSchema = z.object({
  screen: z.string().max(20).optional(),
  dpr: z.number().max(10).optional(),
  platform: z.string().max(60).optional(),
  language: z.string().max(35).optional(),
  timezone: z.string().max(60).optional(),
});
export type DeviceInfo = z.infer<typeof deviceInfoSchema>;

export type CodeChannel = 'sms' | 'email';

export interface PublicAgreementInfo {
  businessName: string;
  customerName: string;
  /** Where the one-time code goes: SMS for countries in SMS_COUNTRY_CODES, email otherwise. */
  codeChannel: CodeChannel;
  /** Masked destination, e.g. "••••3210" or "a•••@gmail.com". */
  codeDestination: string;
  packageType: PackageType;
  destination: string;
  expiresAt: string;
}

export interface OtpSendResult {
  expiresAt: string;
  resendAvailableAt: string;
}

export const otpVerifySchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export interface OtpVerifyResult {
  sessionToken: string;
  expiresAt: string;
}

export interface SigningDocument {
  pdfUrl: string;
  packageType: PackageType;
  destination: string;
  price: string;
  currency: string;
  progress: { viewed: boolean; recordingConsented: boolean; videoRecorded: boolean };
}

export const signEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('AGREEMENT_VIEWED'),
    pagesViewed: z.number().int().min(1).max(500),
    totalPages: z.number().int().min(1).max(500),
    secondsOnPage: z.number().min(0).max(86_400),
  }),
  z.object({
    type: z.literal('RECORDING_CONSENT_GIVEN'),
    legalTextVersion: z.string().max(40),
  }),
]);
export type SignEvent = z.infer<typeof signEventSchema>;

export const completeSigningSchema = z.object({
  typedName: z.string().trim().min(2, 'Type your full name').max(120),
  /** PNG data URL from the signature pad. */
  signaturePng: z
    .string()
    .max(400_000)
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/, 'Draw your signature'),
  agreed: z.literal(true, { error: 'Please confirm you agree' }),
  legalTextVersion: z.string().max(40),
});
export type CompleteSigning = z.infer<typeof completeSigningSchema>;

export interface CompleteSigningResult {
  agreementId: string;
  signedAt: string;
}

// ---------- Selfie video ----------

export const VIDEO_LIMITS = {
  minSeconds: 4,
  maxSeconds: 15,
  minBytes: 10_000,
  maxBytes: 60 * 1024 * 1024,
} as const;

export const videoPresignSchema = z.object({
  /** Full recorder MIME type, e.g. "video/webm;codecs=vp9,opus" or "video/mp4". */
  mimeType: z
    .string()
    .max(100)
    .regex(/^video\/(webm|mp4)(;[\w=.,\s-]*)?$/i, 'Unsupported video format'),
  sizeBytes: z.number().int().min(VIDEO_LIMITS.minBytes).max(VIDEO_LIMITS.maxBytes),
  // A little slack around 4–15 s for recorder start/stop timing.
  durationSec: z
    .number()
    .min(VIDEO_LIMITS.minSeconds - 0.5)
    .max(VIDEO_LIMITS.maxSeconds + 2),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type VideoPresign = z.infer<typeof videoPresignSchema>;

export interface VideoPresignResult {
  uploadUrl: string;
  /** Exact headers the PUT must send. */
  headers: { 'Content-Type': string };
  uploadId: string;
  expiresAt: string;
}

export const videoConfirmSchema = z.object({ uploadId: z.string().min(1).max(2000) });

// ---------- Staff: agreement detail ----------

export interface AuditEventView {
  id: string;
  seq: number;
  type: string;
  ip: string | null;
  userAgent: string | null;
  deviceInfo: unknown;
  metadata: unknown;
  createdAt: string;
  hash: string;
}

export interface AgreementDetail extends AgreementListItem {
  customerEmail: string | null;
  price: string;
  currency: string;
  notes: string | null;
  templateId: string;
  templateVersion: number;
  consentTextVersion: string | null;
  createdBy: { id: string; name: string };
  signedAt: string | null;
  retentionDueAt: string | null;
  purgedAt: string | null;
  originalPdfSha256: string | null;
  signedPdfSha256: string | null;
  hasVideo: boolean;
  videoSha256: string | null;
  videoMimeType: string | null;
  videoDurationSec: number | null;
  events: AuditEventView[];
}

export const extendExpirySchema = z.object({
  hours: z
    .number()
    .int()
    .min(1)
    .max(24 * 30),
});

export const cancelSchema = z.object({ reason: z.string().trim().max(500).optional() });

export const pdfUrlQuery = z.object({
  which: z.enum(['original', 'signed']).default('signed'),
  download: z.enum(['0', '1']).default('0'),
});

export interface FileUrl {
  url: string;
  expiresAt: string;
}

export interface IntegrityCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface IntegrityResult {
  ok: boolean;
  checkedAt: string;
  checks: IntegrityCheck[];
}

// ---------- Admin ----------

export const passwordSchema = z.string().min(12, 'At least 12 characters').max(200);

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  role: Role,
  password: passwordSchema,
});
export type CreateUser = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    role: Role,
    active: z.boolean(),
    password: passwordSchema,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateUser = z.infer<typeof updateUserSchema>;

export interface UserView {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
}

export const createTemplateSchema = z.object({
  name: z.string().trim().min(3).max(100),
  bodyHtml: z.string().min(20).max(200_000),
});
export type CreateTemplate = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = z.object({ active: z.boolean() });

export interface TemplateView extends TemplateSummary {
  active: boolean;
  createdAt: string;
  bodyHtml?: string;
}

export interface CreateTemplateResult {
  template: TemplateView;
  /** Placeholders in the HTML that will not be filled in (probably typos). */
  unknownPlaceholders: string[];
}

export const accessLogQuery = z.object({
  agreementId: z.string().max(100).optional(),
  userId: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type AccessLogQuery = z.input<typeof accessLogQuery>;

export interface AccessLogItem {
  id: string;
  user: { id: string; name: string };
  agreementId: string | null;
  action: string;
  ip: string | null;
  createdAt: string;
}

export interface RetentionItem extends AgreementListItem {
  signedAt: string | null;
  retentionDueAt: string;
}

/** Admin must type the agreement ID to confirm a purge. */
export const purgeSchema = z.object({ confirmId: z.string().min(1).max(100) });
