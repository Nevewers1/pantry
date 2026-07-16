"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MEAL_TYPES,
  RECIPE_TAGS,
  type MealType,
  type RecipeDraft,
  type RecipeIngredient,
  type RecipeSourceType,
  type RecipeTag,
  type RecipeWithIngredients,
} from "@/lib/types";
import { namesMatch } from "@/lib/normalize";
import { PlusIcon, StarIcon, TrashIcon, XIcon } from "@/components/icons";
import { RecipePhoto } from "@/components/recipes/RecipePhoto";

type Form = {
  title: string;
  servings: string;
  prep_min: string;
  cook_min: string;
  tags: RecipeTag[];
  meal_type: MealType;
  instructions: string;
  image_url: string;
  is_favourite: boolean;
  ingredients: RecipeIngredient[];
};

const field =
  "min-h-tap w-full rounded-xl border border-border bg-surface px-3.5 text-[15px] text-ink placeholder:text-faint focus:border-brand";
const label = "text-[13px] font-medium text-ink";

function blankIngredient(): RecipeIngredient {
  return { name: "", quantity: null, unit: null, is_staple: false };
}

function toForm(
  recipe: RecipeWithIngredients | null,
  draft: RecipeDraft | null
): Form {
  if (recipe) {
    return {
      title: recipe.title,
      servings: String(recipe.servings ?? 2),
      prep_min: recipe.prep_min != null ? String(recipe.prep_min) : "",
      cook_min: recipe.cook_min != null ? String(recipe.cook_min) : "",
      tags: (recipe.tags ?? []) as RecipeTag[],
      meal_type: recipe.meal_type ?? "full",
      instructions: recipe.instructions ?? "",
      image_url: recipe.image_url ?? "",
      is_favourite: recipe.is_favourite,
      ingredients: recipe.recipe_ingredients?.length
        ? recipe.recipe_ingredients
        : [blankIngredient()],
    };
  }
  if (draft) {
    return {
      title: draft.title,
      servings: String(draft.servings ?? 2),
      prep_min: draft.prep_min != null ? String(draft.prep_min) : "",
      cook_min: draft.cook_min != null ? String(draft.cook_min) : "",
      tags: draft.tags ?? [],
      meal_type: draft.meal_type ?? "full",
      instructions: draft.instructions ?? "",
      image_url: draft.image_url ?? "",
      is_favourite: false,
      ingredients: draft.ingredients?.length
        ? draft.ingredients
        : [blankIngredient()],
    };
  }
  return {
    title: "",
    servings: "2",
    prep_min: "",
    cook_min: "",
    tags: [],
    meal_type: "full",
    instructions: "",
    image_url: "",
    is_favourite: false,
    ingredients: [blankIngredient()],
  };
}

export function RecipeSheet({
  open,
  recipe,
  draft,
  pantryNames,
  householdId,
  userId,
  supabase,
  onClose,
  onSaved,
  onDeleted,
  onCook,
}: {
  open: boolean;
  recipe: RecipeWithIngredients | null;
  draft: RecipeDraft | null;
  pantryNames: string[];
  householdId: string;
  userId: string;
  supabase: SupabaseClient;
  onClose: () => void;
  onSaved: (r: RecipeWithIngredients) => void;
  onDeleted: (id: string) => void;
  onCook: (r: RecipeWithIngredients) => void;
}) {
  const [form, setForm] = useState<Form>(toForm(null, null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(toForm(recipe, draft));
      setError(null);
    }
  }, [open, recipe, draft]);

  if (!open) return null;

  const sourceType: RecipeSourceType = recipe
    ? recipe.source_type
    : draft
      ? (draft.source_type ?? "imported")
      : "manual";

  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const setIng = (i: number, patch: Partial<RecipeIngredient>) =>
    setForm((f) => ({
      ...f,
      ingredients: f.ingredients.map((r, idx) =>
        idx === i ? { ...r, ...patch } : r
      ),
    }));

  const needed = form.ingredients.filter((i) => !i.is_staple && i.name.trim());
  const haveCount = needed.filter((i) =>
    pantryNames.some((p) => namesMatch(i.name, p))
  ).length;

  function toggleTag(t: RecipeTag) {
    set(
      "tags",
      form.tags.includes(t)
        ? form.tags.filter((x) => x !== t)
        : [...form.tags, t]
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.title.trim()) return setError("Give the recipe a title.");

    const recipePayload = {
      household_id: householdId,
      title: form.title.trim(),
      source_url: recipe?.source_url ?? draft?.source_url ?? null,
      source_type: sourceType,
      servings: parseInt(form.servings) || 2,
      prep_min: form.prep_min ? parseInt(form.prep_min) : null,
      cook_min: form.cook_min ? parseInt(form.cook_min) : null,
      tags: form.tags,
      meal_type: form.meal_type,
      instructions: form.instructions.trim() || null,
      image_url: form.image_url.trim() || null,
      is_favourite: form.is_favourite,
    };

    const cleanIngredients = form.ingredients
      .filter((i) => i.name.trim())
      .map((i) => ({
        name: i.name.trim(),
        quantity:
          i.quantity != null && Number.isFinite(i.quantity) ? i.quantity : null,
        unit: i.unit?.trim() || null,
        is_staple: i.is_staple,
      }));

    setBusy(true);
    try {
      // Upsert the recipe row.
      let recipeId = recipe?.id;
      let savedRecipe: RecipeWithIngredients;

      if (recipeId) {
        const { data, error } = await supabase
          .from("recipes")
          .update(recipePayload)
          .eq("id", recipeId)
          .select()
          .single();
        if (error) throw error;
        savedRecipe = { ...data, recipe_ingredients: [] };
        // Replace ingredients.
        await supabase
          .from("recipe_ingredients")
          .delete()
          .eq("recipe_id", recipeId);
      } else {
        const { data, error } = await supabase
          .from("recipes")
          .insert(recipePayload)
          .select()
          .single();
        if (error) throw error;
        recipeId = data.id as string;
        savedRecipe = { ...data, recipe_ingredients: [] };
      }

      if (cleanIngredients.length) {
        const rows = cleanIngredients.map((i) => ({
          ...i,
          recipe_id: recipeId,
        }));
        const { data: ing, error: ingErr } = await supabase
          .from("recipe_ingredients")
          .insert(rows)
          .select();
        if (ingErr) throw ingErr;
        savedRecipe.recipe_ingredients = (ing ?? []) as RecipeIngredient[];
      }

      onSaved(savedRecipe);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't save the recipe."
      );
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    if (!recipe) return;
    if (!confirm(`Delete "${recipe.title}"?`)) return;
    setBusy(true);
    const { error } = await supabase
      .from("recipes")
      .delete()
      .eq("id", recipe.id);
    setBusy(false);
    if (error) return setError(error.message);
    onDeleted(recipe.id);
    onClose();
  }

  const title = recipe ? "Edit recipe" : draft ? "Review recipe" : "New recipe";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/40 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-md flex-col rounded-t-card bg-bg shadow-pop safe-bottom sm:rounded-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-5">
          <h2 className="text-[17px] font-semibold tracking-tightish text-ink">
            {title}
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => set("is_favourite", !form.is_favourite)}
              aria-label="Toggle favourite"
              className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                form.is_favourite ? "text-brand" : "text-faint hover:text-ink"
              }`}
            >
              <StarIcon className="h-5 w-5" filled={form.is_favourite} />
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface hover:text-ink"
            >
              <XIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        <form
          onSubmit={save}
          className="flex flex-1 flex-col gap-4 overflow-y-auto p-5"
        >
          {recipe && (
            <button
              type="button"
              onClick={() => {
                onCook(recipe);
                onClose();
              }}
              className="flex min-h-tap items-center justify-center gap-2 rounded-xl bg-brand-tint text-[15px] font-semibold text-brand"
            >
              Cooked this — update my pantry
            </button>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="title" className={label}>
              Title
            </label>
            <input
              id="title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Weeknight bolognese"
              className={field}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="image_url" className={label}>
              Photo URL <span className="font-normal text-faint">(optional)</span>
            </label>
            <div className="flex items-center gap-3">
              <RecipePhoto
                url={form.image_url.trim() || null}
                className="h-16 w-16 shrink-0 rounded-xl"
                iconClassName="h-6 w-6"
              />
              <input
                id="image_url"
                type="url"
                inputMode="url"
                value={form.image_url}
                onChange={(e) => set("image_url", e.target.value)}
                placeholder="Paste an image link…"
                className={`${field} min-w-0 flex-1`}
              />
            </div>
            <p className="text-[12px] text-faint">
              Imported recipes fill this in automatically. Paste a link to use your
              own — leave blank for the plain badge.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="servings" className={label}>
                Serves
              </label>
              <input
                id="servings"
                type="number"
                min="1"
                value={form.servings}
                onChange={(e) => set("servings", e.target.value)}
                className={field}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="prep" className={label}>
                Prep min
              </label>
              <input
                id="prep"
                type="number"
                min="0"
                value={form.prep_min}
                onChange={(e) => set("prep_min", e.target.value)}
                className={field}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="cook" className={label}>
                Cook min
              </label>
              <input
                id="cook"
                type="number"
                min="0"
                value={form.cook_min}
                onChange={(e) => set("cook_min", e.target.value)}
                className={field}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className={label}>Type</span>
            <div className="flex gap-1 rounded-xl bg-surface p-1">
              {MEAL_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => set("meal_type", t.value)}
                  className={`min-h-[40px] flex-1 rounded-lg text-[14px] font-medium transition-colors ${
                    form.meal_type === t.value
                      ? "bg-brand-tint text-brand"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className={label}>Tags</span>
            <div className="flex flex-wrap gap-1.5">
              {RECIPE_TAGS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => toggleTag(t.value)}
                  className={`min-h-[36px] rounded-lg px-3 text-[13px] font-medium transition-colors ${
                    form.tags.includes(t.value)
                      ? "bg-brand-tint text-brand"
                      : "bg-surface text-muted hover:text-ink"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Ingredients */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className={label}>Ingredients</span>
              {needed.length > 0 && (
                <span
                  className={`text-[12px] font-medium ${
                    haveCount === needed.length ? "text-brand" : "text-muted"
                  }`}
                >
                  in stock: {haveCount}/{needed.length}
                </span>
              )}
            </div>

            {form.ingredients.map((ing, i) => {
              const inStock =
                !ing.is_staple &&
                ing.name.trim() &&
                pantryNames.some((p) => namesMatch(ing.name, p));
              return (
                <div
                  key={i}
                  className="rounded-xl border border-border bg-surface p-3"
                >
                  <div className="flex items-center gap-2">
                    <input
                      value={ing.name}
                      onChange={(e) => setIng(i, { name: e.target.value })}
                      placeholder="Ingredient"
                      aria-label="Ingredient name"
                      className={`${field} font-medium`}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        set(
                          "ingredients",
                          form.ingredients.filter((_, idx) => idx !== i)
                        )
                      }
                      aria-label="Remove ingredient"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-danger"
                    >
                      <XIcon className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={ing.quantity ?? ""}
                      onChange={(e) =>
                        setIng(i, {
                          quantity: e.target.value
                            ? parseFloat(e.target.value)
                            : null,
                        })
                      }
                      placeholder="qty"
                      aria-label="Quantity"
                      className={`${field} w-20`}
                    />
                    <input
                      value={ing.unit ?? ""}
                      onChange={(e) => setIng(i, { unit: e.target.value })}
                      placeholder="unit"
                      aria-label="Unit"
                      className={`${field} w-24`}
                    />
                    <label className="ml-auto flex items-center gap-1.5 text-[13px] text-muted">
                      <input
                        type="checkbox"
                        checked={ing.is_staple}
                        onChange={(e) =>
                          setIng(i, { is_staple: e.target.checked })
                        }
                        className="h-4 w-4 accent-brand"
                      />
                      staple
                    </label>
                    {inStock && (
                      <span className="flex items-center gap-1 text-[12px] text-brand">
                        <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                        have
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              onClick={() =>
                set("ingredients", [...form.ingredients, blankIngredient()])
              }
              className="flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-[14px] font-medium text-muted hover:text-ink"
            >
              <PlusIcon className="h-4 w-4" />
              Add ingredient
            </button>
            <p className="text-[12px] text-faint">
              Tick &quot;staple&quot; for things you always have (salt, oil) so
              they stay off your shopping list.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="instructions" className={label}>
              Method
            </label>
            <textarea
              id="instructions"
              value={form.instructions}
              onChange={(e) => set("instructions", e.target.value)}
              rows={6}
              placeholder="Steps…"
              className="w-full rounded-xl border border-border bg-surface p-3.5 text-[15px] text-ink placeholder:text-faint focus:border-brand"
            />
            {(recipe?.source_url || draft?.source_url) && (
              <a
                href={recipe?.source_url ?? draft?.source_url ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] text-brand underline-offset-4 hover:underline"
              >
                View original source
              </a>
            )}
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
        </form>

        <div className="flex items-center gap-3 border-t border-border p-5">
          {recipe && (
            <button
              type="button"
              onClick={del}
              disabled={busy}
              aria-label="Delete recipe"
              className="flex min-h-tap w-12 shrink-0 items-center justify-center rounded-xl border border-border text-danger hover:bg-danger-tint disabled:opacity-50"
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          )}
          <button
            onClick={save}
            disabled={busy}
            className="min-h-tap flex-1 rounded-xl bg-brand text-[15px] font-medium text-white hover:bg-brand-hover disabled:opacity-50"
          >
            {busy ? "Saving…" : recipe ? "Save changes" : "Save recipe"}
          </button>
        </div>
      </div>
    </div>
  );
}
