import type { NextConfig } from "next";
import path from "path";

const zoomDownloadManagerStub = path.resolve(
  process.cwd(),
  "lib/zoom/download-manager-stub.js",
);

const nextConfig: NextConfig = {
  // Keep Turbopack rooted on this app (avoids parent lockfile confusion)
  // without breaking builtin client modules via import.meta path quirks.
  turbopack: {
    root: path.resolve(process.cwd()),
    resolveAlias: {
      // Zoom's UMD references this internal package; it is not on npm.
      "@zoom/download-manager": "./lib/zoom/download-manager-stub.js",
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@zoom/download-manager": zoomDownloadManagerStub,
    };
    return config;
  },
};

export default nextConfig;
