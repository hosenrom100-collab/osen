import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["firebase", "@firebase/firestore", "@firebase/auth"],
};

export default nextConfig;
