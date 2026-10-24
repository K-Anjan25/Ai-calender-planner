import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Preserve existing bookmarks while making the native Next.js route authoritative.
  async redirects() {
    return [{ source: '/calendra.html', destination: '/', permanent: true }]
  },
};

export default nextConfig;
