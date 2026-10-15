export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      account_status: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          delete_after: string | null
          last_active_at: string | null
          reason: string
          status: string
          user_id: string
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          delete_after?: string | null
          last_active_at?: string | null
          reason?: string
          status?: string
          user_id: string
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          delete_after?: string | null
          last_active_at?: string | null
          reason?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_account_limits: {
        Row: {
          monthly_cap_usd: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          monthly_cap_usd?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          monthly_cap_usd?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_model_settings: {
        Row: {
          custom: boolean
          enabled: boolean
          id: string
          kind: string | null
          label: string
          model: string
          note: string
          price_unit: string
          price_usd: number | null
          provider: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          custom?: boolean
          enabled?: boolean
          id?: string
          kind?: string | null
          label?: string
          model: string
          note?: string
          price_unit?: string
          price_usd?: number | null
          provider: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          custom?: boolean
          enabled?: boolean
          id?: string
          kind?: string | null
          label?: string
          model?: string
          note?: string
          price_unit?: string
          price_usd?: number | null
          provider?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      ai_provider_keys: {
        Row: {
          ciphertext: string
          created_at: string
          id: string
          iv: string
          key_hint: string
          key_version: number
          label: string
          last_tested_at: string | null
          provider: string
          status: string
          status_message: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ciphertext: string
          created_at?: string
          id: string
          iv: string
          key_hint: string
          key_version?: number
          label?: string
          last_tested_at?: string | null
          provider: string
          status?: string
          status_message?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ciphertext?: string
          created_at?: string
          id?: string
          iv?: string
          key_hint?: string
          key_version?: number
          label?: string
          last_tested_at?: string | null
          provider?: string
          status?: string
          status_message?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_provider_requests: {
        Row: {
          created_at: string
          created_by: string | null
          docs_url: string
          id: string
          name: string
          note: string
          status: string
          website: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          docs_url?: string
          id?: string
          name: string
          note?: string
          status?: string
          website?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          docs_url?: string
          id?: string
          name?: string
          note?: string
          status?: string
          website?: string
        }
        Relationships: []
      }
      ai_spend: {
        Row: {
          key_owner: string
          month: string
          usd: number
        }
        Insert: {
          key_owner: string
          month: string
          usd?: number
        }
        Update: {
          key_owner?: string
          month?: string
          usd?: number
        }
        Relationships: []
      }
      app_admins: {
        Row: {
          added_at: string
          added_by: string | null
          user_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      app_status: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      asset_relations: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          from_asset_id: string
          id: string
          kind: string
          label: string
          project_id: string
          removed: boolean
          revision: number
          status: string
          to_asset_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string
          from_asset_id: string
          id: string
          kind: string
          label?: string
          project_id: string
          removed?: boolean
          revision?: number
          status?: string
          to_asset_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          from_asset_id?: string
          id?: string
          kind?: string
          label?: string
          project_id?: string
          removed?: boolean
          revision?: number
          status?: string
          to_asset_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_relations_from_asset_id_fkey"
            columns: ["from_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_relations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_relations_to_asset_id_fkey"
            columns: ["to_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_variants: {
        Row: {
          appearance: string
          approved_version_id: string | null
          archived: boolean
          asset_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          project_id: string
          revision: number
          style: string
        }
        Insert: {
          appearance?: string
          approved_version_id?: string | null
          archived?: boolean
          asset_id: string
          created_at?: string
          created_by?: string | null
          id: string
          name: string
          project_id: string
          revision?: number
          style: string
        }
        Update: {
          appearance?: string
          approved_version_id?: string | null
          archived?: boolean
          asset_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          project_id?: string
          revision?: number
          style?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_variants_approved_fk"
            columns: ["approved_version_id"]
            isOneToOne: false
            referencedRelation: "asset_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_variants_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_variants_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_versions: {
        Row: {
          byte_size: number | null
          byte_size_big: number
          created_at: string
          created_by: string | null
          duration_ms: number | null
          height: number | null
          id: string
          media_path: string
          mime_type: string
          note: string
          number: number
          project_id: string
          removed: boolean
          revision: number
          sha256: string
          variant_id: string
          view: string | null
          width: number | null
        }
        Insert: {
          byte_size?: number | null
          byte_size_big: number
          created_at?: string
          created_by?: string | null
          duration_ms?: number | null
          height?: number | null
          id: string
          media_path: string
          mime_type: string
          note?: string
          number: number
          project_id: string
          removed?: boolean
          revision?: number
          sha256: string
          variant_id: string
          view?: string | null
          width?: number | null
        }
        Update: {
          byte_size?: number | null
          byte_size_big?: number
          created_at?: string
          created_by?: string | null
          duration_ms?: number | null
          height?: number | null
          id?: string
          media_path?: string
          mime_type?: string
          note?: string
          number?: number
          project_id?: string
          removed?: boolean
          revision?: number
          sha256?: string
          variant_id?: string
          view?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_versions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "asset_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          archived: boolean
          category: string
          context_names: Json
          created_at: string
          created_by: string | null
          description: string
          id: string
          kind: string
          name: string
          names: Json
          project_id: string
          removed: boolean
          revision: number
          scene_plans: Json
          sound_links: Json
          tags: Json
          visual_brief: string
          voice: Json | null
        }
        Insert: {
          archived?: boolean
          category?: string
          context_names?: Json
          created_at?: string
          created_by?: string | null
          description?: string
          id: string
          kind: string
          name: string
          names?: Json
          project_id: string
          removed?: boolean
          revision?: number
          scene_plans?: Json
          sound_links?: Json
          tags?: Json
          visual_brief?: string
          voice?: Json | null
        }
        Update: {
          archived?: boolean
          category?: string
          context_names?: Json
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          kind?: string
          name?: string
          names?: Json
          project_id?: string
          removed?: boolean
          revision?: number
          scene_plans?: Json
          sound_links?: Json
          tags?: Json
          visual_brief?: string
          voice?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      audio_clips: {
        Row: {
          asset_id: string
          asset_variant_id: string | null
          block_id: string | null
          continues: boolean
          created_at: string
          created_by: string | null
          fade_in_ms: number
          fade_out_ms: number
          gain_db: number
          id: string
          kind: string
          language: string | null
          length_ms: number
          muted: boolean
          name: string
          occurrence_id: string
          offset_ms: number
          project_id: string
          removed: boolean
          revision: number
          source_in_ms: number
          speed: number
          version_id: string | null
          volume_keys: Json
        }
        Insert: {
          asset_id: string
          asset_variant_id?: string | null
          block_id?: string | null
          continues?: boolean
          created_at?: string
          created_by?: string | null
          fade_in_ms?: number
          fade_out_ms?: number
          gain_db?: number
          id: string
          kind: string
          language?: string | null
          length_ms: number
          muted?: boolean
          name?: string
          occurrence_id: string
          offset_ms: number
          project_id: string
          removed?: boolean
          revision?: number
          source_in_ms?: number
          speed?: number
          version_id?: string | null
          volume_keys?: Json
        }
        Update: {
          asset_id?: string
          asset_variant_id?: string | null
          block_id?: string | null
          continues?: boolean
          created_at?: string
          created_by?: string | null
          fade_in_ms?: number
          fade_out_ms?: number
          gain_db?: number
          id?: string
          kind?: string
          language?: string | null
          length_ms?: number
          muted?: boolean
          name?: string
          occurrence_id?: string
          offset_ms?: number
          project_id?: string
          removed?: boolean
          revision?: number
          source_in_ms?: number
          speed?: number
          version_id?: string | null
          volume_keys?: Json
        }
        Relationships: [
          {
            foreignKeyName: "audio_clips_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audio_clips_asset_variant_id_fkey"
            columns: ["asset_variant_id"]
            isOneToOne: false
            referencedRelation: "asset_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audio_clips_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "script_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audio_clips_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "scene_occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audio_clips_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audio_clips_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "asset_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      change_log: {
        Row: {
          actor: string
          affected_ids: string[]
          command: Json
          command_type: string
          created_at: string
          id: string
          inverse: Json | null
          project_id: string
          seq: number
        }
        Insert: {
          actor: string
          affected_ids?: string[]
          command: Json
          command_type: string
          created_at?: string
          id: string
          inverse?: Json | null
          project_id: string
          seq?: never
        }
        Update: {
          actor?: string
          affected_ids?: string[]
          command?: Json
          command_type?: string
          created_at?: string
          id?: string
          inverse?: Json | null
          project_id?: string
          seq?: never
        }
        Relationships: [
          {
            foreignKeyName: "change_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      clip_parts: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          in_ms: number
          occurrence_id: string
          order_key: string
          out_ms: number
          project_id: string
          removed: boolean
          revision: number
          source: string
          take_id: string | null
          transition_ms: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id: string
          in_ms: number
          occurrence_id: string
          order_key: string
          out_ms: number
          project_id: string
          removed?: boolean
          revision?: number
          source: string
          take_id?: string | null
          transition_ms?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          in_ms?: number
          occurrence_id?: string
          order_key?: string
          out_ms?: number
          project_id?: string
          removed?: boolean
          revision?: number
          source?: string
          take_id?: string | null
          transition_ms?: number
        }
        Relationships: [
          {
            foreignKeyName: "clip_parts_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "scene_occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clip_parts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clip_parts_take_id_fkey"
            columns: ["take_id"]
            isOneToOne: false
            referencedRelation: "takes"
            referencedColumns: ["id"]
          },
        ]
      }
      composition_layers: {
        Row: {
          anchor: Json | null
          asset_id: string | null
          asset_variant_id: string | null
          blend: string
          composition_id: string
          created_at: string
          created_by: string | null
          fill: string | null
          group_id: string | null
          height: number
          id: string
          image_swaps: Json
          keyframes: Json
          kind: string
          language_images: Json
          locked: boolean
          mask: Json | null
          motion_path: Json | null
          name: string
          order_key: string
          parallax: number
          project_id: string
          removed: boolean
          reviewed_versions: Json
          revision: number
          transform: Json
          version_id: string | null
          visible: boolean
          width: number
        }
        Insert: {
          anchor?: Json | null
          asset_id?: string | null
          asset_variant_id?: string | null
          blend?: string
          composition_id: string
          created_at?: string
          created_by?: string | null
          fill?: string | null
          group_id?: string | null
          height: number
          id: string
          image_swaps?: Json
          keyframes?: Json
          kind: string
          language_images?: Json
          locked?: boolean
          mask?: Json | null
          motion_path?: Json | null
          name?: string
          order_key: string
          parallax?: number
          project_id: string
          removed?: boolean
          reviewed_versions?: Json
          revision?: number
          transform: Json
          version_id?: string | null
          visible?: boolean
          width: number
        }
        Update: {
          anchor?: Json | null
          asset_id?: string | null
          asset_variant_id?: string | null
          blend?: string
          composition_id?: string
          created_at?: string
          created_by?: string | null
          fill?: string | null
          group_id?: string | null
          height?: number
          id?: string
          image_swaps?: Json
          keyframes?: Json
          kind?: string
          language_images?: Json
          locked?: boolean
          mask?: Json | null
          motion_path?: Json | null
          name?: string
          order_key?: string
          parallax?: number
          project_id?: string
          removed?: boolean
          reviewed_versions?: Json
          revision?: number
          transform?: Json
          version_id?: string | null
          visible?: boolean
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "composition_layers_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "composition_layers_asset_variant_id_fkey"
            columns: ["asset_variant_id"]
            isOneToOne: false
            referencedRelation: "asset_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "composition_layers_composition_id_fkey"
            columns: ["composition_id"]
            isOneToOne: false
            referencedRelation: "compositions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "composition_layers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "composition_layers_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "asset_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      compositions: {
        Row: {
          background: string
          camera: Json
          created_at: string
          created_by: string | null
          duration_frames: number
          height: number
          id: string
          name: string
          produced_from: Json
          project_id: string
          removed: boolean
          revision: number
          step: number
          variant_id: string
          width: number
        }
        Insert: {
          background?: string
          camera?: Json
          created_at?: string
          created_by?: string | null
          duration_frames?: number
          height?: number
          id: string
          name?: string
          produced_from?: Json
          project_id: string
          removed?: boolean
          revision?: number
          step?: number
          variant_id: string
          width?: number
        }
        Update: {
          background?: string
          camera?: Json
          created_at?: string
          created_by?: string | null
          duration_frames?: number
          height?: number
          id?: string
          name?: string
          produced_from?: Json
          project_id?: string
          removed?: boolean
          revision?: number
          step?: number
          variant_id?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "compositions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compositions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "scene_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      continuity_events: {
        Row: {
          asset_id: string
          block_id: string | null
          created_at: string
          created_by: string | null
          description: string
          disabled_in: Json
          duration: string
          from_variant_id: string | null
          id: string
          kind: string
          production_id: string | null
          project_id: string
          removed: boolean
          revision: number
          scene_id: string
          status: string
          to_variant_id: string | null
          until_scene_id: string | null
        }
        Insert: {
          asset_id: string
          block_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          disabled_in?: Json
          duration: string
          from_variant_id?: string | null
          id: string
          kind: string
          production_id?: string | null
          project_id: string
          removed?: boolean
          revision?: number
          scene_id: string
          status?: string
          to_variant_id?: string | null
          until_scene_id?: string | null
        }
        Update: {
          asset_id?: string
          block_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          disabled_in?: Json
          duration?: string
          from_variant_id?: string | null
          id?: string
          kind?: string
          production_id?: string | null
          project_id?: string
          removed?: boolean
          revision?: number
          scene_id?: string
          status?: string
          to_variant_id?: string | null
          until_scene_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "continuity_events_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "continuity_events_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "script_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "continuity_events_from_variant_id_fkey"
            columns: ["from_variant_id"]
            isOneToOne: false
            referencedRelation: "asset_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "continuity_events_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "continuity_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "continuity_events_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "continuity_events_to_variant_id_fkey"
            columns: ["to_variant_id"]
            isOneToOne: false
            referencedRelation: "asset_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "continuity_events_until_scene_id_fkey"
            columns: ["until_scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      duration_estimates: {
        Row: {
          assumptions: Json
          created_at: string
          created_by: string
          estimate: Json
          id: string
          production_id: string
          project_id: string
          script_version_id: string | null
        }
        Insert: {
          assumptions: Json
          created_at?: string
          created_by: string
          estimate: Json
          id?: string
          production_id: string
          project_id: string
          script_version_id?: string | null
        }
        Update: {
          assumptions?: Json
          created_at?: string
          created_by?: string
          estimate?: Json
          id?: string
          production_id?: string
          project_id?: string
          script_version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "duration_estimates_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duration_estimates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duration_estimates_script_version_id_fkey"
            columns: ["script_version_id"]
            isOneToOne: false
            referencedRelation: "script_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      export_records: {
        Row: {
          created_at: string
          created_by: string
          file_name: string
          id: string
          kind: string
          occurrence_ids: string[]
          production_id: string
          project_id: string
          settings: Json
        }
        Insert: {
          created_at?: string
          created_by: string
          file_name: string
          id?: string
          kind: string
          occurrence_ids?: string[]
          production_id: string
          project_id: string
          settings?: Json
        }
        Update: {
          created_at?: string
          created_by?: string
          file_name?: string
          id?: string
          kind?: string
          occurrence_ids?: string[]
          production_id?: string
          project_id?: string
          settings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "export_records_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "export_records_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_jobs: {
        Row: {
          asset_id: string | null
          cost_usd: number | null
          created_at: string
          created_by: string
          error: string | null
          estimated_cost: number | null
          external_id: string | null
          finished_at: string | null
          id: string
          key_owner: string | null
          kind: string
          model: string
          occurrence_id: string | null
          params: Json
          priority: number
          progress: number | null
          project_id: string
          prompt: string
          provider: string
          provider_key_id: string | null
          queue_position: number | null
          reference_path: string | null
          reference_paths: Json
          result_path: string | null
          result_text: string | null
          segment_id: string | null
          started_at: string | null
          status: string
        }
        Insert: {
          asset_id?: string | null
          cost_usd?: number | null
          created_at?: string
          created_by: string
          error?: string | null
          estimated_cost?: number | null
          external_id?: string | null
          finished_at?: string | null
          id: string
          key_owner?: string | null
          kind: string
          model: string
          occurrence_id?: string | null
          params?: Json
          priority?: number
          progress?: number | null
          project_id: string
          prompt: string
          provider: string
          provider_key_id?: string | null
          queue_position?: number | null
          reference_path?: string | null
          reference_paths?: Json
          result_path?: string | null
          result_text?: string | null
          segment_id?: string | null
          started_at?: string | null
          status?: string
        }
        Update: {
          asset_id?: string | null
          cost_usd?: number | null
          created_at?: string
          created_by?: string
          error?: string | null
          estimated_cost?: number | null
          external_id?: string | null
          finished_at?: string | null
          id?: string
          key_owner?: string | null
          kind?: string
          model?: string
          occurrence_id?: string | null
          params?: Json
          priority?: number
          progress?: number | null
          project_id?: string
          prompt?: string
          provider?: string
          provider_key_id?: string | null
          queue_position?: number | null
          reference_path?: string | null
          reference_paths?: Json
          result_path?: string | null
          result_text?: string | null
          segment_id?: string | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "generation_jobs_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_jobs_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "scene_occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_jobs_provider_key_id_fkey"
            columns: ["provider_key_id"]
            isOneToOne: false
            referencedRelation: "ai_provider_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_jobs_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "production_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_prompts: {
        Row: {
          based_on: string
          created_at: string
          created_by: string | null
          id: string
          occurrence_id: string
          project_id: string
          removed: boolean
          revision: number
          segment_id: string
          text: string
        }
        Insert: {
          based_on?: string
          created_at?: string
          created_by?: string | null
          id: string
          occurrence_id: string
          project_id: string
          removed?: boolean
          revision?: number
          segment_id: string
          text: string
        }
        Update: {
          based_on?: string
          created_at?: string
          created_by?: string | null
          id?: string
          occurrence_id?: string
          project_id?: string
          removed?: boolean
          revision?: number
          segment_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "generation_prompts_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "scene_occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_prompts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_prompts_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "production_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      imported_documents: {
        Row: {
          byte_size: number
          change_id: string | null
          created_at: string
          created_by: string
          file_name: string
          format: string
          id: string
          language: string
          page_count: number | null
          production_id: string
          project_id: string
          sha256: string
          storage_key: string
        }
        Insert: {
          byte_size: number
          change_id?: string | null
          created_at?: string
          created_by: string
          file_name: string
          format: string
          id?: string
          language?: string
          page_count?: number | null
          production_id: string
          project_id: string
          sha256: string
          storage_key: string
        }
        Update: {
          byte_size?: number
          change_id?: string | null
          created_at?: string
          created_by?: string
          file_name?: string
          format?: string
          id?: string
          language?: string
          page_count?: number | null
          production_id?: string
          project_id?: string
          sha256?: string
          storage_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "imported_documents_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imported_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      posters: {
        Row: {
          created_at: string
          created_by: string | null
          document: Json
          height_mm: number
          id: string
          kind: string
          language: string
          name: string
          production_id: string
          project_id: string
          removed: boolean
          revision: number
          width_mm: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document: Json
          height_mm: number
          id: string
          kind: string
          language?: string
          name: string
          production_id: string
          project_id: string
          removed?: boolean
          revision?: number
          width_mm: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document?: Json
          height_mm?: number
          id?: string
          kind?: string
          language?: string
          name?: string
          production_id?: string
          project_id?: string
          removed?: boolean
          revision?: number
          width_mm?: number
        }
        Relationships: [
          {
            foreignKeyName: "posters_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      privacy_acceptances: {
        Row: {
          accepted_at: string
          user_id: string
          version: number
        }
        Insert: {
          accepted_at?: string
          user_id: string
          version: number
        }
        Update: {
          accepted_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "privacy_acceptances_version_fkey"
            columns: ["version"]
            isOneToOne: false
            referencedRelation: "privacy_policy"
            referencedColumns: ["version"]
          },
        ]
      }
      privacy_policy: {
        Row: {
          address: string
          contact_email: string
          controller_name: string
          note: string
          org_number: string
          published_at: string
          published_by: string | null
          storage_region: string
          version: number
        }
        Insert: {
          address?: string
          contact_email?: string
          controller_name?: string
          note?: string
          org_number?: string
          published_at?: string
          published_by?: string | null
          storage_region?: string
          version: number
        }
        Update: {
          address?: string
          contact_email?: string
          controller_name?: string
          note?: string
          org_number?: string
          published_at?: string
          published_by?: string | null
          storage_region?: string
          version?: number
        }
        Relationships: []
      }
      production_segments: {
        Row: {
          created_at: string
          created_by: string | null
          end_block_id: string | null
          end_ms: number | null
          id: string
          occurrence_id: string
          order_key: string
          project_id: string
          reason: string
          revision: number
          start_block_id: string | null
          start_ms: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_block_id?: string | null
          end_ms?: number | null
          id: string
          occurrence_id: string
          order_key: string
          project_id: string
          reason: string
          revision?: number
          start_block_id?: string | null
          start_ms?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_block_id?: string | null
          end_ms?: number | null
          id?: string
          occurrence_id?: string
          order_key?: string
          project_id?: string
          reason?: string
          revision?: number
          start_block_id?: string | null
          start_ms?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "production_segments_end_block_id_fkey"
            columns: ["end_block_id"]
            isOneToOne: false
            referencedRelation: "script_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_segments_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "scene_occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_segments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_segments_start_block_id_fkey"
            columns: ["start_block_id"]
            isOneToOne: false
            referencedRelation: "script_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      productions: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          export_settings: Json | null
          fps_den: number
          fps_num: number
          id: string
          kind: string
          name: string
          parent_production_id: string | null
          project_id: string
          revision: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string
          export_settings?: Json | null
          fps_den: number
          fps_num: number
          id: string
          kind: string
          name: string
          parent_production_id?: string | null
          project_id: string
          revision?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          export_settings?: Json | null
          fps_den?: number
          fps_num?: number
          id?: string
          kind?: string
          name?: string
          parent_production_id?: string | null
          project_id?: string
          revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "productions_parent_production_id_fkey"
            columns: ["parent_production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          display_name: string
          locale: string | null
          ui_prefs: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          display_name?: string
          locale?: string | null
          ui_prefs?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          display_name?: string
          locale?: string | null
          ui_prefs?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          project_id: string
          revoked_at: string | null
          role: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          project_id: string
          revoked_at?: string | null
          role: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          project_id?: string
          revoked_at?: string | null
          role?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_invitations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          can_approve_costs: boolean
          invited_by: string | null
          joined_at: string
          project_id: string
          removed_at: string | null
          role: string
          user_id: string
        }
        Insert: {
          can_approve_costs?: boolean
          invited_by?: string | null
          joined_at?: string
          project_id: string
          removed_at?: string | null
          role: string
          user_id: string
        }
        Update: {
          can_approve_costs?: boolean
          invited_by?: string | null
          joined_at?: string
          project_id?: string
          removed_at?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          ai_month_limit: number | null
          ai_price_per_image: number | null
          created_at: string
          created_by: string
          default_transition_frames: number
          default_transition_kind: string
          default_transition_overlap: boolean
          deleted_at: string | null
          deleted_by: string | null
          duration_assumptions: Json | null
          fps_den: number
          fps_num: number
          frame_height: number
          frame_width: number
          id: string
          name: string
          primary_language: string
          revision: number
        }
        Insert: {
          ai_month_limit?: number | null
          ai_price_per_image?: number | null
          created_at?: string
          created_by: string
          default_transition_frames?: number
          default_transition_kind?: string
          default_transition_overlap?: boolean
          deleted_at?: string | null
          deleted_by?: string | null
          duration_assumptions?: Json | null
          fps_den?: number
          fps_num?: number
          frame_height?: number
          frame_width?: number
          id: string
          name: string
          primary_language?: string
          revision?: number
        }
        Update: {
          ai_month_limit?: number | null
          ai_price_per_image?: number | null
          created_at?: string
          created_by?: string
          default_transition_frames?: number
          default_transition_kind?: string
          default_transition_overlap?: boolean
          deleted_at?: string | null
          deleted_by?: string | null
          duration_assumptions?: Json | null
          fps_den?: number
          fps_num?: number
          frame_height?: number
          frame_width?: number
          id?: string
          name?: string
          primary_language?: string
          revision?: number
        }
        Relationships: []
      }
      scene_occurrences: {
        Row: {
          active: boolean
          active_take_id: string | null
          created_at: string
          created_by: string | null
          excerpt_in: number | null
          excerpt_out: number | null
          id: string
          monochrome: boolean
          order_key: string
          planned_ms: number | null
          production_id: string
          production_number: string | null
          project_id: string
          revision: number
          scene_id: string
          transition_custom: boolean
          transition_frames: number
          transition_kind: string
          transition_overlap: boolean
          variant_id: string
          video_instructions: string
        }
        Insert: {
          active?: boolean
          active_take_id?: string | null
          created_at?: string
          created_by?: string | null
          excerpt_in?: number | null
          excerpt_out?: number | null
          id: string
          monochrome?: boolean
          order_key: string
          planned_ms?: number | null
          production_id: string
          production_number?: string | null
          project_id: string
          revision?: number
          scene_id: string
          transition_custom?: boolean
          transition_frames?: number
          transition_kind?: string
          transition_overlap?: boolean
          variant_id: string
          video_instructions?: string
        }
        Update: {
          active?: boolean
          active_take_id?: string | null
          created_at?: string
          created_by?: string | null
          excerpt_in?: number | null
          excerpt_out?: number | null
          id?: string
          monochrome?: boolean
          order_key?: string
          planned_ms?: number | null
          production_id?: string
          production_number?: string | null
          project_id?: string
          revision?: number
          scene_id?: string
          transition_custom?: boolean
          transition_frames?: number
          transition_kind?: string
          transition_overlap?: boolean
          variant_id?: string
          video_instructions?: string
        }
        Relationships: [
          {
            foreignKeyName: "scene_occurrences_active_take_fk"
            columns: ["active_take_id"]
            isOneToOne: false
            referencedRelation: "takes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_occurrences_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_occurrences_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_occurrences_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_occurrences_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "scene_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      scene_variants: {
        Row: {
          based_on_variant_id: string | null
          created_at: string
          created_by: string | null
          heading_int_ext: string
          heading_location: string
          heading_time: string
          id: string
          owner_production_id: string | null
          project_id: string
          revision: number
          scene_id: string
          uncertainty: string | null
        }
        Insert: {
          based_on_variant_id?: string | null
          created_at?: string
          created_by?: string | null
          heading_int_ext?: string
          heading_location?: string
          heading_time?: string
          id: string
          owner_production_id?: string | null
          project_id: string
          revision?: number
          scene_id: string
          uncertainty?: string | null
        }
        Update: {
          based_on_variant_id?: string | null
          created_at?: string
          created_by?: string | null
          heading_int_ext?: string
          heading_location?: string
          heading_time?: string
          id?: string
          owner_production_id?: string | null
          project_id?: string
          revision?: number
          scene_id?: string
          uncertainty?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scene_variants_based_on_variant_id_fkey"
            columns: ["based_on_variant_id"]
            isOneToOne: false
            referencedRelation: "scene_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_variants_owner_production_id_fkey"
            columns: ["owner_production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_variants_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_variants_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      scenes: {
        Row: {
          created_at: string
          created_by: string | null
          derived_from_scene_id: string | null
          id: string
          merged_into_scene_id: string | null
          origin_production_id: string
          project_id: string
          revision: number
          story_anchor_scene_id: string | null
          story_kind: string
          story_offset: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          derived_from_scene_id?: string | null
          id: string
          merged_into_scene_id?: string | null
          origin_production_id: string
          project_id: string
          revision?: number
          story_anchor_scene_id?: string | null
          story_kind?: string
          story_offset?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          derived_from_scene_id?: string | null
          id?: string
          merged_into_scene_id?: string | null
          origin_production_id?: string
          project_id?: string
          revision?: number
          story_anchor_scene_id?: string | null
          story_kind?: string
          story_offset?: number
        }
        Relationships: [
          {
            foreignKeyName: "scenes_derived_from_scene_id_fkey"
            columns: ["derived_from_scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenes_merged_into_scene_id_fkey"
            columns: ["merged_into_scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenes_origin_production_id_fkey"
            columns: ["origin_production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scenes_story_anchor_scene_id_fkey"
            columns: ["story_anchor_scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_version: {
        Row: {
          applied_at: string
          description: string
          version: number
        }
        Insert: {
          applied_at?: string
          description: string
          version: number
        }
        Update: {
          applied_at?: string
          description?: string
          version?: number
        }
        Relationships: []
      }
      script_annotations: {
        Row: {
          author_name: string
          block_id: string | null
          created_at: string
          created_by: string | null
          edited_at: string | null
          edited_by_name: string | null
          id: string
          project_id: string
          quote: string
          range_end: number
          range_start: number
          removed: boolean
          revision: number
          source: string
          stamp_at: string
          task_id: string | null
          text: string
          variant_id: string | null
        }
        Insert: {
          author_name?: string
          block_id?: string | null
          created_at?: string
          created_by?: string | null
          edited_at?: string | null
          edited_by_name?: string | null
          id: string
          project_id: string
          quote?: string
          range_end?: number
          range_start?: number
          removed?: boolean
          revision?: number
          source?: string
          stamp_at?: string
          task_id?: string | null
          text: string
          variant_id?: string | null
        }
        Update: {
          author_name?: string
          block_id?: string | null
          created_at?: string
          created_by?: string | null
          edited_at?: string | null
          edited_by_name?: string | null
          id?: string
          project_id?: string
          quote?: string
          range_end?: number
          range_start?: number
          removed?: boolean
          revision?: number
          source?: string
          stamp_at?: string
          task_id?: string | null
          text?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "script_annotations_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "script_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "script_annotations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "script_annotations_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "scene_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      script_block_revisions: {
        Row: {
          author: string
          block_id: string
          created_at: string
          project_id: string
          rev: number
          text: string
        }
        Insert: {
          author: string
          block_id: string
          created_at?: string
          project_id: string
          rev: number
          text: string
        }
        Update: {
          author?: string
          block_id?: string
          created_at?: string
          project_id?: string
          rev?: number
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "script_block_revisions_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "script_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "script_block_revisions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      script_blocks: {
        Row: {
          created_at: string
          created_by: string | null
          current_rev: number
          id: string
          kind: string
          language: string
          order_key: string
          project_id: string
          removed: boolean
          revision: number
          source_ref: Json | null
          text: string
          uncertainty: string | null
          variant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_rev?: number
          id: string
          kind: string
          language?: string
          order_key: string
          project_id: string
          removed?: boolean
          revision?: number
          source_ref?: Json | null
          text?: string
          uncertainty?: string | null
          variant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_rev?: number
          id?: string
          kind?: string
          language?: string
          order_key?: string
          project_id?: string
          removed?: boolean
          revision?: number
          source_ref?: Json | null
          text?: string
          uncertainty?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "script_blocks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "script_blocks_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "scene_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      script_versions: {
        Row: {
          based_on_change_id: string | null
          created_at: string
          created_by: string
          id: string
          name: string
          note: string | null
          number: number
          parent_version_id: string | null
          production_id: string
          project_id: string
          snapshot: Json
        }
        Insert: {
          based_on_change_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          name: string
          note?: string | null
          number: number
          parent_version_id?: string | null
          production_id: string
          project_id: string
          snapshot: Json
        }
        Update: {
          based_on_change_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          note?: string | null
          number?: number
          parent_version_id?: string | null
          production_id?: string
          project_id?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "script_versions_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "script_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "script_versions_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "script_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      style_profiles: {
        Row: {
          applies_to: Json
          created_at: string
          created_by: string | null
          guide: Json
          id: string
          is_default: boolean
          name: string
          project_id: string
          removed: boolean
          revision: number
        }
        Insert: {
          applies_to?: Json
          created_at?: string
          created_by?: string | null
          guide: Json
          id: string
          is_default?: boolean
          name: string
          project_id: string
          removed?: boolean
          revision?: number
        }
        Update: {
          applies_to?: Json
          created_at?: string
          created_by?: string | null
          guide?: Json
          id?: string
          is_default?: boolean
          name?: string
          project_id?: string
          removed?: boolean
          revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "style_profiles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      takes: {
        Row: {
          accepted_from: Json
          audio_language: string | null
          coverage: Json | null
          created_at: string
          created_by: string | null
          duration_frames: number | null
          id: string
          kind: string
          media_ref: string | null
          metadata: Json
          occurrence_id: string
          produced_from: Json
          project_id: string
          reviewed_versions: Json
          revision: number
          segment_id: string | null
          status: string
        }
        Insert: {
          accepted_from?: Json
          audio_language?: string | null
          coverage?: Json | null
          created_at?: string
          created_by?: string | null
          duration_frames?: number | null
          id: string
          kind: string
          media_ref?: string | null
          metadata?: Json
          occurrence_id: string
          produced_from?: Json
          project_id: string
          reviewed_versions?: Json
          revision?: number
          segment_id?: string | null
          status: string
        }
        Update: {
          accepted_from?: Json
          audio_language?: string | null
          coverage?: Json | null
          created_at?: string
          created_by?: string | null
          duration_frames?: number | null
          id?: string
          kind?: string
          media_ref?: string | null
          metadata?: Json
          occurrence_id?: string
          produced_from?: Json
          project_id?: string
          reviewed_versions?: Json
          revision?: number
          segment_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "takes_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "scene_occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "takes_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "production_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      time_links: {
        Row: {
          block_id: string
          created_at: string
          created_by: string | null
          end_ms: number | null
          id: string
          layer_id: string | null
          occurrence_id: string
          project_id: string
          removed: boolean
          revision: number
          start_ms: number
        }
        Insert: {
          block_id: string
          created_at?: string
          created_by?: string | null
          end_ms?: number | null
          id: string
          layer_id?: string | null
          occurrence_id: string
          project_id: string
          removed?: boolean
          revision?: number
          start_ms: number
        }
        Update: {
          block_id?: string
          created_at?: string
          created_by?: string | null
          end_ms?: number | null
          id?: string
          layer_id?: string | null
          occurrence_id?: string
          project_id?: string
          removed?: boolean
          revision?: number
          start_ms?: number
        }
        Relationships: [
          {
            foreignKeyName: "time_links_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "script_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_links_layer_id_fkey"
            columns: ["layer_id"]
            isOneToOne: false
            referencedRelation: "composition_layers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_links_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "scene_occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      translations: {
        Row: {
          based_on_rev: number
          block_id: string | null
          created_at: string
          created_by: string | null
          id: string
          language: string
          project_id: string
          removed: boolean
          revision: number
          status: string
          text: string
          variant_id: string | null
        }
        Insert: {
          based_on_rev?: number
          block_id?: string | null
          created_at?: string
          created_by?: string | null
          id: string
          language: string
          project_id: string
          removed?: boolean
          revision?: number
          status?: string
          text: string
          variant_id?: string | null
        }
        Update: {
          based_on_rev?: number
          block_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          language?: string
          project_id?: string
          removed?: boolean
          revision?: number
          status?: string
          text?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "translations_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "script_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "translations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "translations_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "scene_variants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: string }
      accept_privacy: { Args: { p_version: number }; Returns: undefined }
      apply_changes: {
        Args: {
          p_actor: string
          p_changes: Json
          p_command: Json
          p_command_id: string
          p_inverse: Json
          p_project: string
        }
        Returns: Json
      }
      create_invitation: {
        Args: { p_email: string; p_project: string; p_role?: string }
        Returns: string
      }
      create_project: {
        Args: { p_fps_den?: number; p_fps_num?: number; p_name: string }
        Returns: string
      }
      create_script_version: {
        Args: {
          p_name: string
          p_note?: string
          p_production: string
          p_project: string
        }
        Returns: string
      }
      delete_project: {
        Args: { p_actor: string; p_project: string }
        Returns: Json
      }
      leave_project: { Args: { p_project: string }; Returns: undefined }
      my_account: { Args: never; Returns: Json }
      project_lock_info: { Args: { p_project: string }; Returns: Json }
      purge_project_assets: {
        Args: { p_actor: string; p_project: string }
        Returns: Json
      }
      purge_removed_assets: {
        Args: {
          p_actor: string
          p_assets: string[]
          p_project: string
          p_versions: string[]
        }
        Returns: Json
      }
      record_export: {
        Args: {
          p_file_name: string
          p_kind: string
          p_occurrence_ids: string[]
          p_production: string
          p_project: string
          p_settings: Json
        }
        Returns: string
      }
      register_imported_document: {
        Args: {
          p_byte_size: number
          p_change_id?: string
          p_file_name: string
          p_format: string
          p_language?: string
          p_page_count: number
          p_production: string
          p_project: string
          p_sha256: string
          p_storage_key: string
        }
        Returns: string
      }
      remove_member: {
        Args: { p_project: string; p_user: string }
        Returns: undefined
      }
      revoke_invitation: { Args: { p_invitation: string }; Returns: undefined }
      save_duration_estimate: {
        Args: {
          p_assumptions: Json
          p_estimate: Json
          p_production: string
          p_project: string
          p_script_version?: string
        }
        Returns: Json
      }
      set_invitation_role: {
        Args: { p_invitation: string; p_role: string }
        Returns: undefined
      }
      set_member_role: {
        Args: { p_project: string; p_role: string; p_user: string }
        Returns: undefined
      }
      set_my_locale: { Args: { p_locale: string }; Returns: undefined }
      set_my_ui_prefs: { Args: { p_prefs: Json }; Returns: undefined }
      touch_activity: { Args: never; Returns: undefined }
      upsert_my_profile: {
        Args: { p_display_name?: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
