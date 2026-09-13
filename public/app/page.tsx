import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-16 text-center">
      <h1 className="text-4xl font-bold text-brand">Herts LocalProof</h1>
      <p className="mt-4 text-slate-600">
        Every completed project, turned into a homeowner page, a local SEO
        asset, and a lead generator.
      </p>
      <Link
        href="/near-me"
        className="mt-8 inline-block rounded bg-brand-accent px-6 py-3 font-medium text-white"
      >
        See Projects Near You
      </Link>
    </main>
  );
}
