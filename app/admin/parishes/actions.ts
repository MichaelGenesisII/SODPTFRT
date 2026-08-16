"use server";

import { revalidatePath } from "next/cache";
import {
  isNationalAdmin,
  requireSessionAdmin,
  type AdminProfile,
} from "@/lib/admin/auth";
import {
  formatBatchLabel,
  slugifyParishName,
  type Batch,
  type Parish,
} from "@/lib/parishes";
import { publicActionMessage } from "@/lib/safe-action-message";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type ParishActionResult = {
  ok: boolean;
  message: string;
  parishId?: string;
};

function unauthorized(): ParishActionResult {
  return { ok: false, message: "Unauthorized." };
}

function assertCanManageParish(
  actor: AdminProfile,
  parishId: string | null,
): ParishActionResult | null {
  if (isNationalAdmin(actor)) return null;
  if (!actor.parish_id) {
    return { ok: false, message: "Your desk has no parish assigned." };
  }
  if (!parishId || actor.parish_id !== parishId) {
    return { ok: false, message: "Outside your parish." };
  }
  return null;
}

/** Active parishes for the public enrol form. */
export async function listActiveParishesForEnrol(): Promise<
  Pick<Parish, "id" | "name" | "region">[]
> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("parishes")
    .select("id, name, region")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    console.error("[parishes enrol]", error.message);
    return [];
  }
  return data ?? [];
}

/** Open batches for a parish (enrol form). */
export async function listOpenBatchesForEnrol(
  parishId: string,
): Promise<Pick<Batch, "id" | "name" | "year" | "parish_id">[]> {
  if (!parishId) return [];
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("batches")
    .select("id, name, year, parish_id")
    .eq("parish_id", parishId)
    .eq("is_active", true)
    .eq("enrolment_open", true)
    .order("year", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    console.error("[batches enrol]", error.message);
    return [];
  }
  return data ?? [];
}

export async function listParishesForAdmin(): Promise<Parish[]> {
  const actor = await requireSessionAdmin();
  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("parishes")
    .select(
      "id, name, slug, region, is_active, created_at, updated_at",
    )
    .order("name", { ascending: true });

  if (!isNationalAdmin(actor) && actor.parish_id) {
    query = query.eq("id", actor.parish_id);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Parish[];
}

export async function listBatchesForAdmin(
  parishId?: string | null,
): Promise<Batch[]> {
  const actor = await requireSessionAdmin();
  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("batches")
    .select(
      "id, parish_id, name, year, enrolment_open, is_active, created_at, updated_at",
    )
    .order("year", { ascending: false })
    .order("name", { ascending: true });

  const scopeParish = isNationalAdmin(actor)
    ? parishId || null
    : actor.parish_id;

  if (scopeParish) {
    query = query.eq("parish_id", scopeParish);
  } else if (!isNationalAdmin(actor)) {
    return [];
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Batch[];
}

export async function createParish(
  formData: FormData,
): Promise<ParishActionResult> {
  try {
    const actor = await requireSessionAdmin();
    if (!isNationalAdmin(actor)) {
      return { ok: false, message: "Only national admins can create parishes." };
    }

    const name = String(formData.get("name") ?? "").trim();
    const region = String(formData.get("region") ?? "").trim() || null;
    if (name.length < 2) {
      return { ok: false, message: "Parish name is required." };
    }

    let slug = slugifyParishName(name);
    if (!slug) slug = `parish-${Date.now()}`;

    const service = createServiceSupabaseClient();
    const now = new Date().toISOString();

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const trySlug = attempt === 0 ? slug : `${slug}-${attempt + 1}`;
      const { data: created, error } = await service
        .from("parishes")
        .insert({
          name,
          slug: trySlug,
          region,
          is_active: true,
          created_at: now,
          updated_at: now,
        })
        .select("id")
        .maybeSingle();
      if (!error && created?.id) {
        revalidatePath("/admin/parishes");
        revalidatePath("/enrol");
        return {
          ok: true,
          message: `${name} is on the UK map. Add a batch to open enrolment.`,
          parishId: created.id,
        };
      }
      if (error && error.code !== "23505" && !/duplicate|unique/i.test(error.message)) {
        return { ok: false, message: publicActionMessage(error.message) };
      }
    }
    return { ok: false, message: "Could not create a unique parish slug." };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    return {
      ok: false,
      message: publicActionMessage(error),
    };
  }
}

export async function updateParish(
  formData: FormData,
): Promise<ParishActionResult> {
  try {
    const actor = await requireSessionAdmin();
    if (!isNationalAdmin(actor)) {
      return { ok: false, message: "Only national admins can edit parishes." };
    }

    const id = String(formData.get("id") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    const region = String(formData.get("region") ?? "").trim() || null;
    const isActive = String(formData.get("isActive") ?? "1") === "1";

    if (!id || name.length < 2) {
      return { ok: false, message: "Parish id and name are required." };
    }

    const supabase = await createServerSupabaseClient();
    const { error } = await supabase
      .from("parishes")
      .update({
        name,
        region,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) return { ok: false, message: publicActionMessage(error.message) };

    revalidatePath("/admin/parishes");
    revalidatePath("/enrol");
    return {
      ok: true,
      message: `${name} updated — ${isActive ? "listed on enrol" : "retired from enrol (existing students keep access)"}.`,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    return {
      ok: false,
      message: publicActionMessage(error),
    };
  }
}

export async function deleteParish(id: string): Promise<ParishActionResult> {
  try {
    const actor = await requireSessionAdmin();
    if (!isNationalAdmin(actor)) {
      return { ok: false, message: "Only national admins can delete parishes." };
    }
    if (!id) return { ok: false, message: "Parish id is required." };

    const service = createServiceSupabaseClient();
    const { data: parish } = await service
      .from("parishes")
      .select("name")
      .eq("id", id)
      .maybeSingle();

    const { count: enrolCount } = await service
      .from("enrolments")
      .select("*", { count: "exact", head: true })
      .eq("parish_id", id);

    if ((enrolCount ?? 0) > 0) {
      return {
        ok: false,
        message: "Cannot delete a parish that still has enrolments.",
      };
    }

    const { count: adminCount } = await service
      .from("admin_profiles")
      .select("*", { count: "exact", head: true })
      .eq("parish_id", id);

    if ((adminCount ?? 0) > 0) {
      return {
        ok: false,
        message:
          "Reassign or remove parish desk admins first, then delete the parish.",
      };
    }

    const { error } = await service.from("parishes").delete().eq("id", id);
    if (error) {
      if (/foreign key|restrict/i.test(error.message)) {
        return {
          ok: false,
          message:
            "Remove or reassign batches and desk admins first, then delete the parish.",
        };
      }
      return { ok: false, message: publicActionMessage(error.message) };
    }

    revalidatePath("/admin/parishes");
    revalidatePath("/enrol");
    return {
      ok: true,
      message: `${parish?.name ?? "Parish"} removed from the directory.`,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    return {
      ok: false,
      message: publicActionMessage(error),
    };
  }
}

export async function createBatch(
  formData: FormData,
): Promise<ParishActionResult> {
  try {
    const actor = await requireSessionAdmin();
    let parishId = String(formData.get("parishId") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const yearRaw = String(formData.get("year") ?? "").trim();
    const year = Number.parseInt(yearRaw, 10);
    const enrolmentOpen = String(formData.get("enrolmentOpen") ?? "") === "1";

    if (!isNationalAdmin(actor)) {
      if (!actor.parish_id) {
        return { ok: false, message: "Your desk has no parish assigned." };
      }
      parishId = actor.parish_id;
    }

    const denied = assertCanManageParish(actor, parishId);
    if (denied) return denied;

    if (!parishId || name.length < 2) {
      return { ok: false, message: "Parish and batch name are required." };
    }
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      return { ok: false, message: "Enter a valid year." };
    }

    const supabase = await createServerSupabaseClient();
    const now = new Date().toISOString();
    const { error } = await supabase.from("batches").insert({
      parish_id: parishId,
      name,
      year,
      enrolment_open: enrolmentOpen,
      is_active: true,
      created_at: now,
      updated_at: now,
    });

    if (error) {
      if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
        return {
          ok: false,
          message: "That batch name already exists for this parish.",
        };
      }
      return { ok: false, message: publicActionMessage(error.message) };
    }

    revalidatePath("/admin/parishes");
    revalidatePath("/enrol");
    return {
      ok: true,
      message: enrolmentOpen
        ? `${formatBatchLabel({ name, year })} created — enrolment is open on the form.`
        : `${formatBatchLabel({ name, year })} created. Open enrolment when you’re ready.`,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    return {
      ok: false,
      message: publicActionMessage(error),
    };
  }
}

export async function updateBatch(
  formData: FormData,
): Promise<ParishActionResult> {
  try {
    const actor = await requireSessionAdmin();
    const id = String(formData.get("id") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    const year = Number.parseInt(String(formData.get("year") ?? ""), 10);
    const enrolmentOpen = String(formData.get("enrolmentOpen") ?? "") === "1";
    const isActive = String(formData.get("isActive") ?? "1") === "1";

    if (!id || name.length < 2) {
      return { ok: false, message: "Batch id and name are required." };
    }
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      return { ok: false, message: "Enter a valid year." };
    }

    const supabase = await createServerSupabaseClient();
    const { data: existing } = await supabase
      .from("batches")
      .select("parish_id")
      .eq("id", id)
      .maybeSingle();

    if (!existing) return { ok: false, message: "Batch not found." };

    const denied = assertCanManageParish(actor, existing.parish_id);
    if (denied) return denied;

    const { error } = await supabase
      .from("batches")
      .update({
        name,
        year,
        enrolment_open: enrolmentOpen,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) return { ok: false, message: publicActionMessage(error.message) };

    revalidatePath("/admin/parishes");
    revalidatePath("/enrol");
    return {
      ok: true,
      message: `${formatBatchLabel({ name, year })} saved · ${
        enrolmentOpen ? "enrolment open" : "enrolment closed"
      } · ${isActive ? "listed" : "retired from enrol"}.`,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    return {
      ok: false,
      message: publicActionMessage(error),
    };
  }
}

export async function setBatchEnrolmentOpen(
  batchId: string,
  open: boolean,
): Promise<ParishActionResult> {
  try {
    const actor = await requireSessionAdmin();
    const supabase = await createServerSupabaseClient();
    const { data: existing } = await supabase
      .from("batches")
      .select("parish_id, name, year")
      .eq("id", batchId)
      .maybeSingle();

    if (!existing) return { ok: false, message: "Batch not found." };
    const denied = assertCanManageParish(actor, existing.parish_id);
    if (denied) return denied;

    const { error } = await supabase
      .from("batches")
      .update({
        enrolment_open: open,
        updated_at: new Date().toISOString(),
      })
      .eq("id", batchId);

    if (error) return { ok: false, message: publicActionMessage(error.message) };

    revalidatePath("/admin/parishes");
    revalidatePath("/enrol");
    return {
      ok: true,
      message: open
        ? `${formatBatchLabel(existing)} enrolment open — applicants can select it.`
        : `${formatBatchLabel(existing)} enrolment closed — hidden from the form; enrolled students keep access.`,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    return {
      ok: false,
      message: publicActionMessage(error),
    };
  }
}

/** Close enrolment and retire from the enrol form in one step. Students keep portal access. */
export async function retireBatch(batchId: string): Promise<ParishActionResult> {
  try {
    const actor = await requireSessionAdmin();
    const supabase = await createServerSupabaseClient();
    const { data: existing } = await supabase
      .from("batches")
      .select("parish_id, name, year")
      .eq("id", batchId)
      .maybeSingle();

    if (!existing) return { ok: false, message: "Batch not found." };
    const denied = assertCanManageParish(actor, existing.parish_id);
    if (denied) return denied;

    const { error } = await supabase
      .from("batches")
      .update({
        enrolment_open: false,
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", batchId);

    if (error) return { ok: false, message: publicActionMessage(error.message) };

    revalidatePath("/admin/parishes");
    revalidatePath("/enrol");
    return {
      ok: true,
      message: `${formatBatchLabel(existing)} retired — hidden from enrol; enrolled students keep access.`,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    return {
      ok: false,
      message: publicActionMessage(error),
    };
  }
}

export async function deleteBatch(id: string): Promise<ParishActionResult> {
  try {
    const actor = await requireSessionAdmin();
    const service = createServiceSupabaseClient();
    const { data: existing } = await service
      .from("batches")
      .select("parish_id")
      .eq("id", id)
      .maybeSingle();

    if (!existing) return { ok: false, message: "Batch not found." };
    const denied = assertCanManageParish(actor, existing.parish_id);
    if (denied) return denied;

    const { count } = await service
      .from("enrolments")
      .select("*", { count: "exact", head: true })
      .eq("batch_id", id);

    if ((count ?? 0) > 0) {
      return {
        ok: false,
        message: "Cannot delete a batch that still has enrolments.",
      };
    }

    const { error } = await service.from("batches").delete().eq("id", id);
    if (error) return { ok: false, message: publicActionMessage(error.message) };

    revalidatePath("/admin/parishes");
    revalidatePath("/enrol");
    return { ok: true, message: "Batch removed." };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    return {
      ok: false,
      message: publicActionMessage(error),
    };
  }
}
