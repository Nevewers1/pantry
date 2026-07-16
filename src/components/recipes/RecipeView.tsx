"use client";

import {
  MEAL_TYPES,
  RECIPE_TAGS,
  type RecipeWithIngredients,
} from "@/lib/types";
import { ClockIcon, XIcon } from "@/components/icons";
import { RecipePhoto } from "@/components/recipes/RecipePhoto";

const typeLabel = (v: string) =>
  MEAL_TYPES.find((t) => t.value === v)?.label ?? v;
const tagLabel = (v: string) =>
  RECIPE_TAGS.find((t) => t.value === v)?.label ?? v;

/** Read-only recipe detail — ingredients + method. */
export function RecipeView({
  recipe,
  onClose,
}: {
  recipe: RecipeWithIngredients | null;
  onClose: () => void;
}) {
  if (!recipe) return null;
  const time = (recipe.prep_min ?? 0) + (recipe.cook_min ?? 0);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/40 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={recipe.title}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-md flex-col rounded-t-card bg-bg shadow-pop safe-bottom sm:rounded-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-border p-5">
          <div className="min-w-0">
            <h2 className="text-[18px] font-semibold tracking-tightish text-ink">
              {recipe.title}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
              <span>{typeLabel(recipe.meal_type)}</span>
              <span>
                · {recipe.servings} {recipe.servings === 1 ? "serve" : "serves"}
              </span>
              {time > 0 && (
                <span className="flex items-center gap-1">
                  · <ClockIcon className="h-3.5 w-3.5" />
                  {time} min
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface hover:text-ink"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {recipe.image_url && (
            <RecipePhoto
              url={recipe.image_url}
              className="h-44 w-full rounded-xl"
              iconClassName="h-9 w-9"
            />
          )}

          {recipe.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {recipe.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-bg px-2 py-0.5 text-[11px] font-medium text-muted"
                >
                  {tagLabel(t)}
                </span>
              ))}
            </div>
          )}

          <div>
            <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
              Ingredients
            </h3>
            {recipe.recipe_ingredients?.length ? (
              <ul className="space-y-1.5">
                {recipe.recipe_ingredients.map((ing, i) => (
                  <li
                    key={ing.id ?? i}
                    className="flex items-baseline justify-between gap-3 text-[15px] text-ink"
                  >
                    <span>{ing.name}</span>
                    <span className="shrink-0 text-[13px] text-muted">
                      {ing.quantity != null ? ing.quantity : ""}
                      {ing.unit ? ` ${ing.unit}` : ""}
                      {ing.is_staple ? " · staple" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No ingredients listed.</p>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
              Method
            </h3>
            {recipe.instructions ? (
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">
                {recipe.instructions}
              </p>
            ) : (
              <p className="text-sm text-muted">No method saved.</p>
            )}
          </div>

          {recipe.source_url && (
            <a
              href={recipe.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-[13px] text-brand underline-offset-4 hover:underline"
            >
              View original source
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
