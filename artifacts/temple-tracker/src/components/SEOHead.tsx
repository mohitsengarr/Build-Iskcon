import { Helmet } from "react-helmet-async";

const SITE_NAME = "Build Iskcon";
const SITE_TAGLINE = "Global Temple Construction Intelligence";
const DEFAULT_DESCRIPTION =
  "Build Iskcon tracks 16 active ISKCON temple construction projects across 11 countries with $338M in fundraising goals. Explore 84 centres in 10 regions, donate directly, and discover the Vision 2051 roadmap for 211 temples across India.";
const CANONICAL_DOMAIN = "https://buildiskcon.com";
const OG_IMAGE = `${CANONICAL_DOMAIN}/opengraph.jpg`;

interface SEOHeadProps {
  title?: string;
  description?: string;
  ogImage?: string;
  ogType?: "website" | "article";
  canonicalPath?: string;
  noindex?: boolean;
  structuredData?: Record<string, unknown> | Record<string, unknown>[];
}

export function SEOHead({
  title,
  description = DEFAULT_DESCRIPTION,
  ogImage = OG_IMAGE,
  ogType = "website",
  canonicalPath = "/",
  noindex = false,
  structuredData,
}: SEOHeadProps) {
  const fullTitle = title ? `${title} | ${SITE_NAME} — ${SITE_TAGLINE}` : `${SITE_NAME} — ${SITE_TAGLINE}`;
  const canonicalUrl = `${CANONICAL_DOMAIN}${canonicalPath}`;

  const structuredDataArray = structuredData
    ? Array.isArray(structuredData)
      ? structuredData
      : [structuredData]
    : [];

  return (
    <Helmet>
      {/* Primary */}
      <html lang="en" />
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}
      <link rel="canonical" href={canonicalUrl} />

      {/* Language */}
      <link rel="alternate" hrefLang="en" href={canonicalUrl} />
      <link rel="alternate" hrefLang="x-default" href={canonicalUrl} />

      {/* Open Graph */}
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={ogType} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content="Build Iskcon — Track ISKCON temple construction projects worldwide" />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:locale" content="en_US" />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />

      {/* Additional SEO */}
      <meta name="theme-color" content="#A0612B" />
      <meta name="author" content="Build Iskcon" />
      <meta name="keywords" content="ISKCON temple construction, ISKCON donate, TOVP Mayapur, ISKCON temple projects, Hare Krishna temple, Vision 2051, ISKCON fundraising, build temple, Krishna consciousness, Srila Prabhupada" />

      {/* Structured Data */}
      {structuredDataArray.map((schema, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      ))}
    </Helmet>
  );
}
