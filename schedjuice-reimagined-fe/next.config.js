// read here https://github.com/ivansevillaa/use-next-blurhash/issues/4
if (
  process.env.LD_LIBRARY_PATH == null ||
  !process.env.LD_LIBRARY_PATH.includes(
    `${process.env.PWD}/node_modules/canvas/build/Release:`,
  )
) {
  process.env.LD_LIBRARY_PATH = `${
    process.env.PWD
  }/node_modules/canvas/build/Release:${process.env.LD_LIBRARY_PATH || ""}`;
}
/** @type {import('next').NextConfig} */
const TUSD_ORIGIN =
  process.env.NEXT_PUBLIC_TUSD_ORIGIN || "http://localhost:1080";
const JUICEBOX_ORIGIN =
  process.env.NEXT_PUBLIC_JUICEBOX_ORIGIN || "http://localhost:8800";
const ENABLE_REWRITES =
  process.env.NEXT_PUBLIC_ENABLE_REWRITES === "1" ||
  process.env.NODE_ENV !== "production";

const nextConfig = {
  async redirects() {
    return [
      {
        source: "/leads/settings",
        destination: "/crm/leads/settings",
        permanent: true,
      },
      {
        source: "/leads",
        destination: "/crm/leads",
        permanent: true,
      },
      {
        source: "/issues/settings",
        destination: "/crm/issues/settings",
        permanent: true,
      },
      {
        source: "/issues",
        destination: "/crm/issues",
        permanent: true,
      },
      {
        source: "/courses/:id/announcements",
        destination: "/courses/:id",
        permanent: true,
      },
      {
        source: "/courses/:id/teams-attendance",
        destination: "/courses/:id/meeting-attendance",
        permanent: true,
      },
      {
        source: "/custom-field-definitions",
        destination: "/form-designer",
        permanent: true,
      },
      {
        source: "/custom-field-definitions/create",
        destination: "/form-designer",
        permanent: true,
      },
      {
        source: "/platform/docs/:id/edit",
        destination: "/platform/docs/:id",
        permanent: false,
      },
    ];
  },
  // experimental: { serverActions: { allowedOrigins: ["*"] } },
  experimental: {
    // lucide-react is on Next 15's built-in optimize list; iconoir-react is not.
    optimizePackageImports: ["iconoir-react", "date-fns"],
  },
  async rewrites() {
    if (!ENABLE_REWRITES) {
      return [];
    }
    return [
      { source: "/files/:path*", destination: `${TUSD_ORIGIN}/files/:path*` },
      {
        source: "/attachments/:path*",
        destination: `${JUICEBOX_ORIGIN}/attachments/:path*`,
      },
    ];
  },

  // Parent ~/programming/package-lock.json otherwise makes Turbopack pick the wrong root.
  turbopack: {
    root: __dirname,
  },
  images: {
    disableStaticImages: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "github.com",
        port: "",
        pathname: "**",
      },
      {
        protocol: "https",
        hostname: "teachersucenter.com",
        port: "",
        pathname: "**",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
        port: "",
        pathname: "**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "8000",
        pathname: "**",
      },
      {
        protocol: "https",
        hostname: "suconnect.s3.ap-southeast-1.amazonaws.com",
        port: "",
        pathname: "**",
      },
      {
        protocol: "https",
        hostname: "suconnect.s3.amazonaws.com",
        port: "",
        pathname: "**",
      },
      {
        protocol: "https",
        hostname: "schedjuice-dev.sgp1.digitaloceanspaces.com",
        port: "",
        pathname: "**",
      },
      {
        protocol: "https",
        hostname: "sgp1.digitaloceanspaces.com",
        port: "",
        pathname: "**",
      },
      {
        protocol: "https",
        hostname: "schedjuice-dev.sgp1.cdn.digitaloceanspaces.com",
        port: "",
        pathname: "**",
      },
    ],
  },
};

module.exports = nextConfig;
