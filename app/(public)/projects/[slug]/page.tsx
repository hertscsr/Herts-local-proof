import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import LeadForm from "./lead-form";
import PhotoGallery from "./photo-gallery";
import TrackPageView from "./track-page-view";

export const revalidate = 3600; // ISR: re-render at most hourly, or on-demand via revalidatePath on publish

interface Props {
  params: { slug: string };
}

async function getProject(slug: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("public_projects")
    .select("*")
    .eq("slug", slug)
    .single();
  return data;
}

async function getPhotos(projectId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("photos")
    .select("id, storage_path, phase, caption, alt_text_final, alt_text_auto")
    .eq("project_id", projectId)
    .order("display_order", { ascending: true });

  return (data ?? []).map((p) => ({
    ...p,
    url: supabase.storage.from("project-photos").getPublicUrl(p.storage_path).data.publicUrl,
  }));
}

async function getReviews(projectId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("reviews")
    .select("id, homeowner, rating, review, date")
    .eq("project_id", projectId)
    .eq("approved_for_website", true)
    .order("date", { ascending: false });
  return data ?? [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const project = await getProject(params.slug);
  if (!project) return {};

  return {
    title: project.seo_title ?? project.page_title,
    description: project.meta_description,
    alternates: { canonical: project.canonical_url ?? undefined },
    openGraph: {
      title: project.seo_title ?? project.page_title,
      description: project.meta_description,
      type: "article",
    },
  };
}

export default async function ProjectPage({ params }: Props) {
  const project = await getProject(params.slug);
  if (!project) notFound();

  const photos = await getPhotos(project.id);
  const reviews = await getReviews(project.id);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.hertsroofingnj.com";
  const pageUrl = `${siteUrl}/projects/${project.slug}`;

  const avgRating =
    reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: project.h1 ?? project.page_title,
    description: project.meta_description,
    url: pageUrl,
    areaServed: `${project.city}, ${project.state}`,
    provider: {
      "@type": "RoofingContractor",
      name: "Herts Roofing & Construction",
      address: {
        "@type": "PostalAddress",
        addressLocality: project.city,
        addressRegion: project.state,
        postalCode: project.zip,
      },
    },
    // Only attach a rating when we actually have reviews for this specific
    // job — never a made-up or company-wide number on a page about one job.
    ...(avgRating
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: avgRating.toFixed(1),
            reviewCount: reviews.length,
          },
        }
      : {}),
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Projects Near You", item: `${siteUrl}/near-me` },
      {
        "@type": "ListItem",
        position: 3,
        name: `${project.city}, ${project.state}`,
        item: `${siteUrl}/near-me?city=${encodeURIComponent(project.city)}`,
      },
      { "@type": "ListItem", position: 4, name: project.h1 ?? project.page_title, item: pageUrl },
    ],
  };

  // FAQPage schema is what actually earns the expandable Q&A rich result in
  // Google — the questions/answers must match what's visibly on the page.
  const faqLd =
    project.faq && project.faq.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: project.faq.map((item: { question: string; answer: string }) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: { "@type": "Answer", text: item.answer },
          })),
        }
      : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <TrackPageView projectId={project.id} />

      {/* Structured data — server-rendered, present on first response */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      {faqLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
        />
      )}

      <h1 className="text-3xl font-bold text-brand">{project.h1 ?? project.page_title}</h1>
      <p className="mt-2 text-slate-600">
        {project.public_location ?? project.city}, {project.state}
      </p>

      <section className="mt-8 space-y-6">
        <p>{project.introduction}</p>

        {project.project_challenge && (
          <div>
            <h2 className="text-xl font-semibold">The Challenge</h2>
            <p>{project.project_challenge}</p>
          </div>
        )}

        {project.solution && (
          <div>
            <h2 className="text-xl font-semibold">The Solution</h2>
            <p>{project.solution}</p>
          </div>
        )}

        {project.materials_used && (
          <div>
            <h2 className="text-xl font-semibold">Materials Used</h2>
            <p>{project.materials_used}</p>
          </div>
        )}
      </section>

      {photos.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Project Photos</h2>
          <PhotoGallery photos={photos} projectId={project.id} />
        </section>
      )}

      {project.faq && project.faq.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">Frequently Asked Questions</h2>
          <div className="mt-4 space-y-4">
            {project.faq.map((item: { question: string; answer: string }, i: number) => (
              <div key={i}>
                <div className="font-medium">{item.question}</div>
                <p className="mt-1 text-slate-600">{item.answer}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {reviews.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">What the Homeowner Said</h2>
          <div className="mt-4 space-y-4">
            {reviews.map((r) => (
              <div key={r.id} className="rounded border border-slate-200 p-4">
                <div className="text-amber-500">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</div>
                <p className="mt-1 text-slate-700">{r.review}</p>
                <div className="mt-1 text-sm text-slate-500">{r.homeowner}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mt-10">
        <LeadForm projectId={project.id} serviceType={project.service_type} />
      </div>

      {/* TODO: "nearby projects" carousel reads from data already modeled
          in the schema — wire up once the design pass on this section is done. */}
    </main>
  );
}
