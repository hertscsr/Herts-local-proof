export type ProjectStatus =
  | "new"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "photos_reviewed"
  | "review_requested"
  | "review_received"
  | "story_generated"
  | "seo_reviewed"
  | "published"
  | "indexed_monitoring";

export type ServiceType =
  | "roof_replacement"
  | "roof_repair"
  | "storm_damage"
  | "siding"
  | "gutters"
  | "windows"
  | "deck_construction"
  | "composite_deck"
  | "chimney";

export type UserRole =
  | "administrator"
  | "office_staff"
  | "sales_rep"
  | "project_manager"
  | "field_crew"
  | "marketing_manager";

export interface Project {
  id: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  street_address_private: string; // RLS: admin/office only
  public_location: string; // e.g. "Near Oak St & 3rd Ave"
  city: string;
  state: string;
  zip: string;
  latitude_private: number | null; // RLS: admin/office only
  longitude_private: number | null; // RLS: admin/office only
  latitude_public: number; // jittered — safe for public map
  longitude_public: number; // jittered — safe for public map
  geocode_source: "geocoded" | "manual_pin";
  service_type: ServiceType;
  project_type: string;
  manufacturer: string | null;
  product: string | null;
  product_line: string | null;
  product_color: string | null;
  project_description: string | null;
  completion_date: string | null;
  sales_rep: string | null;
  project_manager: string | null;
  project_status: ProjectStatus;
  review_status: "not_requested" | "requested" | "received";
  publication_status: "draft" | "in_review" | "published" | "unpublished";
  slug: string;
  seo_title: string | null;
  meta_description: string | null;
  target_keyword: string | null;
  canonical_url: string | null;
  sitemap_status: "not_submitted" | "submitted" | "indexed" | "needs_recheck";
  last_gsc_check: string | null;
  created_at: string;
  updated_at: string;
}

export interface Photo {
  id: string;
  project_id: string;
  phase: "before" | "during" | "after";
  storage_path: string;
  caption: string | null;
  alt_text_auto: string | null;
  alt_text_final: string | null;
  display_order: number;
  upload_date: string;
}

export interface Review {
  id: string;
  project_id: string;
  homeowner: string;
  rating: number; // 1-5
  review: string;
  source: "manual" | "google" | "facebook";
  import_source_id: string | null;
  date: string;
  approved_for_website: boolean;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  zip: string;
  service: ServiceType;
  project_id_that_generated_lead: string | null;
  page_url: string;
  source: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  date: string;
  lead_status: "new" | "contacted" | "qualified" | "won" | "lost";
}

export interface AnalyticsEvent {
  id: string;
  visitor_session: string;
  page: string;
  project_id: string | null;
  event_type: "page_view" | "gallery_view" | "cta_click" | "lead_submit" | "map_pin_click";
  timestamp: string;
}
