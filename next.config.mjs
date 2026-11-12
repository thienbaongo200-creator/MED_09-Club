/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  distDir: process.env.MED09_E2E_NEXT_DIST_DIR || ".next"
};

export default nextConfig;
