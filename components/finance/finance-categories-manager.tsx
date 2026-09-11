"use client";

import { useState, useTransition, type FormEvent } from "react";
import {
  createFinanceCategory,
  renameFinanceCategory,
  retireFinanceCategory,
} from "@/app/finance/categories/actions";
import { DeskConfirmModal } from "@/components/ui/desk-confirm-modal";
import { DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { deskError, deskSuccess } from "@/lib/ui/desk-alert";
import type { FinanceCategory } from "@/lib/finance/ledger";

const fieldClass =
  "mt-1.5 w-full border border-stone bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-pine";

export function FinanceCategoriesManager({
  initialCategories,
}: {
  initialCategories: FinanceCategory[];
}) {
  const [pending, startTransition] = useTransition();
  const [categories, setCategories] = useState(initialCategories);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<FinanceCategory | null>(null);
  const [retireTarget, setRetireTarget] = useState<FinanceCategory | null>(
    null,
  );

  const active = categories.filter((c) => !c.retired_at);
  const retired = categories.filter((c) => c.retired_at);

  function onCreate(event: FormEvent) {
    event.preventDefault();
    const form = new FormData();
    form.set("name", name);
    startTransition(async () => {
      const result = await createFinanceCategory(form);
      if (!result.ok) {
        await deskError({ text: result.message });
        return;
      }
      setName("");
      window.location.reload();
    });
  }

  function onRename(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData();
    form.set("id", editing.id);
    form.set("name", name);
    startTransition(async () => {
      const result = await renameFinanceCategory(form);
      if (!result.ok) {
        await deskError({ text: result.message });
        return;
      }
      setCategories(
        categories.map((c) =>
          c.id === editing.id ? { ...c, name: name.trim() } : c,
        ),
      );
      setEditing(null);
      setName("");
    });
  }

  function confirmRetire() {
    if (!retireTarget) return;
    const target = retireTarget;
    setRetireTarget(null);
    const form = new FormData();
    form.set("id", target.id);
    startTransition(async () => {
      const result = await retireFinanceCategory(form);
      if (!result.ok) {
        await deskError({ text: result.message });
        return;
      }
      await deskSuccess({ text: result.message });
      setCategories(
        categories.map((c) =>
          c.id === target.id
            ? { ...c, retired_at: new Date().toISOString() }
            : c,
        ),
      );
    });
  }

  return (
    <div className="relative space-y-8">
      <DeskLoaderOverlay active={pending} label="Saving category…" />

      <section className="border border-stone/80 bg-white/55 px-5 py-6 sm:px-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
          {editing ? "Rename" : "Add category"}
        </p>
        <h2 className="mt-1 font-display text-xl text-pine">
          {editing ? "Rename category" : "New category"}
        </h2>
        <p className="mt-2 text-sm text-ink/55">
          Categories keep the records tidy. Used categories are retired rather than deleted, so old entries keep their meaning.
        </p>
        <form
          onSubmit={editing ? onRename : onCreate}
          className="mt-5 max-w-md space-y-4"
        >
          <label className="block text-sm font-medium text-ink">
            Name
            <input
              required
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={fieldClass}
              placeholder="e.g. Travel"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex min-h-11 items-center justify-center bg-pine px-4 py-2.5 text-sm font-medium text-mist hover:bg-celadon disabled:opacity-60"
            >
              {editing ? "Save name" : "Add category"}
            </button>
            {editing ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setEditing(null);
                  setName("");
                }}
                className="inline-flex min-h-11 items-center justify-center border border-pine/25 px-4 py-2.5 text-sm font-medium text-pine hover:border-pine disabled:opacity-60"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="border border-stone/80 bg-white/55 px-5 py-6 sm:px-6">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
          Active
        </p>
        <h2 className="mt-1 font-display text-xl text-pine">
          {active.length} categor{active.length === 1 ? "y" : "ies"}
        </h2>
        {active.length === 0 ? (
          <p className="mt-4 border border-dashed border-stone bg-white/40 px-4 py-6 text-sm text-ink/55">
            No categories yet. Add one above before you save an entry.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-stone/70 border border-stone/70">
            {active.map((category) => (
              <li
                key={category.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <p className="font-medium text-ink">{category.name}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setEditing(category);
                      setName(category.name);
                    }}
                    className="text-sm font-medium text-pine hover:underline disabled:opacity-60"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setRetireTarget(category)}
                    className="text-sm font-medium text-red-800 hover:underline disabled:opacity-60"
                  >
                    Retire
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {retired.length ? (
        <section className="border border-stone/80 bg-white/40 px-5 py-6 sm:px-6">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-ink/40">
            Retired
          </p>
          <h2 className="mt-1 font-display text-xl text-ink/55">
            No longer offered on new entries
          </h2>
          <ul className="mt-4 space-y-2 text-sm text-ink/50">
            {retired.map((category) => (
              <li key={category.id}>{category.name}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <DeskConfirmModal
        open={Boolean(retireTarget)}
        title="Retire this category?"
        body={
          retireTarget
            ? `${retireTarget.name} will no longer appear on new entries. Past ledger rows keep this label.`
            : ""
        }
        confirmLabel="Retire category"
        destructive
        busy={pending}
        onClose={() => setRetireTarget(null)}
        onConfirm={confirmRetire}
      />
    </div>
  );
}
