"use client";

import { useState } from "react";
import { PlateIcon } from "@/components/icons";

/**
 * Recipe photo from a plain image URL (scraped on import or pasted by hand).
 * Falls back to a clean chef-hat badge on a soft-green field when there's no
 * URL or the image fails to load — no clipart, no stock imagery.
 */
export function RecipePhoto({
  url,
  className = "",
  iconClassName = "h-7 w-7",
}: {
  url?: string | null;
  className?: string;
  iconClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  const show = url && !failed;

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden bg-brand-tint ${className}`}
    >
      {show ? (
        // Plain <img> keeps this dependency-free; Next/Image would need domain config.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url as string}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex items-center justify-center text-brand">
          <PlateIcon className={iconClassName} />
        </span>
      )}
    </div>
  );
}
