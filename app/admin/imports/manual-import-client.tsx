"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CCProjectSummary, CCPhoto } from "@/lib/companycam";

interface DraftProject {
  id: string;
  customer_name: string;
  city: string;
  state: string;
}

interface Props {
  draftProjects: DraftProject[];
  /**
   * When set, this panel is scoped to one existing project (e.g. the "Add
   * photos from CompanyCam" button on a single import row) — the "start a
   * new draft" choice and the "which draft" dropdown are hidden, and every
   * import goes straight onto this project.
   */
  fixedTarget?: { id: string; label: string };
  /** Called after a successful import, in addition to router.refresh(). */
  onImported?: () => void;
}

export default function ManualImportClient({ draftProjects, fixedTarget, onImported }: Props) {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<CCProjectSummary[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const [selectedProject, setSelectedProject] = useState<CCProjectSummary | null>(null);
  const [photos, setPhotos] = useState<CCPhoto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());

  const [destination, setDestination] = useState<"new" | "existing">(fixedTarget ? "existing" : "new");
  const [targetProjectId, setTargetProjectId] = useState<string>(fixedTarget?.id ?? draftProjects[0]?.id ?? "");

  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);

  // Track the latest fired request so a slow earlier response can't clobber
  // a faster later one (classic race when typing fast + debouncing).
  const requestId = useRef(0);

  async function runSearch(q: string) {
    if (!q.trim()) return;
    const thisRequest = ++requestId.current;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch(`/api/companycam/search?q=${encodeURIComponent(q.trim())}`);
      const text = await res.text();
      let json: any = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`Search failed (bad response from server): ${text.slice(0, 200)}`);
      }
      if (!res.ok) throw new Error(json.error ?? `Search failed (${res.status})`);
      if (thisRequest !== requestId.current) return; // a newer search already replaced this one
      setResults(json.projects ?? []);
    } catch (e) {
      if (thisRequest !== requestId.current) return;
      setSearchError(e instanceof Error ? e.message : "Search failed");
    } finally {
      if (thisRequest === requestId.current) {
        setSearching(false);
        setHasSearched(true);
      }
    }
  }

  function search(e: React.FormEvent) {
    e.preventDefault();
    void runSearch(query);
  }

  // Live address/name suggestions as you type, so you can pick a job from a
  // dropdown instead of typing the whole thing and hitting Search — the
  // Search button still works for a deliberate one-off lookup.
  useEffect(() => {
    if (selectedProject) return; // don't re-suggest once a job is picked
    if (!query.trim() || query.trim().length < 3) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    const timer = setTimeout(() => void runSearch(query), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, selectedProject]);

  async function pickProject(p: CCProjectSummary) {
    setSelectedProject(p);
    setPhotos([]);
    setSelectedPhotoIds(new Set());
    setImportResult(null);
    setImportError(null);
    setLoadingPhotos(true);
    try {
      const res = await fetch(`/api/companycam/cc-photos?projectId=${p.id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't load photos");
      setPhotos(json.photos ?? []);
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Couldn't load photos");
    } finally {
      setLoadingPhotos(false);
    }
  }

  function togglePhoto(id: string) {
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedPhotoIds(new Set(photos.map((p) => p.id)));
  }

  function selectNone() {
    setSelectedPhotoIds(new Set());
  }

  async function doImport() {
    if (!selectedProject || selectedPhotoIds.size === 0) return;
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const res = await fetch("/api/companycam/manual-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ccProjectId: selectedProject.id,
          photoIds: Array.from(selectedPhotoIds),
          targetProjectId: fixedTarget ? fixedTarget.id : destination === "existing" ? targetProjectId : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Import failed");
      const skippedNote =
        json.result.importedCount < json.result.requested && json.result.skippedReasons?.length
          ? ` Skipped: ${json.result.skippedReasons.join("; ")}`
          : "";
      setImportResult(`Imported ${json.result.importedCount} of ${json.result.requested} photo(s).${skippedNote}`);
      router.refresh();
      onImported?.();
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="mt-4 space-y-4">
      {fixedTarget && (
        <p className="text-sm text-slate-600">
          Adding photos to <span className="font-medium text-slate-900">{fixedTarget.label}</span>. Find
          the matching job in CompanyCam below and pick which photos to bring in.
        </p>
      )}

      <form onSubmit={search} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Start typing an address or customer name — a list to pick from will show up"
          className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={searching}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {searching ? "Searching…" : "Search CompanyCam"}
        </button>
      </form>
      {searchError && <p className="text-sm text-red-600">{searchError}</p>}

      {!searching && hasSearched && !searchError && results.length === 0 && !selectedProject && (
        <p className="text-sm text-slate-500">
          No CompanyCam jobs matched "{query.trim()}". Try just the street name or the customer's last name.
        </p>
      )}

      {results.length > 0 && !selectedProject && (
        <div className="space-y-2">
          {results.map((p) => (
            <button
              key={p.id}
              onClick={() => pickProject(p)}
              className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-brand-accent hover:bg-slate-50"
            >
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded bg-slate-100">
                {p.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.thumbnail_url} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div>
                <div className="font-medium text-slate-900">{p.name || "(no name)"}</div>
                <div className="text-sm text-slate-500">
                  {[p.address?.street_address_1, p.address?.city, p.address?.state].filter(Boolean).join(", ")}{" "}
                  — {p.photo_count} photo{p.photo_count === 1 ? "" : "s"}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedProject && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-slate-900">{selectedProject.name || "(no name)"}</div>
              <div className="text-sm text-slate-500">
                {[selectedProject.address?.street_address_1, selectedProject.address?.city, selectedProject.address?.state]
                  .filter(Boolean)
                  .join(", ")}
              </div>
            </div>
            <button
              onClick={() => {
                setSelectedProject(null);
                setPhotos([]);
              }}
              className="text-sm text-slate-500 underline"
            >
              Choose a different job
            </button>
          </div>

          {loadingPhotos && <p className="mt-4 text-sm text-slate-500">Loading photos…</p>}

          {!loadingPhotos && photos.length > 0 && (
            <>
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">
                  {selectedPhotoIds.size} of {photos.length} selected
                </p>
                <div className="flex gap-3 text-sm">
                  <button onClick={selectAll} className="text-brand-accent underline">
                    Select all
                  </button>
                  <button onClick={selectNone} className="text-slate-500 underline">
                    Select none
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {photos.map((photo) => {
                  const checked = selectedPhotoIds.has(photo.id);
                  return (
                    <button
                      key={photo.id}
                      onClick={() => togglePhoto(photo.id)}
                      className={`relative aspect-square overflow-hidden rounded-lg border-2 ${
                        checked ? "border-brand-accent" : "border-transparent"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {photo.original_url ? (
                        <img
                          src={photo.original_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-slate-100 px-2 text-center text-xs text-slate-500">
                          Photo unavailable
                        </div>
                      )}
                      {checked && (
                        <div className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-accent text-xs text-white">
                          ✓
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {!loadingPhotos && photos.length === 0 && (
            <p className="mt-4 text-sm text-slate-500">This CompanyCam project has no photos yet.</p>
          )}

          {photos.length > 0 && (
            <div className="mt-6 border-t border-slate-200 pt-4">
              {!fixedTarget && (
                <>
                  <p className="text-sm font-medium text-slate-700">Where should these go?</p>
                  <div className="mt-2 space-y-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        checked={destination === "new"}
                        onChange={() => setDestination("new")}
                      />
                      Start a new draft project from this job
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        checked={destination === "existing"}
                        onChange={() => setDestination("existing")}
                        disabled={draftProjects.length === 0}
                      />
                      Add to an existing draft
                      {draftProjects.length > 0 && (
                        <select
                          value={targetProjectId}
                          onChange={(e) => setTargetProjectId(e.target.value)}
                          disabled={destination !== "existing"}
                          className="ml-2 rounded border border-slate-300 px-2 py-1 text-sm disabled:opacity-50"
                        >
                          {draftProjects.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.customer_name} — {d.city}, {d.state}
                            </option>
                          ))}
                        </select>
                      )}
                    </label>
                  </div>
                </>
              )}

              <button
                onClick={doImport}
                disabled={importing || selectedPhotoIds.size === 0}
                className="mt-4 rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {importing ? "Importing…" : `Import ${selectedPhotoIds.size} photo${selectedPhotoIds.size === 1 ? "" : "s"}`}
              </button>
              {importError && <p className="mt-2 text-sm text-red-600">{importError}</p>}
              {importResult && <p className="mt-2 text-sm text-emerald-700">{importResult}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
