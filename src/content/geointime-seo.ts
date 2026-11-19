/** The remixed site's domain has not been assigned; do not canonicalize it to the previous DIGIT domain. */
export function geoHead(locale: 'ar' | 'en') {
  const title = locale === 'ar' ? 'GeoInTime — من الموقع إلى شاشة القرار' : 'GeoInTime — From the field to the decision screen';
  const description = locale === 'ar' ? 'GeoInTime — من حضور فريقك إلى رؤية أوضح للعمل. شاهد واجهات النظام واستكشف سيناريوهات متابعة المواقع والفرق والمهام واطلب عرضاً توضيحياً يناسب نشاطك.' : 'GeoInTime — from your team’s attendance to a clearer view of work. See real system screens, explore site, team and task scenarios, and request a demo that fits your business.';
  return {
    meta: [{ title }, { name: 'description', content: description }, { property: 'og:title', content: title }, { property: 'og:description', content: description }, { property: 'og:site_name', content: 'GeoInTime' }, { property: 'og:type', content: 'website' }, { property: 'og:locale', content: locale === 'ar' ? 'ar_SA' : 'en_US' }, { name: 'twitter:card', content: 'summary_large_image' }, { name: 'twitter:title', content: title }, { name: 'twitter:description', content: description }],
    links: [{ rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Dosis:wght@400;500;600;700;800&family=Noto+Sans+Arabic:wght@400;500;600;700;800&display=swap' }],
    scripts: [{ type: 'application/ld+json', children: JSON.stringify({ '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'GeoInTime', applicationCategory: 'BusinessApplication', operatingSystem: 'Web', description, inLanguage: locale }) }],
  };
}