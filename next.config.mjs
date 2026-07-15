/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow next/image to load Supabase Storage photos (pantry + recipes).
  // Replace <your-project-ref> is not needed — we allow any supabase.co host.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
};

export default nextConfig;
