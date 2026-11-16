export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      analysis_runs: {
        Row: {
          created_at: string
          formula_version: string
          id: string
          inputs: Json
          job_id: string
          rule_version: string
          snapshot_id: string
          summary: Json
        }
        Insert: {
          created_at?: string
          formula_version: string
          id?: string
          inputs: Json
          job_id: string
          rule_version: string
          snapshot_id: string
          summary: Json
        }
        Update: {
          created_at?: string
          formula_version?: string
          id?: string
          inputs?: Json
          job_id?: string
          rule_version?: string
          snapshot_id?: string
          summary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "analysis_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "pipeline_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_runs_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "chart_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      anomaly_alerts: {
        Row: {
          anomaly_type: string
          chart_id: string
          detected_at: string
          evidence: Json
          expected_value: Json | null
          id: string
          observed_value: Json | null
          platform_asset_id: string | null
          resolved_at: string | null
          severity: Database["public"]["Enums"]["severity"]
          snapshot_id: string | null
          status: Database["public"]["Enums"]["anomaly_status"]
          summary: string
        }
        Insert: {
          anomaly_type: string
          chart_id: string
          detected_at?: string
          evidence?: Json
          expected_value?: Json | null
          id?: string
          observed_value?: Json | null
          platform_asset_id?: string | null
          resolved_at?: string | null
          severity: Database["public"]["Enums"]["severity"]
          snapshot_id?: string | null
          status?: Database["public"]["Enums"]["anomaly_status"]
          summary: string
        }
        Update: {
          anomaly_type?: string
          chart_id?: string
          detected_at?: string
          evidence?: Json
          expected_value?: Json | null
          id?: string
          observed_value?: Json | null
          platform_asset_id?: string | null
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["severity"]
          snapshot_id?: string | null
          status?: Database["public"]["Enums"]["anomaly_status"]
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "anomaly_alerts_chart_id_fkey"
            columns: ["chart_id"]
            isOneToOne: false
            referencedRelation: "charts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anomaly_alerts_platform_asset_id_fkey"
            columns: ["platform_asset_id"]
            isOneToOne: false
            referencedRelation: "platform_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anomaly_alerts_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "chart_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      anomaly_reviews: {
        Row: {
          anomaly_id: string
          created_at: string
          id: string
          notes: string | null
          resolution: Database["public"]["Enums"]["anomaly_status"]
          reviewer_id: string
        }
        Insert: {
          anomaly_id: string
          created_at?: string
          id?: string
          notes?: string | null
          resolution: Database["public"]["Enums"]["anomaly_status"]
          reviewer_id: string
        }
        Update: {
          anomaly_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          resolution?: Database["public"]["Enums"]["anomaly_status"]
          reviewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "anomaly_reviews_anomaly_id_fkey"
            columns: ["anomaly_id"]
            isOneToOne: false
            referencedRelation: "anomaly_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anomaly_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_aliases: {
        Row: {
          alias: string
          artist_id: string
          created_at: string
          id: string
          language: string | null
          normalized_alias: string
          platform_id: string | null
        }
        Insert: {
          alias: string
          artist_id: string
          created_at?: string
          id?: string
          language?: string | null
          normalized_alias: string
          platform_id?: string | null
        }
        Update: {
          alias?: string
          artist_id?: string
          created_at?: string
          id?: string
          language?: string | null
          normalized_alias?: string
          platform_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "artist_aliases_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_aliases_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "platforms"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_context_profiles: {
        Row: {
          artist_id: string
          dimension: string
          run_id: string
          share: number
          songs: number
          tagged_songs: number
          term_id: string
          total_songs: number
        }
        Insert: {
          artist_id: string
          dimension: string
          run_id: string
          share: number
          songs: number
          tagged_songs: number
          term_id: string
          total_songs: number
        }
        Update: {
          artist_id?: string
          dimension?: string
          run_id?: string
          share?: number
          songs?: number
          tagged_songs?: number
          term_id?: string
          total_songs?: number
        }
        Relationships: [
          {
            foreignKeyName: "artist_context_profiles_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_context_profiles_dimension_fkey"
            columns: ["dimension"]
            isOneToOne: false
            referencedRelation: "context_dimensions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "artist_context_profiles_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "context_profile_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_context_profiles_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "context_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_context_tags: {
        Row: {
          artist_id: string
          assigned_at: string
          assigned_by: string | null
          evidence_note: string | null
          evidence_url: string | null
          id: string
          model: string | null
          prompt_version: string | null
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source: string
          status: Database["public"]["Enums"]["verification_status"]
          term_id: string
          updated_at: string
        }
        Insert: {
          artist_id: string
          assigned_at?: string
          assigned_by?: string | null
          evidence_note?: string | null
          evidence_url?: string | null
          id?: string
          model?: string | null
          prompt_version?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source: string
          status?: Database["public"]["Enums"]["verification_status"]
          term_id: string
          updated_at?: string
        }
        Update: {
          artist_id?: string
          assigned_at?: string
          assigned_by?: string | null
          evidence_note?: string | null
          evidence_url?: string | null
          id?: string
          model?: string | null
          prompt_version?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: Database["public"]["Enums"]["verification_status"]
          term_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "artist_context_tags_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_context_tags_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_context_tags_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_context_tags_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "context_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_intelligence_runs: {
        Row: {
          artists_requested: number
          attempt_number: number
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          idempotency_key: string
          metrics_written: number
          profiles_updated: number
          scheduled_for: string
          source_platform_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
        }
        Insert: {
          artists_requested?: number
          attempt_number?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          idempotency_key: string
          metrics_written?: number
          profiles_updated?: number
          scheduled_for: string
          source_platform_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
        }
        Update: {
          artists_requested?: number
          attempt_number?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          idempotency_key?: string
          metrics_written?: number
          profiles_updated?: number
          scheduled_for?: string
          source_platform_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
        }
        Relationships: [
          {
            foreignKeyName: "artist_intelligence_runs_source_platform_id_fkey"
            columns: ["source_platform_id"]
            isOneToOne: false
            referencedRelation: "platforms"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_metric_snapshots: {
        Row: {
          artist_id: string
          collected_at: string
          dimensions: Json
          id: string
          methodology_version: string
          metric_date: string
          metric_name: string
          metric_value: number
          platform_id: string
          profile_id: string
          raw_payload_id: string
          retention_class: Database["public"]["Enums"]["retention_class"]
          scope: string
          source_timestamp: string | null
          unit: string
        }
        Insert: {
          artist_id: string
          collected_at?: string
          dimensions?: Json
          id?: string
          methodology_version: string
          metric_date: string
          metric_name: string
          metric_value: number
          platform_id: string
          profile_id: string
          raw_payload_id: string
          retention_class?: Database["public"]["Enums"]["retention_class"]
          scope?: string
          source_timestamp?: string | null
          unit: string
        }
        Update: {
          artist_id?: string
          collected_at?: string
          dimensions?: Json
          id?: string
          methodology_version?: string
          metric_date?: string
          metric_name?: string
          metric_value?: number
          platform_id?: string
          profile_id?: string
          raw_payload_id?: string
          retention_class?: Database["public"]["Enums"]["retention_class"]
          scope?: string
          source_timestamp?: string | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "artist_metric_snapshots_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_metric_snapshots_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "platforms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_metric_snapshots_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "artist_platform_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_metric_snapshots_raw_payload_id_fkey"
            columns: ["raw_payload_id"]
            isOneToOne: false
            referencedRelation: "artist_source_payloads"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_platform_profiles: {
        Row: {
          artist_id: string
          confidence: number
          created_at: string
          id: string
          is_primary: boolean
          last_enriched_at: string | null
          match_method: string
          match_status: Database["public"]["Enums"]["verification_status"]
          metadata: Json
          platform_artist_id: string
          platform_id: string
          profile_url: string | null
          updated_at: string
        }
        Insert: {
          artist_id: string
          confidence?: number
          created_at?: string
          id?: string
          is_primary?: boolean
          last_enriched_at?: string | null
          match_method: string
          match_status?: Database["public"]["Enums"]["verification_status"]
          metadata?: Json
          platform_artist_id: string
          platform_id: string
          profile_url?: string | null
          updated_at?: string
        }
        Update: {
          artist_id?: string
          confidence?: number
          created_at?: string
          id?: string
          is_primary?: boolean
          last_enriched_at?: string | null
          match_method?: string
          match_status?: Database["public"]["Enums"]["verification_status"]
          metadata?: Json
          platform_artist_id?: string
          platform_id?: string
          profile_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "artist_platform_profiles_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_platform_profiles_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "platforms"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_source_payloads: {
        Row: {
          checksum: string
          id: string
          payload: Json
          profile_id: string | null
          purge_run_id: string | null
          purged_at: string | null
          received_at: string
          retention_class: Database["public"]["Enums"]["retention_class"]
          run_id: string
          source_timestamp: string | null
          source_url: string
        }
        Insert: {
          checksum: string
          id?: string
          payload: Json
          profile_id?: string | null
          purge_run_id?: string | null
          purged_at?: string | null
          received_at?: string
          retention_class?: Database["public"]["Enums"]["retention_class"]
          run_id: string
          source_timestamp?: string | null
          source_url: string
        }
        Update: {
          checksum?: string
          id?: string
          payload?: Json
          profile_id?: string | null
          purge_run_id?: string | null
          purged_at?: string | null
          received_at?: string
          retention_class?: Database["public"]["Enums"]["retention_class"]
          run_id?: string
          source_timestamp?: string | null
          source_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "artist_source_payloads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "artist_platform_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_source_payloads_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "artist_intelligence_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_verification_evidence: {
        Row: {
          artist_id: string
          created_at: string
          evidence_type: string
          id: string
          notes: string | null
          payload: Json
          reviewed_by: string | null
          source_url: string | null
          supports_country_code: string | null
          supports_locality: Database["public"]["Enums"]["locality"] | null
          verified_at: string | null
        }
        Insert: {
          artist_id: string
          created_at?: string
          evidence_type: string
          id?: string
          notes?: string | null
          payload?: Json
          reviewed_by?: string | null
          source_url?: string | null
          supports_country_code?: string | null
          supports_locality?: Database["public"]["Enums"]["locality"] | null
          verified_at?: string | null
        }
        Update: {
          artist_id?: string
          created_at?: string
          evidence_type?: string
          id?: string
          notes?: string | null
          payload?: Json
          reviewed_by?: string | null
          source_url?: string | null
          supports_country_code?: string | null
          supports_locality?: Database["public"]["Enums"]["locality"] | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "artist_verification_evidence_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_verification_evidence_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      artists: {
        Row: {
          artist_type: string
          biography: string | null
          canonical_name: string
          country_code: string | null
          created_at: string
          id: string
          image_url: string | null
          locality: Database["public"]["Enums"]["locality"]
          sort_name: string
          source_key: string | null
          updated_at: string
          verification: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          artist_type?: string
          biography?: string | null
          canonical_name: string
          country_code?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          locality?: Database["public"]["Enums"]["locality"]
          sort_name: string
          source_key?: string | null
          updated_at?: string
          verification?: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          artist_type?: string
          biography?: string | null
          canonical_name?: string
          country_code?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          locality?: Database["public"]["Enums"]["locality"]
          sort_name?: string
          source_key?: string | null
          updated_at?: string
          verification?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: []
      }
      attempt_reviews: {
        Row: {
          checksum: string | null
          created_at: string
          id: string
          job_id: string
          reason: string
          reviewer_id: string
        }
        Insert: {
          checksum?: string | null
          created_at?: string
          id?: string
          job_id: string
          reason: string
          reviewer_id: string
        }
        Update: {
          checksum?: string | null
          created_at?: string
          id?: string
          job_id?: string
          reason?: string
          reviewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attempt_reviews_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "pipeline_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempt_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_type: string
          actor_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          correlation_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: number
          reason: string | null
        }
        Insert: {
          action: string
          actor_type?: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          correlation_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: never
          reason?: string | null
        }
        Update: {
          action?: string
          actor_type?: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: never
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_rate_limits: {
        Row: {
          key: string
          requests: number
          window_start: string
        }
        Insert: {
          key: string
          requests: number
          window_start: string
        }
        Update: {
          key?: string
          requests?: number
          window_start?: string
        }
        Relationships: []
      }
      calculation_runs: {
        Row: {
          calculation_version: string
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          snapshot_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
        }
        Insert: {
          calculation_version: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          snapshot_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
        }
        Update: {
          calculation_version?: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          snapshot_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
        }
        Relationships: [
          {
            foreignKeyName: "calculation_runs_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "chart_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_operations: {
        Row: {
          action: string
          actor_id: string
          after_data: Json
          before_data: Json
          created_at: string
          id: string
          reason: string
          source_id: string
          target_id: string | null
        }
        Insert: {
          action: string
          actor_id: string
          after_data: Json
          before_data: Json
          created_at?: string
          id?: string
          reason: string
          source_id: string
          target_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          after_data?: Json
          before_data?: Json
          created_at?: string
          id?: string
          reason?: string
          source_id?: string
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_operations_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_operations_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_operations_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_entries: {
        Row: {
          days_on_chart: number
          entry_status: Database["public"]["Enums"]["entry_status"]
          id: string
          momentum_score: number | null
          peak_rank: number
          platform_asset_id: string
          previous_rank: number | null
          rank: number
          rank_change: number | null
          raw_metadata: Json
          snapshot_id: string
          song_id: string
        }
        Insert: {
          days_on_chart: number
          entry_status: Database["public"]["Enums"]["entry_status"]
          id?: string
          momentum_score?: number | null
          peak_rank: number
          platform_asset_id: string
          previous_rank?: number | null
          rank: number
          rank_change?: number | null
          raw_metadata?: Json
          snapshot_id: string
          song_id: string
        }
        Update: {
          days_on_chart?: number
          entry_status?: Database["public"]["Enums"]["entry_status"]
          id?: string
          momentum_score?: number | null
          peak_rank?: number
          platform_asset_id?: string
          previous_rank?: number | null
          rank?: number
          rank_change?: number | null
          raw_metadata?: Json
          snapshot_id?: string
          song_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_entries_platform_asset_id_fkey"
            columns: ["platform_asset_id"]
            isOneToOne: false
            referencedRelation: "platform_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_entries_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "chart_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_entries_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_metrics: {
        Row: {
          entry_id: string
          metrics: Json
          run_id: string
          song_id: string
        }
        Insert: {
          entry_id: string
          metrics: Json
          run_id: string
          song_id: string
        }
        Update: {
          entry_id?: string
          metrics?: Json
          run_id?: string
          song_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_metrics_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "chart_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_metrics_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "chart_facts"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "chart_metrics_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_metrics_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_snapshots: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          chart_id: string
          checksum: string
          collected_at: string
          collection_job_id: string
          created_at: string
          entry_count: number
          id: string
          is_complete: boolean
          methodology_version_id: string | null
          raw_payload_id: string
          revision_of: string | null
          snapshot_date: string
          source_timestamp: string | null
          status: Database["public"]["Enums"]["snapshot_status"]
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          chart_id: string
          checksum: string
          collected_at: string
          collection_job_id: string
          created_at?: string
          entry_count: number
          id?: string
          is_complete?: boolean
          methodology_version_id?: string | null
          raw_payload_id: string
          revision_of?: string | null
          snapshot_date: string
          source_timestamp?: string | null
          status?: Database["public"]["Enums"]["snapshot_status"]
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          chart_id?: string
          checksum?: string
          collected_at?: string
          collection_job_id?: string
          created_at?: string
          entry_count?: number
          id?: string
          is_complete?: boolean
          methodology_version_id?: string | null
          raw_payload_id?: string
          revision_of?: string | null
          snapshot_date?: string
          source_timestamp?: string | null
          status?: Database["public"]["Enums"]["snapshot_status"]
        }
        Relationships: [
          {
            foreignKeyName: "chart_snapshots_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_snapshots_chart_id_fkey"
            columns: ["chart_id"]
            isOneToOne: false
            referencedRelation: "charts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_snapshots_collection_job_id_fkey"
            columns: ["collection_job_id"]
            isOneToOne: false
            referencedRelation: "collection_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_snapshots_methodology_version_id_fkey"
            columns: ["methodology_version_id"]
            isOneToOne: false
            referencedRelation: "methodology_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_snapshots_raw_payload_id_fkey"
            columns: ["raw_payload_id"]
            isOneToOne: false
            referencedRelation: "raw_payloads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_snapshots_revision_of_fkey"
            columns: ["revision_of"]
            isOneToOne: false
            referencedRelation: "chart_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      charts: {
        Row: {
          active: boolean
          chart_type: string
          country_code: string
          created_at: string
          frequency: string
          id: string
          maximum_entries: number
          name: string
          platform_id: string
          slug: string
        }
        Insert: {
          active?: boolean
          chart_type?: string
          country_code: string
          created_at?: string
          frequency?: string
          id?: string
          maximum_entries: number
          name: string
          platform_id: string
          slug: string
        }
        Update: {
          active?: boolean
          chart_type?: string
          country_code?: string
          created_at?: string
          frequency?: string
          id?: string
          maximum_entries?: number
          name?: string
          platform_id?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "charts_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "platforms"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_attempts: {
        Row: {
          attempt_number: number
          checksum: string | null
          error_code: string | null
          http_status: number | null
          id: string
          job_id: string
          lease_token: string
          purge_run_id: string | null
          purged_at: string | null
          raw_body: string | null
          received_at: string
          retention_class: Database["public"]["Enums"]["retention_class"]
          source_url: string
        }
        Insert: {
          attempt_number: number
          checksum?: string | null
          error_code?: string | null
          http_status?: number | null
          id?: string
          job_id: string
          lease_token: string
          purge_run_id?: string | null
          purged_at?: string | null
          raw_body?: string | null
          received_at?: string
          retention_class?: Database["public"]["Enums"]["retention_class"]
          source_url: string
        }
        Update: {
          attempt_number?: number
          checksum?: string | null
          error_code?: string | null
          http_status?: number | null
          id?: string
          job_id?: string
          lease_token?: string
          purge_run_id?: string | null
          purged_at?: string | null
          raw_body?: string | null
          received_at?: string
          retention_class?: Database["public"]["Enums"]["retention_class"]
          source_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_attempts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "pipeline_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_jobs: {
        Row: {
          attempt_number: number
          chart_id: string
          completed_at: string | null
          correlation_id: string
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          idempotency_key: string
          items_received: number | null
          scheduled_for: string
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
        }
        Insert: {
          attempt_number?: number
          chart_id: string
          completed_at?: string | null
          correlation_id?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          idempotency_key: string
          items_received?: number | null
          scheduled_for: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
        }
        Update: {
          attempt_number?: number
          chart_id?: string
          completed_at?: string | null
          correlation_id?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string
          items_received?: number | null
          scheduled_for?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
        }
        Relationships: [
          {
            foreignKeyName: "collection_jobs_chart_id_fkey"
            columns: ["chart_id"]
            isOneToOne: false
            referencedRelation: "charts"
            referencedColumns: ["id"]
          },
        ]
      }
      context_dimensions: {
        Row: {
          code: string
          label_en: string
          label_mn: string
          level: string
          sort_order: number
        }
        Insert: {
          code: string
          label_en: string
          label_mn: string
          level: string
          sort_order: number
        }
        Update: {
          code?: string
          label_en?: string
          label_mn?: string
          level?: string
          sort_order?: number
        }
        Relationships: [
        ]
      }
      context_profile_runs: {
        Row: {
          artists: number
          calculated_by: string | null
          created_at: string
          id: string
          method_version: string
          parameters: Json
        }
        Insert: {
          artists: number
          calculated_by?: string | null
          created_at?: string
          id?: string
          method_version: string
          parameters: Json
        }
        Update: {
          artists?: number
          calculated_by?: string | null
          created_at?: string
          id?: string
          method_version?: string
          parameters?: Json
        }
        Relationships: [
          {
            foreignKeyName: "context_profile_runs_calculated_by_fkey"
            columns: ["calculated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      context_terms: {
        Row: {
          created_at: string
          description_en: string | null
          description_mn: string | null
          dimension: string
          id: string
          label_en: string
          label_mn: string
          parent_id: string | null
          proposed_by: string | null
          slug: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description_en?: string | null
          description_mn?: string | null
          dimension: string
          id?: string
          label_en: string
          label_mn: string
          parent_id?: string | null
          proposed_by?: string | null
          slug: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description_en?: string | null
          description_mn?: string | null
          dimension?: string
          id?: string
          label_en?: string
          label_mn?: string
          parent_id?: string | null
          proposed_by?: string | null
          slug?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "context_terms_dimension_fkey"
            columns: ["dimension"]
            isOneToOne: false
            referencedRelation: "context_dimensions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "context_terms_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "context_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "context_terms_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_briefs: {
        Row: {
          body_mn: string
          created_at: string
          facts: Json
          id: string
          run_id: string
          snapshot_id: string
        }
        Insert: {
          body_mn: string
          created_at?: string
          facts: Json
          id?: string
          run_id: string
          snapshot_id: string
        }
        Update: {
          body_mn?: string
          created_at?: string
          facts?: Json
          id?: string
          run_id?: string
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_briefs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: true
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_briefs_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "chart_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      editorial_drafts: {
        Row: {
          author_id: string
          body_en: string | null
          body_mn: string
          created_at: string
          headline_en: string | null
          headline_mn: string
          id: string
          story_id: string
        }
        Insert: {
          author_id: string
          body_en?: string | null
          body_mn: string
          created_at?: string
          headline_en?: string | null
          headline_mn: string
          id?: string
          story_id: string
        }
        Update: {
          author_id?: string
          body_en?: string | null
          body_mn?: string
          created_at?: string
          headline_en?: string | null
          headline_mn?: string
          id?: string
          story_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "editorial_drafts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editorial_drafts_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "story_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_match_reviews: {
        Row: {
          confidence: number | null
          created_at: string
          evidence: Json
          id: string
          platform_asset_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          suggested_recording_id: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          evidence?: Json
          id?: string
          platform_asset_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          suggested_recording_id?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          evidence?: Json
          id?: string
          platform_asset_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          suggested_recording_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entity_match_reviews_platform_asset_id_fkey"
            columns: ["platform_asset_id"]
            isOneToOne: false
            referencedRelation: "platform_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_match_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_match_reviews_suggested_recording_id_fkey"
            columns: ["suggested_recording_id"]
            isOneToOne: false
            referencedRelation: "recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      methodology_configuration: {
        Row: {
          code: string
          created_at: string
          parameters: Json
        }
        Insert: {
          code: string
          created_at?: string
          parameters: Json
        }
        Update: {
          code?: string
          created_at?: string
          parameters?: Json
        }
        Relationships: []
      }
      methodology_versions: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_until: string | null
          id: string
          notes: string
          title: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_until?: string | null
          id?: string
          notes: string
          title: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_until?: string | null
          id?: string
          notes?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "methodology_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_jobs: {
        Row: {
          attempts: number
          available_at: string
          business_date: string
          collection_job_id: string | null
          completed_at: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          idempotency_key: string
          kind: string
          lease_token: string | null
          lease_until: string | null
          reason: string | null
          requested_by: string | null
          revision_of: string | null
          snapshot_id: string | null
          status: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          business_date: string
          collection_job_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          idempotency_key: string
          kind: string
          lease_token?: string | null
          lease_until?: string | null
          reason?: string | null
          requested_by?: string | null
          revision_of?: string | null
          snapshot_id?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          available_at?: string
          business_date?: string
          collection_job_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string
          kind?: string
          lease_token?: string | null
          lease_until?: string | null
          reason?: string | null
          requested_by?: string | null
          revision_of?: string | null
          snapshot_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_jobs_collection_job_id_fkey"
            columns: ["collection_job_id"]
            isOneToOne: false
            referencedRelation: "collection_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_jobs_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_jobs_revision_of_fkey"
            columns: ["revision_of"]
            isOneToOne: false
            referencedRelation: "chart_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_jobs_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "chart_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_assets: {
        Row: {
          active: boolean
          artwork_url: string | null
          duration_ms: number | null
          first_seen_at: string
          id: string
          last_seen_at: string
          platform_album: string | null
          platform_artist_id: string | null
          platform_artist_name: string
          platform_id: string
          platform_item_id: string
          platform_title: string
          platform_url: string | null
          raw_metadata: Json
          recording_id: string | null
        }
        Insert: {
          active?: boolean
          artwork_url?: string | null
          duration_ms?: number | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          platform_album?: string | null
          platform_artist_id?: string | null
          platform_artist_name: string
          platform_id: string
          platform_item_id: string
          platform_title: string
          platform_url?: string | null
          raw_metadata?: Json
          recording_id?: string | null
        }
        Update: {
          active?: boolean
          artwork_url?: string | null
          duration_ms?: number | null
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          platform_album?: string | null
          platform_artist_id?: string | null
          platform_artist_name?: string
          platform_id?: string
          platform_item_id?: string
          platform_title?: string
          platform_url?: string | null
          raw_metadata?: Json
          recording_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_assets_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "platforms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_assets_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      platforms: {
        Row: {
          base_region: string | null
          code: string
          created_at: string
          id: string
          name: string
          status: string
        }
        Insert: {
          base_region?: string | null
          code: string
          created_at?: string
          id?: string
          name: string
          status?: string
        }
        Update: {
          base_region?: string | null
          code?: string
          created_at?: string
          id?: string
          name?: string
          status?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          display_name: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      publications: {
        Row: {
          author_id: string
          body_en: string | null
          body_mn: string
          channel: string
          draft_id: string
          editor_id: string
          external_url: string | null
          headline_en: string | null
          headline_mn: string
          id: string
          published_at: string
          source_facts: Json
          story_id: string
        }
        Insert: {
          author_id: string
          body_en?: string | null
          body_mn: string
          channel: string
          draft_id: string
          editor_id: string
          external_url?: string | null
          headline_en?: string | null
          headline_mn: string
          id?: string
          published_at?: string
          source_facts: Json
          story_id: string
        }
        Update: {
          author_id?: string
          body_en?: string | null
          body_mn?: string
          channel?: string
          draft_id?: string
          editor_id?: string
          external_url?: string | null
          headline_en?: string | null
          headline_mn?: string
          id?: string
          published_at?: string
          source_facts?: Json
          story_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "publications_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publications_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "editorial_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publications_editor_id_fkey"
            columns: ["editor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publications_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "story_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_payloads: {
        Row: {
          checksum: string
          collection_job_id: string
          id: string
          payload: Json
          purge_run_id: string | null
          purged_at: string | null
          received_at: string
          retention_class: Database["public"]["Enums"]["retention_class"]
          source_timestamp: string | null
          source_url: string
        }
        Insert: {
          checksum: string
          collection_job_id: string
          id?: string
          payload: Json
          purge_run_id?: string | null
          purged_at?: string | null
          received_at?: string
          retention_class?: Database["public"]["Enums"]["retention_class"]
          source_timestamp?: string | null
          source_url: string
        }
        Update: {
          checksum?: string
          collection_job_id?: string
          id?: string
          payload?: Json
          purge_run_id?: string | null
          purged_at?: string | null
          received_at?: string
          retention_class?: Database["public"]["Enums"]["retention_class"]
          source_timestamp?: string | null
          source_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_payloads_collection_job_id_fkey"
            columns: ["collection_job_id"]
            isOneToOne: false
            referencedRelation: "collection_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      recordings: {
        Row: {
          created_at: string
          duration_ms: number | null
          id: string
          isrc: string | null
          recording_type: string
          release_date: string | null
          song_id: string
          version_name: string | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          id?: string
          isrc?: string | null
          recording_type?: string
          release_date?: string | null
          song_id: string
          version_name?: string | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          id?: string
          isrc?: string | null
          recording_type?: string
          release_date?: string | null
          song_id?: string
          version_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recordings_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_runs: {
        Row: {
          business_date: string
          completed_at: string
          counts: Json
          id: string
          job_id: string | null
          metadata_cutoff: string
          methodology_version: string
          mode: string
          started_at: string
          statistics_cutoff: string
        }
        Insert: {
          business_date: string
          completed_at?: string
          counts: Json
          id?: string
          job_id?: string | null
          metadata_cutoff: string
          methodology_version: string
          mode: string
          started_at: string
          statistics_cutoff: string
        }
        Update: {
          business_date?: string
          completed_at?: string
          counts?: Json
          id?: string
          job_id?: string | null
          metadata_cutoff?: string
          methodology_version?: string
          mode?: string
          started_at?: string
          statistics_cutoff?: string
        }
        Relationships: [
          {
            foreignKeyName: "retention_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "pipeline_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      signal_evidence: {
        Row: {
          chart_entry_id: string | null
          created_at: string
          evidence_type: string
          id: string
          payload: Json
          signal_id: string
        }
        Insert: {
          chart_entry_id?: string | null
          created_at?: string
          evidence_type: string
          id?: string
          payload: Json
          signal_id: string
        }
        Update: {
          chart_entry_id?: string | null
          created_at?: string
          evidence_type?: string
          id?: string
          payload?: Json
          signal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signal_evidence_chart_entry_id_fkey"
            columns: ["chart_entry_id"]
            isOneToOne: false
            referencedRelation: "chart_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signal_evidence_chart_entry_id_fkey"
            columns: ["chart_entry_id"]
            isOneToOne: false
            referencedRelation: "chart_facts"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "signal_evidence_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      signals: {
        Row: {
          analysis_run_id: string | null
          artist_id: string | null
          chart_id: string
          confidence: number
          detected_at: string
          headline_summary: string
          id: string
          rule_version: string
          severity: Database["public"]["Enums"]["severity"]
          signal_type: string
          snapshot_id: string
          song_id: string | null
          status: Database["public"]["Enums"]["signal_status"]
        }
        Insert: {
          analysis_run_id?: string | null
          artist_id?: string | null
          chart_id: string
          confidence: number
          detected_at?: string
          headline_summary: string
          id?: string
          rule_version: string
          severity: Database["public"]["Enums"]["severity"]
          signal_type: string
          snapshot_id: string
          song_id?: string | null
          status?: Database["public"]["Enums"]["signal_status"]
        }
        Update: {
          analysis_run_id?: string | null
          artist_id?: string | null
          chart_id?: string
          confidence?: number
          detected_at?: string
          headline_summary?: string
          id?: string
          rule_version?: string
          severity?: Database["public"]["Enums"]["severity"]
          signal_type?: string
          snapshot_id?: string
          song_id?: string | null
          status?: Database["public"]["Enums"]["signal_status"]
        }
        Relationships: [
          {
            foreignKeyName: "signals_analysis_run_id_fkey"
            columns: ["analysis_run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signals_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signals_chart_id_fkey"
            columns: ["chart_id"]
            isOneToOne: false
            referencedRelation: "charts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signals_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "chart_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signals_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      song_aliases: {
        Row: {
          alias: string
          id: string
          song_id: string
        }
        Insert: {
          alias: string
          id?: string
          song_id: string
        }
        Update: {
          alias?: string
          id?: string
          song_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "song_aliases_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      song_artists: {
        Row: {
          artist_id: string
          credit_order: number
          credit_role: string
          song_id: string
        }
        Insert: {
          artist_id: string
          credit_order?: number
          credit_role?: string
          song_id: string
        }
        Update: {
          artist_id?: string
          credit_order?: number
          credit_role?: string
          song_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "song_artists_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "song_artists_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      song_context_tags: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          evidence_note: string | null
          evidence_url: string | null
          id: string
          model: string | null
          prompt_version: string | null
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          song_id: string
          source: string
          status: Database["public"]["Enums"]["verification_status"]
          term_id: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          evidence_note?: string | null
          evidence_url?: string | null
          id?: string
          model?: string | null
          prompt_version?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          song_id: string
          source: string
          status?: Database["public"]["Enums"]["verification_status"]
          term_id: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          evidence_note?: string | null
          evidence_url?: string | null
          id?: string
          model?: string | null
          prompt_version?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          song_id?: string
          source?: string
          status?: Database["public"]["Enums"]["verification_status"]
          term_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "song_context_tags_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "song_context_tags_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "song_context_tags_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "song_context_tags_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "context_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      song_source_genres: {
        Row: {
          chart_entry_id: string | null
          first_seen_at: string
          song_id: string
          source: string
          value: string
        }
        Insert: {
          chart_entry_id?: string | null
          first_seen_at?: string
          song_id: string
          source: string
          value: string
        }
        Update: {
          chart_entry_id?: string | null
          first_seen_at?: string
          song_id?: string
          source?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "song_source_genres_chart_entry_id_fkey"
            columns: ["chart_entry_id"]
            isOneToOne: false
            referencedRelation: "chart_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "song_source_genres_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      songs: {
        Row: {
          artwork_url: string | null
          canonical_title: string
          created_at: string
          explicit: boolean | null
          genre: string | null
          id: string
          language: string | null
          locality: Database["public"]["Enums"]["locality"]
          normalized_title: string
          primary_artist_id: string | null
          redirect_to: string | null
          release_date: string | null
          source_key: string | null
          updated_at: string
          verification: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          artwork_url?: string | null
          canonical_title: string
          created_at?: string
          explicit?: boolean | null
          genre?: string | null
          id?: string
          language?: string | null
          locality?: Database["public"]["Enums"]["locality"]
          normalized_title: string
          primary_artist_id?: string | null
          redirect_to?: string | null
          release_date?: string | null
          source_key?: string | null
          updated_at?: string
          verification?: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          artwork_url?: string | null
          canonical_title?: string
          created_at?: string
          explicit?: boolean | null
          genre?: string | null
          id?: string
          language?: string | null
          locality?: Database["public"]["Enums"]["locality"]
          normalized_title?: string
          primary_artist_id?: string | null
          redirect_to?: string | null
          release_date?: string | null
          source_key?: string | null
          updated_at?: string
          verification?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "songs_primary_artist_id_fkey"
            columns: ["primary_artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "songs_redirect_to_fkey"
            columns: ["redirect_to"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      source_genre_mappings: {
        Row: {
          reviewed_at: string | null
          reviewed_by: string | null
          source: string
          source_value: string
          status: Database["public"]["Enums"]["verification_status"]
          term_id: string | null
          updated_at: string
        }
        Insert: {
          reviewed_at?: string | null
          reviewed_by?: string | null
          source: string
          source_value: string
          status?: Database["public"]["Enums"]["verification_status"]
          term_id?: string | null
          updated_at?: string
        }
        Update: {
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          source_value?: string
          status?: Database["public"]["Enums"]["verification_status"]
          term_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_genre_mappings_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_genre_mappings_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "context_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      story_leads: {
        Row: {
          angle: string
          approved_draft_id: string | null
          assigned_to: string | null
          confidence: number | null
          created_at: string
          deadline: string | null
          editor_id: string | null
          format: string | null
          headline: string
          historical_context: string | null
          id: string
          priority: string
          revision: number
          signal_id: string | null
          status: Database["public"]["Enums"]["story_status"]
          supporting_facts: Json
          updated_at: string
        }
        Insert: {
          angle: string
          approved_draft_id?: string | null
          assigned_to?: string | null
          confidence?: number | null
          created_at?: string
          deadline?: string | null
          editor_id?: string | null
          format?: string | null
          headline: string
          historical_context?: string | null
          id?: string
          priority?: string
          revision?: number
          signal_id?: string | null
          status?: Database["public"]["Enums"]["story_status"]
          supporting_facts?: Json
          updated_at?: string
        }
        Update: {
          angle?: string
          approved_draft_id?: string | null
          assigned_to?: string | null
          confidence?: number | null
          created_at?: string
          deadline?: string | null
          editor_id?: string | null
          format?: string | null
          headline?: string
          historical_context?: string | null
          id?: string
          priority?: string
          revision?: number
          signal_id?: string | null
          status?: Database["public"]["Enums"]["story_status"]
          supporting_facts?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approved_draft_fk"
            columns: ["approved_draft_id"]
            isOneToOne: false
            referencedRelation: "editorial_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_leads_editor_id_fkey"
            columns: ["editor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_leads_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "signals"
            referencedColumns: ["id"]
          },
        ]
      }
      taxonomy_versions: {
        Row: {
          action: string
          after_data: Json | null
          before_data: Json | null
          changed_by: string | null
          created_at: string
          reason: string
          term_id: string | null
          version: number
        }
        Insert: {
          action: string
          after_data?: Json | null
          before_data?: Json | null
          changed_by?: string | null
          created_at?: string
          reason: string
          term_id?: string | null
          version: number
        }
        Update: {
          action?: string
          after_data?: Json | null
          before_data?: Json | null
          changed_by?: string | null
          created_at?: string
          reason?: string
          term_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "taxonomy_versions_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taxonomy_versions_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "context_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      youtube_search_tasks: {
        Row: {
          business_date: string
          channel_id: string | null
          completed_at: string | null
          created_at: string
          id: string
          job_id: string | null
          query: string
          quota_units: number
          results: number | null
          song_id: string
          status: string
        }
        Insert: {
          business_date: string
          channel_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          query: string
          quota_units?: number
          results?: number | null
          song_id: string
          status?: string
        }
        Update: {
          business_date?: string
          channel_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          query?: string
          quota_units?: number
          results?: number | null
          song_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "youtube_search_tasks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "pipeline_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "youtube_search_tasks_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      youtube_video_assets: {
        Row: {
          asset_kind: Database["public"]["Enums"]["youtube_asset_kind"] | null
          channel_id: string
          created_at: string
          discovery_attempt_id: string | null
          discovery_source: Database["public"]["Enums"]["youtube_discovery_source"]
          duration_seconds: number | null
          is_primary: boolean
          is_short: boolean
          link_method: string | null
          link_status: Database["public"]["Enums"]["youtube_link_status"]
          linked_at: string | null
          linked_by: string | null
          metadata_purged_at: string | null
          metadata_refreshed_at: string | null
          platform_asset_id: string
          published_at: string | null
          suggested_kind: Database["public"]["Enums"]["youtube_asset_kind"] | null
          updated_at: string
          verification: Database["public"]["Enums"]["verification_status"]
          video_id: string
        }
        Insert: {
          asset_kind?: Database["public"]["Enums"]["youtube_asset_kind"] | null
          channel_id: string
          created_at?: string
          discovery_attempt_id?: string | null
          discovery_source: Database["public"]["Enums"]["youtube_discovery_source"]
          duration_seconds?: number | null
          is_primary?: boolean
          is_short?: boolean
          link_method?: string | null
          link_status?: Database["public"]["Enums"]["youtube_link_status"]
          linked_at?: string | null
          linked_by?: string | null
          metadata_purged_at?: string | null
          metadata_refreshed_at?: string | null
          platform_asset_id: string
          published_at?: string | null
          suggested_kind?: Database["public"]["Enums"]["youtube_asset_kind"] | null
          updated_at?: string
          verification?: Database["public"]["Enums"]["verification_status"]
          video_id: string
        }
        Update: {
          asset_kind?: Database["public"]["Enums"]["youtube_asset_kind"] | null
          channel_id?: string
          created_at?: string
          discovery_attempt_id?: string | null
          discovery_source?: Database["public"]["Enums"]["youtube_discovery_source"]
          duration_seconds?: number | null
          is_primary?: boolean
          is_short?: boolean
          link_method?: string | null
          link_status?: Database["public"]["Enums"]["youtube_link_status"]
          linked_at?: string | null
          linked_by?: string | null
          metadata_purged_at?: string | null
          metadata_refreshed_at?: string | null
          platform_asset_id?: string
          published_at?: string | null
          suggested_kind?: Database["public"]["Enums"]["youtube_asset_kind"] | null
          updated_at?: string
          verification?: Database["public"]["Enums"]["verification_status"]
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "youtube_video_assets_discovery_attempt_id_fkey"
            columns: ["discovery_attempt_id"]
            isOneToOne: false
            referencedRelation: "collection_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "youtube_video_assets_linked_by_fkey"
            columns: ["linked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "youtube_video_assets_platform_asset_id_fkey"
            columns: ["platform_asset_id"]
            isOneToOne: true
            referencedRelation: "platform_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      youtube_watchlist: {
        Row: {
          active: boolean
          added_by: string | null
          created_at: string
          discovery_source: Database["public"]["Enums"]["youtube_discovery_source"]
          platform_asset_id: string
          reason: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          added_by?: string | null
          created_at?: string
          discovery_source: Database["public"]["Enums"]["youtube_discovery_source"]
          platform_asset_id: string
          reason: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          added_by?: string | null
          created_at?: string
          discovery_source?: Database["public"]["Enums"]["youtube_discovery_source"]
          platform_asset_id?: string
          reason?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "youtube_watchlist_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "youtube_watchlist_platform_asset_id_fkey"
            columns: ["platform_asset_id"]
            isOneToOne: true
            referencedRelation: "youtube_video_assets"
            referencedColumns: ["platform_asset_id"]
          },
          {
            foreignKeyName: "youtube_watchlist_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      artist_chart_career_stats: {
        Row: {
          artist_id: string | null
          chart_id: string | null
          charting_days: number | null
          first_chart_date: string | null
          latest_chart_date: string | null
          number_one_entry_days: number | null
          peak_rank: number | null
          songs_charted: number | null
          top_ten_entry_days: number | null
          total_entry_days: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chart_snapshots_chart_id_fkey"
            columns: ["chart_id"]
            isOneToOne: false
            referencedRelation: "charts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "song_artists_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_chart_daily_stats: {
        Row: {
          artist_id: string | null
          best_rank: number | null
          chart_id: string | null
          charting_songs: number | null
          net_rank_change: number | null
          new_entries: number | null
          number_one_songs: number | null
          snapshot_date: string | null
          top_ten_songs: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chart_snapshots_chart_id_fkey"
            columns: ["chart_id"]
            isOneToOne: false
            referencedRelation: "charts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "song_artists_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      artist_latest_metrics: {
        Row: {
          artist_id: string | null
          collected_at: string | null
          methodology_version: string | null
          metric_date: string | null
          metric_name: string | null
          metric_value: number | null
          platform_code: string | null
          platform_id: string | null
          platform_name: string | null
          scope: string | null
          unit: string | null
        }
        Relationships: [
          {
            foreignKeyName: "artist_metric_snapshots_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_metric_snapshots_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "platforms"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_facts: {
        Row: {
          artist: string | null
          artist_id: string | null
          chart_id: string | null
          collected_song_id: string | null
          entry_id: string | null
          locality: Database["public"]["Enums"]["locality"] | null
          platform_asset_id: string | null
          rank: number | null
          raw_metadata: Json | null
          snapshot_date: string | null
          snapshot_id: string | null
          song_id: string | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chart_entries_platform_asset_id_fkey"
            columns: ["platform_asset_id"]
            isOneToOne: false
            referencedRelation: "platform_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_entries_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "chart_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_entries_song_id_fkey"
            columns: ["collected_song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_snapshots_chart_id_fkey"
            columns: ["chart_id"]
            isOneToOne: false
            referencedRelation: "charts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "songs_primary_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      current_chart_metrics: {
        Row: {
          created_at: string | null
          entry_id: string | null
          formula_version: string | null
          metrics: Json | null
          rule_version: string | null
          run_id: string | null
          snapshot_id: string | null
          song_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analysis_runs_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "chart_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_metrics_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "chart_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_metrics_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "chart_facts"
            referencedColumns: ["entry_id"]
          },
          {
            foreignKeyName: "chart_metrics_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_metrics_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      latest_artist_context_profiles: {
        Row: {
          artist_id: string | null
          dimension: string | null
          run_id: string | null
          share: number | null
          songs: number | null
          tagged_songs: number | null
          term_id: string | null
          total_songs: number | null
        }
        Relationships: [
          {
            foreignKeyName: "artist_context_profiles_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_context_profiles_dimension_fkey"
            columns: ["dimension"]
            isOneToOne: false
            referencedRelation: "context_dimensions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "artist_context_profiles_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "context_profile_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_context_profiles_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "context_terms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_youtube_retention: {
        Args: { p_job?: string; p_now: string }
        Returns: Json
      }
      catalog_operation: {
        Args: {
          p_action: string
          p_fingerprint?: string
          p_preview?: boolean
          p_reason: string
          p_recordings: string[]
          p_source: string
          p_target: string
        }
        Returns: Json
      }
      change_context_term: {
        Args: {
          p_action: string
          p_description_en?: string
          p_description_mn?: string
          p_dimension?: string
          p_label_en?: string
          p_label_mn?: string
          p_parent?: string
          p_reason: string
          p_slug?: string
          p_term?: string
        }
        Returns: string
      }
      claim_pipeline_job: {
        Args: never
        Returns: {
          attempts: number
          available_at: string
          business_date: string
          collection_job_id: string | null
          completed_at: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          idempotency_key: string
          kind: string
          lease_token: string | null
          lease_until: string | null
          reason: string | null
          requested_by: string | null
          revision_of: string | null
          snapshot_id: string | null
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "pipeline_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_analysis: {
        Args: {
          p_brief: string
          p_inputs: Json
          p_job: string
          p_metrics: Json
          p_signals: Json
          p_summary: Json
          p_token: string
          p_version: string
        }
        Returns: string
      }
      complete_collection: {
        Args: {
          p_attempt: string
          p_entries: Json
          p_job: string
          p_payload: Json
          p_token: string
        }
        Returns: string
      }
      complete_youtube_discovery: {
        Args: { p_job: string; p_summary: Json; p_token: string }
        Returns: undefined
      }
      consume_auth_limit: { Args: { p_key: string }; Returns: boolean }
      create_catalog_song: {
        Args: { p_artist: string; p_reason: string; p_title: string }
        Returns: string
      }
      enqueue_collection: {
        Args: { p_date: string; p_reason?: string; p_revision_of?: string }
        Returns: string
      }
      enqueue_reprocessing: {
        Args: { p_from: string; p_reason: string }
        Returns: number
      }
      enqueue_youtube_discovery: {
        Args: { p_date?: string }
        Returns: string
      }
      enqueue_youtube_retention: { Args: { p_date?: string }; Returns: string }
      finish_pipeline_failure: {
        Args: {
          p_code: string
          p_job: string
          p_message: string
          p_retry_seconds?: number
          p_review?: boolean
          p_token: string
        }
        Returns: undefined
      }
      finish_youtube_search_task: {
        Args: {
          p_job: string
          p_results: number
          p_status: string
          p_task: string
          p_token: string
          p_units: number
        }
        Returns: undefined
      }
      import_musicbrainz_artists: {
        Args: { p_curated?: Json; p_payload: Json }
        Returns: Json
      }
      ingest_apple_music_snapshot: {
        Args: {
          p_checksum: string
          p_entries: Json
          p_job_id: string
          p_payload: Json
          p_snapshot_date: string
          p_source_timestamp: string
          p_source_url: string
        }
        Returns: string
      }
      match_title_key: {
        Args: { p_value: string }
        Returns: string
      }
      next_taxonomy_version: {
        Args: never
        Returns: number
      }
      normalize_catalog_text: { Args: { value: string }; Returns: string }
      queue_youtube_chart_searches: {
        Args: { p_job: string; p_token: string }
        Returns: {
          business_date: string
          channel_id: string | null
          completed_at: string | null
          created_at: string
          id: string
          job_id: string | null
          query: string
          quota_units: number
          results: number | null
          song_id: string
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "youtube_search_tasks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      record_ai_tag_suggestions: {
        Args: { p_items: Json; p_model: string; p_prompt_version: string }
        Returns: number
      }
      record_manual_youtube_video: {
        Args: {
          p_actor: string
          p_checksum: string
          p_http_status: number
          p_raw_body: string
          p_reason: string
          p_source_url: string
          p_video: Json
        }
        Returns: Json
      }
      record_youtube_candidates: {
        Args: {
          p_attempt: string
          p_job: string
          p_source: Database["public"]["Enums"]["youtube_discovery_source"]
          p_token: string
          p_videos: Json
        }
        Returns: Json
      }
      request_collection_revision: {
        Args: { p_reason: string; p_snapshot: string }
        Returns: string
      }
      request_reprocessing: {
        Args: { p_reason: string; p_snapshot: string }
        Returns: number
      }
      review_artist_identity: {
        Args: {
          p_artist_id: string
          p_artist_type: string
          p_canonical_name: string
          p_country_code: string
          p_evidence_notes?: string
          p_evidence_type?: string
          p_evidence_url?: string
          p_locality: Database["public"]["Enums"]["locality"]
          p_verification: Database["public"]["Enums"]["verification_status"]
          p_youtube_channel_id?: string
          p_youtube_profile_url?: string
        }
        Returns: string
      }
      review_context_tag: {
        Args: {
          p_decision: string
          p_kind: string
          p_reason: string
          p_tag: string
        }
        Returns: undefined
      }
      review_genre_mapping: {
        Args: {
          p_reason: string
          p_source: string
          p_term: string
          p_value: string
          p_verify: boolean
        }
        Returns: undefined
      }
      review_intelligence: {
        Args: {
          p_id: string
          p_kind: string
          p_reason: string
          p_status: string
        }
        Returns: undefined
      }
      review_pipeline_job: {
        Args: { p_job: string; p_reason: string }
        Returns: undefined
      }
      review_song: {
        Args: {
          p_alias: string
          p_genre: string
          p_language: string
          p_locality: Database["public"]["Enums"]["locality"]
          p_reason: string
          p_song: string
          p_title: string
        }
        Returns: undefined
      }
      review_youtube_video: {
        Args: {
          p_action: string
          p_asset: string
          p_kind?: Database["public"]["Enums"]["youtube_asset_kind"]
          p_reason: string
          p_recording?: string
        }
        Returns: undefined
      }
      run_youtube_retention: {
        Args: { p_job: string; p_token: string }
        Returns: Json
      }
      save_story: {
        Args: {
          p_action: string
          p_id: string
          p_revision: number
          p_values?: Json
        }
        Returns: number
      }
      search_catalog: {
        Args: { p_after?: string; p_query: string }
        Returns: {
          id: string
          kind: string
          title: string
        }[]
      }
      set_youtube_retention_mode: {
        Args: { p_mode: string; p_reason: string }
        Returns: string
      }
      set_youtube_watch: {
        Args: { p_active: boolean; p_asset: string; p_reason: string }
        Returns: undefined
      }
      staff_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      store_context_profile_run: {
        Args: { p_method: string; p_parameters: Json; p_rows: Json }
        Returns: string
      }
      strip_title_noise: {
        Args: { p_title: string }
        Returns: string
      }
      suggest_context_tag: {
        Args: {
          p_evidence_note: string
          p_evidence_url: string
          p_kind: string
          p_subject: string
          p_term: string
        }
        Returns: string
      }
      suggest_tags_from_source_genres: {
        Args: never
        Returns: number
      }
      suggest_youtube_song: {
        Args: { p_asset: string }
        Returns: {
          auto_link: boolean
          candidates: number
          confidence: number
          recording_id: string
          song_id: string
          title_match: string
          verified_channel: boolean
        }[]
      }
      undo_catalog_operation: {
        Args: { p_operation: string; p_reason: string }
        Returns: undefined
      }
      video_title_key: {
        Args: { p_artists: string[]; p_title: string }
        Returns: string
      }
      youtube_retention_config: { Args: never; Returns: Json }
      youtube_retention_parameters: {
        Args: { p_mode: string }
        Returns: Json
      }
    }
    Enums: {
      anomaly_status:
        | "open"
        | "reviewing"
        | "confirmed_event"
        | "data_error"
        | "dismissed"
        | "resolved"
      entry_status: "new" | "re_entry" | "up" | "down" | "unchanged"
      job_status:
        | "queued"
        | "running"
        | "succeeded"
        | "failed"
        | "partial"
        | "rejected"
        | "cancelled"
      locality: "local" | "international" | "mixed" | "unknown"
      retention_class: "permanent" | "youtube_statistics" | "youtube_metadata"
      severity: "low" | "medium" | "high" | "critical"
      signal_status:
        | "new"
        | "under_review"
        | "confirmed"
        | "dismissed"
        | "converted_to_lead"
      snapshot_status: "candidate" | "approved" | "rejected" | "replaced"
      story_status:
        | "detected"
        | "needs_verification"
        | "verified"
        | "assigned"
        | "drafting"
        | "editing"
        | "approved"
        | "published"
        | "archived"
        | "dismissed"
      user_role:
        | "administrator"
        | "data_editor"
        | "editor"
        | "writer"
        | "analyst"
      verification_status: "unverified" | "suggested" | "verified" | "disputed"
      youtube_asset_kind:
        | "official_music_video"
        | "official_audio"
        | "lyric_video"
        | "live"
        | "other"
      youtube_discovery_source:
        | "channel_uploads"
        | "chart_search"
        | "manual"
        | "most_popular_mn"
      youtube_link_status: "candidate" | "linked" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      anomaly_status: [
        "open",
        "reviewing",
        "confirmed_event",
        "data_error",
        "dismissed",
        "resolved",
      ],
      entry_status: ["new", "re_entry", "up", "down", "unchanged"],
      job_status: [
        "queued",
        "running",
        "succeeded",
        "failed",
        "partial",
        "rejected",
        "cancelled",
      ],
      locality: ["local", "international", "mixed", "unknown"],
      retention_class: ["permanent", "youtube_statistics", "youtube_metadata"],
      severity: ["low", "medium", "high", "critical"],
      signal_status: [
        "new",
        "under_review",
        "confirmed",
        "dismissed",
        "converted_to_lead",
      ],
      snapshot_status: ["candidate", "approved", "rejected", "replaced"],
      story_status: [
        "detected",
        "needs_verification",
        "verified",
        "assigned",
        "drafting",
        "editing",
        "approved",
        "published",
        "archived",
        "dismissed",
      ],
      user_role: [
        "administrator",
        "data_editor",
        "editor",
        "writer",
        "analyst",
      ],
      verification_status: ["unverified", "suggested", "verified", "disputed"],
      youtube_asset_kind: [
        "official_music_video",
        "official_audio",
        "lyric_video",
        "live",
        "other",
      ],
      youtube_discovery_source: [
        "channel_uploads",
        "chart_search",
        "manual",
        "most_popular_mn",
      ],
      youtube_link_status: ["candidate", "linked", "rejected"],
    },
  },
} as const
