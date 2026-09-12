import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";

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

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: project.h1 ?? project.page_title,
    description: project.meta_description,
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
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      {/* Structured data — server-rendered, present on first response */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

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

      {/* TODO: photo gallery (before/during/after from `photos`, filtered by project_id),
          homeowner review block, "nearby projects" carousel, FAQ accordion, and the
          lead-capture CTA all read from data already modeled in the schema — wire up
          once the design pass on these sections is done. */}
    </main>
  );
}
