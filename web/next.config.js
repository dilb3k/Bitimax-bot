/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // No product image upload flow exists yet (Product.images is currently always empty),
    // so there is no legitimate need for a wildcard remote pattern. A '**' hostname turns
    // the Next.js image optimizer into an open image-fetching proxy for any URL a caller
    // supplies (SSRF / abuse risk) for zero functional benefit today. Add specific trusted
    // hostnames here once an image upload/CDN flow is built.
    remotePatterns: [],
  },
  async rewrites() {
    // Safety-net fallback for any /api/* path without a dedicated route handler in
    // web/app/api/**. Must honor BACKEND_URL like the explicit route handlers do —
    // hardcoding localhost here silently breaks in any non-local deployment.
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
