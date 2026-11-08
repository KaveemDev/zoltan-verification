import { randomUUID } from 'node:crypto';

/** Tiny in-memory stand-in for the Prisma calls the signing flow makes. Test-only. */
type Row = Record<string, unknown>;

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([k, cond]) => {
    if (k === 'OR') return (cond as Row[]).some((w) => matches(row, w));
    const v = row[k];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as Row;
      if ('in' in c) return (c.in as unknown[]).includes(v);
      if ('lte' in c) return v != null && (v as number) <= (c.lte as number);
      if ('path' in c) return (v as Row | null)?.[(c.path as string[])[0]!] === c.equals;
      if ('not' in c) return v !== c.not;
      if ('lt' in c) return (v as number) < (c.lt as number);
    }
    return (v ?? null) === (cond ?? null);
  });
}

function apply(row: Row, data: Row) {
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue; // Prisma ignores undefined fields
    row[k] =
      v && typeof v === 'object' && 'increment' in v
        ? (row[k] as number) + (v as { increment: number }).increment
        : v;
  }
}

// Like Prisma: return snapshots, not live rows.
function pick(row: Row, select?: Record<string, boolean>) {
  return select ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k]])) : { ...row };
}

// Prisma.DbNull is stored as SQL NULL and read back as null.
const unwrapNulls = (data: Row) =>
  Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, v?.constructor?.name === 'DbNull' ? null : v]),
  );

type OrderBy = Record<string, 'asc' | 'desc'> | Record<string, 'asc' | 'desc'>[];

/** `defaults` stands in for column defaults the database would apply. */
function table(rows: Row[], sortKey: string, defaults: Row = {}) {
  const sorted = (where?: Row, orderBy?: OrderBy) => {
    const keys = [orderBy ?? { [sortKey]: 'asc' }].flat().flatMap((o) => Object.entries(o));
    return rows
      .filter((r) => matches(r, where))
      .sort((a, b) => {
        for (const [key, dir] of keys) {
          if (a[key] === b[key]) continue;
          return ((a[key] as number) > (b[key] as number) ? 1 : -1) * (dir === 'desc' ? -1 : 1);
        }
        return 0;
      });
  };
  return {
    rows,
    findUnique: async ({ where, select }: { where: Row; select?: Record<string, boolean> }) => {
      const r = rows.find((x) => matches(x, where));
      return r ? pick(r, select) : null;
    },
    findUniqueOrThrow: async ({ where }: { where: Row }) => {
      const r = rows.find((x) => matches(x, where));
      if (!r) throw new Error('not found');
      return { ...r };
    },
    findFirst: async ({
      where,
      orderBy,
      select,
    }: {
      where?: Row;
      orderBy?: OrderBy;
      select?: Record<string, boolean>;
    }) => {
      const r = sorted(where, orderBy)[0];
      return r ? pick(r, select) : null;
    },
    findMany: async ({
      where,
      select,
      orderBy,
      skip = 0,
      take,
    }: {
      where?: Row;
      select?: Record<string, boolean>;
      orderBy?: OrderBy;
      skip?: number;
      take?: number;
    }) =>
      sorted(where, orderBy)
        .slice(skip, take === undefined ? undefined : skip + take)
        .map((r) => pick(r, select)),
    create: async ({ data }: { data: Row }) => {
      const row = {
        id: randomUUID(),
        createdAt: new Date(),
        ...defaults,
        ...unwrapNulls(data),
      };
      rows.push(row);
      return { ...row };
    },
    update: async ({ where, data }: { where: Row; data: Row }) => {
      const r = rows.find((x) => matches(x, where));
      if (!r) throw new Error('not found');
      apply(r, data);
      return { ...r };
    },
    deleteMany: async ({ where }: { where: Row }) => {
      const keep = rows.filter((x) => !matches(x, where));
      const count = rows.length - keep.length;
      rows.splice(0, rows.length, ...keep);
      return { count };
    },
    count: async ({ where }: { where?: Row } = {}) => rows.filter((x) => matches(x, where)).length,
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const hit = rows.filter((x) => matches(x, where));
      hit.forEach((r) => apply(r, data));
      return { count: hit.length };
    },
  };
}

export function createFakePrisma() {
  const agreement = table([], 'createdAt');
  const findAgreement = agreement.findUnique;
  const db = {
    agreement: {
      ...agreement,
      // Supports the one include the staff detail view uses.
      findUnique: async (args: { where: Row; select?: Record<string, boolean>; include?: Row }) => {
        const a = await findAgreement(args);
        if (!a || !args.include) return a;
        const u = db.user.rows.find((x) => x.id === a.createdById)!;
        return {
          ...a,
          createdBy: { id: u.id, name: u.name },
          auditEvents: db.auditEvent.rows
            .filter((e) => e.agreementId === a.id)
            .sort((x, y) => (x.seq as number) - (y.seq as number)),
        };
      },
    },
    user: table([], 'createdAt', { active: true, role: 'STAFF' }),
    accessLog: (() => {
      const t = table([], 'createdAt');
      // Supports the user include the access-log page uses.
      const findMany = t.findMany;
      return {
        ...t,
        findMany: async (args: Parameters<typeof findMany>[0] & { include?: Row }) =>
          (await findMany(args)).map((r) => {
            if (!args.include) return r;
            const u = db.user.rows.find((x) => x.id === r.userId)!;
            return { ...r, user: { id: u.id, name: u.name } };
          }),
      };
    })(),
    agreementTemplate: table([], 'createdAt'),
    otpChallenge: table([], 'createdAt', { consumedAt: null, attempts: 0 }),
    auditEvent: table([], 'seq'),
    $executeRaw: async () => 0,
    // Both forms: interactive (callback) and batch (array of promises).
    $transaction: async (arg: ((tx: unknown) => unknown) | Promise<unknown>[]) =>
      Array.isArray(arg) ? Promise.all(arg) : arg(db),
  };
  return db;
}
