import type { Config } from "tailwindcss";

/**
 * Design direction: modern, crisp, app-like — "crisp light + green accent".
 * Soft green-neutral background so white cards lift off it, a single confident
 * fresh-green accent, hairline borders + gentle layered shadows, Inter typeface.
 * No decorative gradients, no glassmorphism, no clipart/emoji imagery.
 */
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#F3F6F2", // app background (soft green-neutral off-white)
        surface: "#FFFFFF", // cards / sheets
        border: "#E6E9E4", // hairline separators
        ink: "#14170F", // primary text (warm near-black)
        muted: "#63706A", // secondary text
        faint: "#9AA39C", // tertiary / placeholders
        brand: {
          DEFAULT: "#16A34A", // primary action (fresh green)
          hover: "#15803D",
          tint: "#ECFBF1", // subtle green surface / badges
          soft: "#BBF7D0", // soft green border/accent
          ring: "#86EFAC",
        },
        warn: {
          DEFAULT: "#C2740B", // "use soon"
          tint: "#FDF6EA",
        },
        danger: {
          DEFAULT: "#DC2626", // expired / destructive
          tint: "#FEF2F2",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        sm: "10px",
        xl: "14px",
        card: "22px",
      },
      boxShadow: {
        // Gentle, layered — structure comes from borders + a little lift.
        soft: "0 1px 2px rgba(20,30,20,0.04), 0 2px 8px rgba(20,30,20,0.05)",
        card: "0 1px 2px rgba(20,30,20,0.04), 0 1px 3px rgba(20,30,20,0.04)",
        hero: "0 12px 30px -12px rgba(22,80,50,0.28)",
        pop: "0 10px 34px rgba(20,30,20,0.14)",
        nav: "0 6px 24px rgba(20,30,20,0.12)",
      },
      minHeight: { tap: "48px" },
      minWidth: { tap: "48px" },
      letterSpacing: {
        tightish: "-0.011em",
        tightest: "-0.02em",
      },
    },
  },
  plugins: [],
};

export default config;
