import { API_URL, INTERNAL_API_KEY } from "../constants/env";

// Client for the planned-posts endpoints of api.klaps.space (/socials/plans).
// Every call is best effort: the plan is only a preview for the admin
// panel, so a failure here must never stop publishing.

export type PlanInput = {
  slotKey: string;
  slotAt: string;
  platform: string;
  format: string;
  status: "pending" | "planned" | "skipped";
  reason?: string | null;
  screeningIds: number[];
  caption?: string | null;
};

const headers = () => ({ "x-internal-api-key": INTERNAL_API_KEY ?? "" });

const call = async <T>(path: string, init: RequestInit): Promise<T | null> => {
  if (!API_URL || !INTERNAL_API_KEY) return null;
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      console.warn(`[plans] ${init.method} ${path} -> ${response.status}`);
      return null;
    }
    return response.status === 204 ? (null as T) : ((await response.json()) as T);
  } catch (error) {
    console.warn(`[plans] ${init.method} ${path} failed:`, error instanceof Error ? error.message : error);
    return null;
  }
};

/** Replaces the unpublished plans of [from, to]; returns their ids by slot key. */
export const putPlans = async (from: Date, to: Date, plans: PlanInput[]) => {
  const rows = await call<{ slotKey: string; id: string }[]>("/socials/plans", {
    method: "PUT",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({ from: from.toISOString(), to: to.toISOString(), plans }),
  });
  return new Map((rows ?? []).map((r) => [r.slotKey, r.id]));
};

export const uploadPlanMedia = async (planId: string, position: number, buffer: Buffer) => {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)], { type: "image/jpeg" }), "plan.jpg");
  await call(`/socials/plans/${planId}/media?position=${position}`, {
    method: "POST",
    headers: headers(),
    body: form,
  });
};

/** Outcome of a publish run for its slot (the plan row becomes history). */
export const markPlan = async (body: {
  slotKey: string;
  status: "published" | "skipped" | "failed";
  externalId?: string | null;
  permalink?: string | null;
  reason?: string | null;
}) => {
  await call("/socials/plans", {
    method: "PATCH",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
};
