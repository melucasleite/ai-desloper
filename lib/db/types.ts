// Database types for supabase/migrations/*_init.sql, in the shape
// `supabase gen types typescript --local` emits. Regenerate after schema changes.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5";
  };
  public: {
    Tables: {
      generations: {
        Row: {
          created_at: string;
          html: string;
          id: string;
          new_score: number;
          report_id: string;
          score_detail: Json;
          selected_finding_ids: string[];
          theme: Json;
        };
        Insert: {
          created_at?: string;
          html: string;
          id?: string;
          new_score: number;
          report_id: string;
          score_detail: Json;
          selected_finding_ids?: string[];
          theme: Json;
        };
        Update: {
          created_at?: string;
          html?: string;
          id?: string;
          new_score?: number;
          report_id?: string;
          score_detail?: Json;
          selected_finding_ids?: string[];
          theme?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "generations_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: false;
            referencedRelation: "reports";
            referencedColumns: ["id"];
          },
        ];
      };
      interviews: {
        Row: {
          answers: Json;
          created_at: string;
          report_id: string;
          updated_at: string;
        };
        Insert: {
          answers?: Json;
          created_at?: string;
          report_id: string;
          updated_at?: string;
        };
        Update: {
          answers?: Json;
          created_at?: string;
          report_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "interviews_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: true;
            referencedRelation: "reports";
            referencedColumns: ["id"];
          },
        ];
      };
      reports: {
        Row: {
          claim_token_hash: string;
          claimed_at: string | null;
          created_at: string;
          desktop_screenshot_path: string | null;
          findings: Json;
          five_second: Json | null;
          id: string;
          metrics: Json;
          mobile_screenshot_path: string | null;
          product_facts: Json;
          score: number;
          score_detail: Json;
          snapshot_path: string | null;
          title: string;
          uniqueness: Json;
          url: string;
          user_id: string | null;
        };
        Insert: {
          claim_token_hash: string;
          claimed_at?: string | null;
          created_at?: string;
          desktop_screenshot_path?: string | null;
          findings?: Json;
          five_second?: Json | null;
          id?: string;
          metrics: Json;
          mobile_screenshot_path?: string | null;
          product_facts?: Json;
          score: number;
          score_detail: Json;
          snapshot_path?: string | null;
          title?: string;
          uniqueness?: Json;
          url: string;
          user_id?: string | null;
        };
        Update: {
          claim_token_hash?: string;
          claimed_at?: string | null;
          created_at?: string;
          desktop_screenshot_path?: string | null;
          findings?: Json;
          five_second?: Json | null;
          id?: string;
          metrics?: Json;
          mobile_screenshot_path?: string | null;
          product_facts?: Json;
          score?: number;
          score_detail?: Json;
          snapshot_path?: string | null;
          title?: string;
          uniqueness?: Json;
          url?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      themes: {
        Row: {
          chosen: number | null;
          created_at: string;
          options: Json;
          report_id: string;
          updated_at: string;
        };
        Insert: {
          chosen?: number | null;
          created_at?: string;
          options?: Json;
          report_id: string;
          updated_at?: string;
        };
        Update: {
          chosen?: number | null;
          created_at?: string;
          options?: Json;
          report_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "themes_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: true;
            referencedRelation: "reports";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];
