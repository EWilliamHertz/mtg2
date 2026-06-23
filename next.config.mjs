/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['3000-cs-553118797525-default.cs-europe-west4-pear.cloudshell.dev'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cards.scryfall.io' },
      { protocol: 'https', hostname: 'svgs.scryfall.io' },
    ],
  },
};

export default nextConfig;
