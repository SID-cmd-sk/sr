/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.googleusercontent.com' },
      { protocol: 'https', hostname: '**.supabase.co' },
    ],
  },
  // Ensure server-side env vars are not leaked to client
  experimental: {
    serverComponentsExternalPackages: ['nodemailer']
  },
}

module.exports = nextConfig
