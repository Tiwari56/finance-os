/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    // next-auth v5 beta requires these for correct bundling on Next.js 14
    transpilePackages: ["next-auth"],
    // Prevent webpack from bundling these — let Node.js resolve them at runtime
    experimental: {
        serverComponentsExternalPackages: ["@node-rs/argon2", "@node-rs/bcrypt"],
    },
};
module.exports = nextConfig;
