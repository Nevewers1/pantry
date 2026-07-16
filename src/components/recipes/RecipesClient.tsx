"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { namesMatch } from "@/lib/normalize";
import {
  RECIPE_TAGS,
  type PantrySlim,
  type RecipeDraft,
  type RecipeWithIngredients,
} from "@/lib/types";
import {
  ArrowLeftIcon,
  BookIcon,
  ClockIcon,
  LinkIcon,
  PlusIcon,
  PlateIcon,
  StarIcon,
  XIcon,
} from "@/components/icons";
import { RecipeSheet } from "@/components/recipes/RecipeSheet";
import { ImportSheet } from "@/components/recipes/ImportSheet";
import { SuggestSheet } from "@/components/recipes/SuggestSheet";

const tagLabel = (v: string) =>
  RECIPE_TAGS.find((t) => t.value === v)?.label ?? v;

type Toast = { msg: string; undo: () => Promise<void> } | null;

export function RecipesClient({
  initialRecipes,
  initialPantry,
  householdId,
  userId,
}: {
  initialRecipes: RecipeWithIngredients[];
  initialPantry: PantrySlim[];
  householdId: string;
  userId: string;
}) {
  const [recipes, setRecipes] = useState(initialRecipes);
  const [pantry, setPantry] = useState(initialPantry);
  const [favOnly, setFavOnly] = useState(false);
  const [addMenu, setAddMenu] = useState(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<RecipeWithIngredients | null>(null);
  const [draft, setDraft] = useState<RecipeDraft | null>(null);

  const [importMode, setImportMode] = useState<"link" | "text" | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  const supabase = useMemo(() => createClient(), []);
  const pantryNames = useMemo(() => pantry.map((p) => p.name), [pantry]);

  async function cookRecipe(r: RecipeWithIngredients) {
    const ings = (r.recipe_ingredients ?? []).filter(
      (i) => !i.is_staple && i.name.trim()
    );
    const changes: { id: string; old: number; next: number }[] = [];
    for (const ing of ings) {
      const item = pantry.find((p) => namesMatch(ing.name, p.name));
      if (!item) continue;
      let amount = 1;
      if (ing.quantity && Number.isFinite(ing.quantity)) {
        const iu = (ing.unit ?? "").trim().toLowerCase();
        const pu = (item.unit ?? "").trim().toLowerCase();
        if (iu === pu) amount = ing.quantity;
      }
      const next = Math.max(0, Math.round((item.quantity - amount) * 100) / 100);
      if (next !== item.quantity)
        changes.push({ id: item.id, old: item.quantity, next });
    }

    // Apply pantry decrements.
    await Promise.all(
      changes.map((c) =>
        supabase
          .from("pantry_items")
          .update({ quantity: c.next, updated_by: userId })
          .eq("id", c.id)
      )
    );
    setPantry((prev) =>
      prev.map((p) => {
        const c = changes.find((x) => x.id === p.id);
        return c ? { ...p, quantity: c.next } : p;
      })
    );

    // Bump cooked stats.
    const prevTimes = r.times_cooked;
    const prevLast = r.last_cooked_at;
    const { data: rec } = await supabase
      .from("recipes")
      .update({
        times_cooked: prevTimes + 1,
        last_cooked_at: new Date().toISOString(),
      })
      .eq("id", r.id)
      .select()
      .single();
    if (rec)
      upsertRecipe({ ...rec, recipe_ingredients: r.recipe_ingredients });

    // Audit log.
    const { data: log } = await supabase
      .from("consumption_log")
      .insert({
        household_id: householdId,
        recipe_id: r.id,
        note: `Cooked ${r.title}`,
        logged_by: userId,
      })
      .select()
      .single();
    const logId = log?.id as string | undefined;

    setToast({
      msg: `Cooked ${r.title} — ${changes.length} pantry item${
        changes.length === 1 ? "" : "s"
      } updated`,
      undo: async () => {
        await Promise.all(
          changes.map((c) =>
            supabase
              .from("pantry_items")
              .update({ quantity: c.old })
              .eq("id", c.id)
          )
        );
        setPantry((prev) =>
          prev.map((p) => {
            const c = changes.find((x) => x.id === p.id);
            return c ? { ...p, quantity: c.old } : p;
          })
        );
        await supabase
          .from("recipes")
          .update({ times_cooked: prevTimes, last_cooked_at: prevLast })
          .eq("id", r.id);
        upsertRecipe(r);
        if (logId)
          await supabase.from("consumption_log").delete().eq("id", logId);
        setToast(null);
      },
    });
  }

  function upsertRecipe(r: RecipeWithIngredients) {
    setRecipes((prev) => {
      const i = prev.findIndex((p) => p.id === r.id);
      if (i === -1) return [r, ...prev];
      const next = [...prev];
      next[i] = r;
      return next;
    });
  }
  function removeRecipe(id: string) {
    setRecipes((prev) => prev.filter((p) => p.id !== id));
  }

  const visible = favOnly ? recipes.filter((r) => r.is_favourite) : recipes;

  function haveNeed(r: RecipeWithIngredients) {
    const needed = (r.recipe_ingredients ?? []).filter((i) => !i.is_staple);
    const have = needed.filter((i) =>
      pantryNames.some((p) => namesMatch(i.name, p))
    ).length;
    return { have, total: needed.length };
  }

  async function toggleFav(r: RecipeWithIngredients, e: React.MouseEvent) {
    e.stopPropagation();
    const next = { ...r, is_favourite: !r.is_favourite };
    upsertRecipe(next);
    const { error } = await supabase
      .from("recipes")
      .update({ is_favourite: next.is_favourite })
      .eq("id", r.id);
    if (error) upsertRecipe(r);
  }

  function openManual() {
    setAddMenu(false);
    setEditing(null);
    setDraft(null);
    setSheetOpen(true);
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              aria-label="Back to home"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface hover:text-ink"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </Link>
            <h1 className="text-[17px] font-semibold tracking-tightish text-ink">
              Recipes
            </h1>
          </div>

          <div className="relative">
            <button
              onClick={() => setAddMenu((v) => !v)}
              className="flex min-h-tap items-center gap-1.5 rounded-xl bg-brand px-3.5 text-[14px] font-medium text-white hover:bg-brand-hover"
            >
              <PlusIcon className="h-4 w-4" />
              Add
            </button>
            {addMenu && (
              <>
                <button
                  aria-hidden="true"
                  tabIndex={-1}
                  onClick={() => setAddMenu(false)}
                  className="fixed inset-0 z-10 cursor-default"
                />
                <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-surface shadow-pop">
                  <MenuItem label="Enter manually" onClick={openManual} />
                  <MenuItem
                    label="Paste a link"
                    onClick={() => {
                      setAddMenu(false);
                      setImportMode("link");
                    }}
                  />
                  <MenuItem
                    label="Paste recipe text"
                    onClick={() => {
                      setAddMenu(false);
                      setImportMode("text");
                    }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-5 pb-24 pt-4">
        <button
          onClick={() => setSuggestOpen(true)}
          className="mb-4 flex w-full items-center gap-3 rounded-card border border-brand-soft bg-brand-tint p-4 text-left"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
            <PlateIcon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-ink">
              Cook from what I have
            </span>
            <span className="block text-[13px] text-muted">
              Meal ideas from your current stock — save one when you cook it.
            </span>
          </span>
        </button>

        <div className="mb-4 flex gap-1.5">
          {[
            { v: false, label: "All" },
            { v: true, label: "Favourites" },
          ].map((f) => (
            <button
              key={String(f.v)}
              onClick={() => setFavOnly(f.v)}
              className={`min-h-[38px] rounded-lg px-3 text-[13px] font-medium transition-colors ${
                favOnly === f.v
                  ? "bg-brand text-white"
                  : "bg-surface text-muted hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-center rounded-card border border-dashed border-border bg-surface px-6 py-12 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-tint text-brand">
              <BookIcon className="h-6 w-6" />
            </div>
            <p className="text-[15px] font-medium text-ink">
              {favOnly ? "No favourites yet" : "No recipes yet"}
            </p>
            <p className="mt-1 text-sm text-muted">
              Paste a link to a favourite dinner, or enter one by hand to start.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map((r) => {
              const { have, total } = haveNeed(r);
              const time = (r.prep_min ?? 0) + (r.cook_min ?? 0);
              return (
                <button
                  key={r.id}
                  onClick={() => {
                    setDraft(null);
                    setEditing(r);
                    setSheetOpen(true);
                  }}
                  className="flex w-full items-start gap-3 rounded-card border border-border bg-surface p-4 text-left hover:border-brand-soft"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium text-ink">
                      {r.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
                      <span>
                        {r.servings} {r.servings === 1 ? "serve" : "serves"}
                      </span>
                      {time > 0 && (
                        <span className="flex items-center gap-1">
                          <ClockIcon className="h-3.5 w-3.5" />
                          {time} min
                        </span>
                      )}
                      {total > 0 && (
                        <span
                          className={
                            have === total ? "text-brand" : "text-muted"
                          }
                        >
                          have {have}/{total}
                        </span>
                      )}
                    </div>
                    {r.tags?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {r.tags.slice(0, 3).map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-bg px-2 py-0.5 text-[11px] font-medium text-muted"
                          >
                            {tagLabel(t)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => toggleFav(r, e)}
                    aria-label={
                      r.is_favourite ? "Unfavourite" : "Mark favourite"
                    }
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      r.is_favourite ? "text-brand" : "text-faint hover:text-ink"
                    }`}
                  >
                    <StarIcon className="h-5 w-5" filled={r.is_favourite} />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </main>

      <RecipeSheet
        open={sheetOpen}
        recipe={editing}
        draft={draft}
        pantryNames={pantryNames}
        householdId={householdId}
        userId={userId}
        supabase={supabase}
        onClose={() => setSheetOpen(false)}
        onSaved={upsertRecipe}
        onDeleted={removeRecipe}
        onCook={cookRecipe}
      />

      <ImportSheet
        mode={importMode}
        onClose={() => setImportMode(null)}
        onParsed={(d) => {
          setImportMode(null);
          setEditing(null);
          setDraft(d);
          setSheetOpen(true);
        }}
      />

      <SuggestSheet
        open={suggestOpen}
        onClose={() => setSuggestOpen(false)}
        onPick={(d) => {
          setSuggestOpen(false);
          setEditing(null);
          setDraft(d);
          setSheetOpen(true);
        }}
      />

      {toast && (
        <div className="safe-bottom fixed inset-x-4 bottom-4 z-[60] mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl bg-ink px-4 py-3 shadow-pop">
          <span className="text-[14px] text-surface">{toast.msg}</span>
          <div className="flex shrink-0 items-center gap-3">
            <button
              onClick={() => toast.undo()}
              className="text-[14px] font-semibold text-brand-ring"
            >
              Undo
            </button>
            <button
              onClick={() => setToast(null)}
              aria-label="Dismiss"
              className="flex h-6 w-6 items-center justify-center text-surface/60 hover:text-surface"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 px-4 py-3 text-left text-[14px] text-ink hover:bg-bg"
    >
      <LinkIcon className="h-4 w-4 text-muted" />
      {label}
    </button>
  );
}
