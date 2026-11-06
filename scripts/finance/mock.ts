// In-memory stand-in for the Base44 SDK so the finance engine can be tested offline.
let idc = 0;
export const store: Record<string, any[]> = {};
function match(r: any, q: any): boolean {
  return Object.entries(q || {}).every(([k, v]: any) => (v && typeof v === "object" && "$in" in v ? v.$in.includes(r[k]) : r[k] === v));
}
function entity(name: string) {
  store[name] ||= [];
  return {
    filter: async (q: any, _sort: any, limit = 50, skip = 0) => store[name].filter((r) => match(r, q)).slice(skip, skip + limit).map((r) => ({ ...r })),
    list: async () => store[name].map((r) => ({ ...r })),
    create: async (d: any) => { const r = { ...structuredClone(d), id: `id${++idc}`, created_date: new Date().toISOString() }; store[name].push(r); return { ...r }; },
    bulkCreate: async (arr: any[]) => { for (const d of arr) store[name].push({ ...structuredClone(d), id: `id${++idc}` }); return []; },
    update: async (id: string, d: any) => { const r = store[name].find((x) => x.id === id); Object.assign(r, structuredClone(d)); return { ...r }; },
    delete: async (id: string) => { store[name] = store[name].filter((x) => x.id !== id); },
  };
}
export const entities: any = new Proxy({}, { get: (_, n: string) => entity(n) });
export const sent: any[] = [];
let currentUser: any = { id: "u1", email: "admin@test", role: "admin" };
export function setUser(u: any) { currentUser = u; }
export const createClientFromRequest = () => ({
  auth: { me: async () => currentUser },
  asServiceRole: { entities, integrations: { Core: { SendEmail: async (m: any) => { sent.push(m); } } } },
});

const serve = () => (globalThis as any).__serve;
export async function call(action: string, body: any = {}) {
  const res = await serve()(new Request("http://x", { method: "POST", body: JSON.stringify({ action, ...body }) }));
  return { status: res.status, ...(await res.json()) };
}
let failures = 0;
export const check = (label: string, cond: boolean, extra: any = "") => { console.log((cond ? "PASS " : "FAIL ") + label, cond ? "" : JSON.stringify(extra)); if (!cond) failures++; };
export const done = () => { console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASSED"); if (failures) Deno.exit(1); };
