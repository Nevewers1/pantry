import type { Config } from "tailwindcss";

/**
 * Design direction: modern, crisp, app-like — "crisp light + green accent".
 * Neutral gray-white surfaces, hairline borders (not heavy shadows), a single
 * confident fresh-green accent for actions/active states, and semantic amber/red
 * reserved for expiry. Inter typeface. No decorative gradients or glassmorphism.
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
        bg: "#F7F7F8", // app background (soft neutral)
        surface: "#FFFFFF", // cards / sheets
        border: "#EAEAEC", // hairline separators
        ink: "#0A0A0A", // primary text
        muted: "#6B7280", // secondary text
        faint: "#9CA3AF", // tertiary / placeholders
        brand: {
          DEFAULT: "#16A34A", // primary action (fresh green)
          hover: "#15803D",
          tint: "#F0FDF4", // subtle green surface / badges
          ring: "#86EFAC",
        },
        warn: {
          DEFAULT: "#D97706", // "use soon"
          tint: "#FFFBEB",
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
        card: "16px",
        xl: "12px",
      },
      boxShadow: {
        // Deliberately subtle — structure comes from borders, not shadows.
        soft: "0 1px 2px rgba(10, 10, 10, 0.05)",
        pop: "0 4px 24px rgba(10, 10, 10, 0.08)",
      },
      minHeight: { tap: "48px" },
      minWidth: { tap: "48px" },
      letterSpacing: {
        tightish: "-0.01em",
      },
    },
  },
  plugins: [],
};

export default config;
