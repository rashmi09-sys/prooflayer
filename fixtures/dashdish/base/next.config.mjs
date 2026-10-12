/* global process */
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // A static single-page app. ProofLayer serves each verified build from a
  // per-run path, which it passes in at build time; locally it's "/".
  output: "export",
  basePath: process.env.PROOFLAYER_PREVIEW_BASE || "",
  trailingSlash: true,
  images: { unoptimized: true },
};
export default nextConfig;
