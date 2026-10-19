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
          text_models: Json | null
          text_models_at: string | null
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
          text_models?: Json | null
          text_models_at?: string | null
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
          text_models?: Json | null
          text_models_at?: string | null
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
      animation_patterns: {
        Row: {
          color: string
          created_at: string
          created_by: string
          id: string
          name: string
          project_id: string
          removed: boolean
          revision: number
          rig_id: string | null
          spec: Json
        }
        Insert: {
          color: string
          created_at?: string
          created_by: string
          id: string
          name: string
          project_id: string
          removed?: boolean
          revision?: number
          rig_id?: string | null
          spec: Json
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          project_id?: string
          removed?: boolean
          revision?: number
          rig_id?: string | null
          spec?: Json
        }
        Relationships: [
          {
            foreignKeyName: "animation_patterns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "animation_patterns_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "animation_patterns_rig_id_fkey"
            columns: ["rig_id"]
            isOneToOne: false
            referencedRelation: "animation_rigs"
            referencedColumns: ["id"]
          },
        ]
      }
      animation_rig_versions: {
        Row: {
          algorithm_version: number
          created_at: string
          created_by: string
          id: string
          number: number
          project_id: string
          removed: boolean
          revision: number
          rig_id: string
          source_version_id: string
          spec: Json
        }
        Insert: {
          algorithm_version?: number
          created_at?: string
          created_by: string
          id: string
          number: number
          project_id: string
          removed?: boolean
          revision?: number
          rig_id: string
          source_version_id: string
          spec: Json
        }
        Update: {
          algorithm_version?: number
          created_at?: string
          created_by?: string
          id?: string
          number?: number
          project_id?: string
          removed?: boolean
          revision?: number
          rig_id?: string
          source_version_id?: string
          spec?: Json
        }
        Relationships: [
          {
            foreignKeyName: "animation_rig_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "animation_rig_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "animation_rig_versions_rig_id_fkey"
            columns: ["rig_id"]
            isOneToOne: false
            referencedRelation: "animation_rigs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "animation_rig_versions_source_version_id_fkey"
            columns: ["source_version_id"]
            isOneToOne: false
            referencedRelation: "asset_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      animation_rigs: {
        Row: {
          created_at: string
          created_by: string
          current_version_id: string | null
          id: string
          project_id: string
          removed: boolean
          revision: number
          variant_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          current_version_id?: string | null
          id: string
          project_id: string
          removed?: boolean
          revision?: number
          variant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          current_version_id?: string | null
          id?: string
          project_id?: string
          removed?: boolean
          revision?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "animation_rigs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "animation_rigs_current_version"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "animation_rig_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "animation_rigs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "animation_rigs_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "asset_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      animation_uses: {
        Row: {
          behavior: Json | null
          created_at: string
          created_by: string
          enabled: boolean
          id: string
          layer_id: string
          occurrence_id: string
          project_id: string
          removed: boolean
          revision: number
          rig_version_id: string
        }
        Insert: {
          behavior?: Json | null
          created_at?: string
          created_by: string
          enabled?: boolean
          id: string
          layer_id: string
          occurrence_id: string
          project_id: string
          removed?: boolean
          revision?: number
          rig_version_id: string
        }
        Update: {
          behavior?: Json | null
          created_at?: string
          created_by?: string
          enabled?: boolean
          id?: string
          layer_id?: string
          occurrence_id?: string
          project_id?: string
          removed?: boolean
          revision?: number
          rig_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "animation_uses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "animation_uses_layer_id_fkey"
            columns: ["layer_id"]
            isOneToOne: false
            referencedRelation: "composition_layers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "animation_uses_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "scene_occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "animation_uses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "animation_uses_rig_version_id_fkey"
            columns: ["rig_version_id"]
            isOneToOne: false
            referencedRelation: "animation_rig_versions"
            referencedColumns: ["id"]
          },
        ]
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
          alignment: Json | null
          byte_size: number | null
          byte_size_big: number
          composition: Json | null
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
          source_global_asset_id: string | null
          source_global_variant_id: string | null
          source_global_version_id: string | null
          template_spec: Json | null
          variant_id: string
          view: string | null
          width: number | null
        }
        Insert: {
          alignment?: Json | null
          byte_size?: number | null
          byte_size_big: number
          composition?: Json | null
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
          source_global_asset_id?: string | null
          source_global_variant_id?: string | null
          source_global_version_id?: string | null
          template_spec?: Json | null
          variant_id: string
          view?: string | null
          width?: number | null
        }
        Update: {
          alignment?: Json | null
          byte_size?: number | null
          byte_size_big?: number
          composition?: Json | null
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
          source_global_asset_id?: string | null
          source_global_variant_id?: string | null
          source_global_version_id?: string | null
          template_spec?: Json | null
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
          source_global_asset_id: string | null
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
          source_global_asset_id?: string | null
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
          source_global_asset_id?: string | null
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
          active_from: number | null
          active_to: number | null
          anchor: Json | null
          asset_id: string | null
          asset_variant_id: string | null
          blend: string
          composition_id: string
          created_at: string
          created_by: string | null
          effects: Json | null
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
          page_transition: Json | null
          parallax: number
          project_id: string
          removed: boolean
          reviewed_versions: Json
          revision: number
          shape: Json | null
          template_instance_id: string | null
          template_key: string | null
          template_slot: string | null
          text_spec: Json | null
          transform: Json
          version_id: string | null
          visible: boolean
          width: number
        }
        Insert: {
          active_from?: number | null
          active_to?: number | null
          anchor?: Json | null
          asset_id?: string | null
          asset_variant_id?: string | null
          blend?: string
          composition_id: string
          created_at?: string
          created_by?: string | null
          effects?: Json | null
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
          page_transition?: Json | null
          parallax?: number
          project_id: string
          removed?: boolean
          reviewed_versions?: Json
          revision?: number
          shape?: Json | null
          template_instance_id?: string | null
          template_key?: string | null
          template_slot?: string | null
          text_spec?: Json | null
          transform: Json
          version_id?: string | null
          visible?: boolean
          width: number
        }
        Update: {
          active_from?: number | null
          active_to?: number | null
          anchor?: Json | null
          asset_id?: string | null
          asset_variant_id?: string | null
          blend?: string
          composition_id?: string
          created_at?: string
          created_by?: string | null
          effects?: Json | null
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
          page_transition?: Json | null
          parallax?: number
          project_id?: string
          removed?: boolean
          reviewed_versions?: Json
          revision?: number
          shape?: Json | null
          template_instance_id?: string | null
          template_key?: string | null
          template_slot?: string | null
          text_spec?: Json | null
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
            foreignKeyName: "composition_layers_template_instance_fkey"
            columns: ["template_instance_id"]
            isOneToOne: false
            referencedRelation: "template_instances"
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
          timing: Json
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
          timing?: Json
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
          timing?: Json
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
      credit_participants: {
        Row: {
          created_at: string
          created_by: string | null
          fields: Json
          group_key: string
          hidden: boolean
          id: string
          image_asset_id: string | null
          image_version_id: string | null
          logo_asset_id: string | null
          logo_version_id: string | null
          order_key: string
          project_id: string
          removed: boolean
          revision: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fields?: Json
          group_key?: string
          hidden?: boolean
          id: string
          image_asset_id?: string | null
          image_version_id?: string | null
          logo_asset_id?: string | null
          logo_version_id?: string | null
          order_key: string
          project_id: string
          removed?: boolean
          revision?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fields?: Json
          group_key?: string
          hidden?: boolean
          id?: string
          image_asset_id?: string | null
          image_version_id?: string | null
          logo_asset_id?: string | null
          logo_version_id?: string | null
          order_key?: string
          project_id?: string
          removed?: boolean
          revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "credit_participants_image_asset_id_fkey"
            columns: ["image_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_participants_image_version_id_fkey"
            columns: ["image_version_id"]
            isOneToOne: false
            referencedRelation: "asset_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_participants_logo_asset_id_fkey"
            columns: ["logo_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_participants_logo_version_id_fkey"
            columns: ["logo_version_id"]
            isOneToOne: false
            referencedRelation: "asset_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_participants_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_sequences: {
        Row: {
          created_at: string
          created_by: string | null
          direction: string
          duration_frames: number
          group_templates: Json
          id: string
          occurrence_id: string
          pause_frames: number
          presentation: string
          project_id: string
          removed: boolean
          revision: number
          speed: number
          transition_frames: number
          transition_kind: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          direction?: string
          duration_frames: number
          group_templates?: Json
          id: string
          occurrence_id: string
          pause_frames?: number
          presentation: string
          project_id: string
          removed?: boolean
          revision?: number
          speed: number
          transition_frames?: number
          transition_kind?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          direction?: string
          duration_frames?: number
          group_templates?: Json
          id?: string
          occurrence_id?: string
          pause_frames?: number
          presentation?: string
          project_id?: string
          removed?: boolean
          revision?: number
          speed?: number
          transition_frames?: number
          transition_kind?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_sequences_occurrence_id_fkey"
            columns: ["occurrence_id"]
            isOneToOne: false
            referencedRelation: "scene_occurrences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_sequences_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      film_shares: {
        Row: {
          activated_at: string | null
          byte_size: number
          created_at: string
          created_by: string
          duration_ms: number
          expires_at: string | null
          export_record_id: string
          height: number
          id: string
          mime_type: string
          production_id: string
          project_id: string
          revoked_at: string | null
          revoked_by: string | null
          share_days: number | null
          status: string
          storage_key: string
          title: string
          token: string | null
          token_hash: string | null
          width: number
        }
        Insert: {
          activated_at?: string | null
          byte_size: number
          created_at?: string
          created_by: string
          duration_ms: number
          expires_at?: string | null
          export_record_id: string
          height: number
          id?: string
          mime_type: string
          production_id: string
          project_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          share_days?: number | null
          status?: string
          storage_key: string
          title: string
          token?: string | null
          token_hash?: string | null
          width: number
        }
        Update: {
          activated_at?: string | null
          byte_size?: number
          created_at?: string
          created_by?: string
          duration_ms?: number
          expires_at?: string | null
          export_record_id?: string
          height?: number
          id?: string
          mime_type?: string
          production_id?: string
          project_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          share_days?: number | null
          status?: string
          storage_key?: string
          title?: string
          token?: string | null
          token_hash?: string | null
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "film_shares_export_record_id_fkey"
            columns: ["export_record_id"]
            isOneToOne: false
            referencedRelation: "export_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "film_shares_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "productions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "film_shares_project_id_fkey"
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
      global_animation_specs: {
        Row: {
          created_at: string
          created_by: string
          global_asset_id: string
          id: string
          note: string
          number: number
          patterns: Json
          rig_spec: Json
          variant_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          global_asset_id: string
          id?: string
          note?: string
          number: number
          patterns?: Json
          rig_spec: Json
          variant_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          global_asset_id?: string
          id?: string
          note?: string
          number?: number
          patterns?: Json
          rig_spec?: Json
          variant_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "global_animation_specs_global_asset_id_fkey"
            columns: ["global_asset_id"]
            isOneToOne: false
            referencedRelation: "global_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "global_animation_specs_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "global_asset_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "global_animation_specs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      global_asset_variants: {
        Row: {
          appearance: string
          archived_at: string | null
          created_at: string
          created_by: string
          global_asset_id: string
          id: string
          name: string
          revision: number
          style: string
          workspace_id: string
        }
        Insert: {
          appearance?: string
          archived_at?: string | null
          created_at?: string
          created_by: string
          global_asset_id: string
          id?: string
          name: string
          revision?: number
          style?: string
          workspace_id: string
        }
        Update: {
          appearance?: string
          archived_at?: string | null
          created_at?: string
          created_by?: string
          global_asset_id?: string
          id?: string
          name?: string
          revision?: number
          style?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "global_asset_variants_global_asset_id_fkey"
            columns: ["global_asset_id"]
            isOneToOne: false
            referencedRelation: "global_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "global_asset_variants_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      global_asset_versions: {
        Row: {
          byte_size: number
          created_at: string
          created_by: string
          duration_ms: number | null
          global_asset_id: string
          height: number | null
          id: string
          mime_type: string
          note: string
          number: number
          sha256: string
          storage_key: string
          template_spec: Json | null
          variant_id: string
          width: number | null
          workspace_id: string
        }
        Insert: {
          byte_size: number
          created_at?: string
          created_by: string
          duration_ms?: number | null
          global_asset_id: string
          height?: number | null
          id?: string
          mime_type: string
          note?: string
          number: number
          sha256: string
          storage_key: string
          template_spec?: Json | null
          variant_id: string
          width?: number | null
          workspace_id: string
        }
        Update: {
          byte_size?: number
          created_at?: string
          created_by?: string
          duration_ms?: number | null
          global_asset_id?: string
          height?: number | null
          id?: string
          mime_type?: string
          note?: string
          number?: number
          sha256?: string
          storage_key?: string
          template_spec?: Json | null
          variant_id?: string
          width?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "global_asset_versions_global_asset_id_fkey"
            columns: ["global_asset_id"]
            isOneToOne: false
            referencedRelation: "global_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "global_asset_versions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "global_asset_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "global_asset_versions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      global_assets: {
        Row: {
          archived_at: string | null
          categories: string[]
          created_at: string
          created_by: string
          description: string
          id: string
          kind: string
          name: string
          revision: number
          tags: string[]
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          categories?: string[]
          created_at?: string
          created_by: string
          description?: string
          id?: string
          kind: string
          name: string
          revision?: number
          tags?: string[]
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          categories?: string[]
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          kind?: string
          name?: string
          revision?: number
          tags?: string[]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "global_assets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
      lipsync_results: {
        Row: {
          algorithm_version: number
          audio_hash: string
          block_id: string | null
          clip_id: string
          created_at: string
          created_by: string
          enabled: boolean
          id: string
          overrides: Json
          project_id: string
          removed: boolean
          revision: number
          source: string
          spans: Json
          take_id: string
          text_hash: string
        }
        Insert: {
          algorithm_version: number
          audio_hash: string
          block_id?: string | null
          clip_id: string
          created_at?: string
          created_by: string
          enabled?: boolean
          id: string
          overrides?: Json
          project_id: string
          removed?: boolean
          revision?: number
          source: string
          spans?: Json
          take_id: string
          text_hash?: string
        }
        Update: {
          algorithm_version?: number
          audio_hash?: string
          block_id?: string | null
          clip_id?: string
          created_at?: string
          created_by?: string
          enabled?: boolean
          id?: string
          overrides?: Json
          project_id?: string
          removed?: boolean
          revision?: number
          source?: string
          spans?: Json
          take_id?: string
          text_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "lipsync_results_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "script_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lipsync_results_clip_id_fkey"
            columns: ["clip_id"]
            isOneToOne: false
            referencedRelation: "audio_clips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lipsync_results_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "lipsync_results_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lipsync_results_take_id_fkey"
            columns: ["take_id"]
            isOneToOne: false
            referencedRelation: "takes"
            referencedColumns: ["id"]
          },
        ]
      }
      mobile_imports: {
        Row: {
          approved_at: string | null
          approved_rig_version_id: string | null
          asset_id: string | null
          asset_version_id: string | null
          byte_size: number
          claimed_at: string | null
          claimed_by: string | null
          client_file_id: string
          confirmed_at: string | null
          context: Json
          contributor_name: string
          created_at: string
          dismissed: boolean
          error: string | null
          file_name: string
          id: string
          kind: string
          mime_type: string
          path: string
          project_id: string
          session_id: string
          status: string
          take_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_rig_version_id?: string | null
          asset_id?: string | null
          asset_version_id?: string | null
          byte_size: number
          claimed_at?: string | null
          claimed_by?: string | null
          client_file_id: string
          confirmed_at?: string | null
          context: Json
          contributor_name?: string
          created_at?: string
          dismissed?: boolean
          error?: string | null
          file_name?: string
          id?: string
          kind: string
          mime_type: string
          path: string
          project_id: string
          session_id: string
          status?: string
          take_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_rig_version_id?: string | null
          asset_id?: string | null
          asset_version_id?: string | null
          byte_size?: number
          claimed_at?: string | null
          claimed_by?: string | null
          client_file_id?: string
          confirmed_at?: string | null
          context?: Json
          contributor_name?: string
          created_at?: string
          dismissed?: boolean
          error?: string | null
          file_name?: string
          id?: string
          kind?: string
          mime_type?: string
          path?: string
          project_id?: string
          session_id?: string
          status?: string
          take_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mobile_imports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobile_imports_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "upload_sessions"
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
          workspace_id: string | null
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
          workspace_id?: string | null
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
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
          kind: string
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
          kind?: string
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
          kind?: string
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
          kind: string
          project_id: string
          quote: string
          range_end: number
          range_start: number
          removed: boolean
          revision: number
          source: string
          stamp_at: string
          suggested_text: string | null
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
          kind?: string
          project_id: string
          quote?: string
          range_end?: number
          range_start?: number
          removed?: boolean
          revision?: number
          source?: string
          stamp_at?: string
          suggested_text?: string | null
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
          kind?: string
          project_id?: string
          quote?: string
          range_end?: number
          range_start?: number
          removed?: boolean
          revision?: number
          source?: string
          stamp_at?: string
          suggested_text?: string | null
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
      script_entity_analysis: {
        Row: {
          analyzed_at: string
          content_hash: string
          created_at: string
          created_by: string | null
          id: string
          model: string
          project_id: string
          removed: boolean
          result: Json
          revision: number
          scene_id: string
        }
        Insert: {
          analyzed_at?: string
          content_hash: string
          created_at?: string
          created_by?: string | null
          id?: string
          model?: string
          project_id: string
          removed?: boolean
          result?: Json
          revision?: number
          scene_id: string
        }
        Update: {
          analyzed_at?: string
          content_hash?: string
          created_at?: string
          created_by?: string | null
          id?: string
          model?: string
          project_id?: string
          removed?: boolean
          result?: Json
          revision?: number
          scene_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "script_entity_analysis_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "script_entity_analysis_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
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
      story_canvas_edges: {
        Row: {
          created_at: string
          created_by: string | null
          from_node_id: string
          id: string
          kind: string
          label: string
          project_id: string
          removed: boolean
          revision: number
          to_node_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_node_id: string
          id: string
          kind: string
          label?: string
          project_id: string
          removed?: boolean
          revision?: number
          to_node_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_node_id?: string
          id?: string
          kind?: string
          label?: string
          project_id?: string
          removed?: boolean
          revision?: number
          to_node_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_canvas_edges_from_node_id_fkey"
            columns: ["from_node_id"]
            isOneToOne: false
            referencedRelation: "story_canvas_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_canvas_edges_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_canvas_edges_to_node_id_fkey"
            columns: ["to_node_id"]
            isOneToOne: false
            referencedRelation: "story_canvas_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      story_canvas_nodes: {
        Row: {
          asset_id: string | null
          body: string
          color: string | null
          created_at: string
          created_by: string | null
          group_id: string | null
          h: number
          id: string
          kind: string
          project_id: string
          removed: boolean
          revision: number
          scene_id: string | null
          title: string
          w: number
          x: number
          y: number
        }
        Insert: {
          asset_id?: string | null
          body?: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          group_id?: string | null
          h?: number
          id: string
          kind: string
          project_id: string
          removed?: boolean
          revision?: number
          scene_id?: string | null
          title?: string
          w?: number
          x?: number
          y?: number
        }
        Update: {
          asset_id?: string | null
          body?: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          group_id?: string | null
          h?: number
          id?: string
          kind?: string
          project_id?: string
          removed?: boolean
          revision?: number
          scene_id?: string | null
          title?: string
          w?: number
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "story_canvas_nodes_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_canvas_nodes_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "story_canvas_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_canvas_nodes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_canvas_nodes_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      story_facts: {
        Row: {
          at_scene_id: string | null
          created_at: string
          created_by: string | null
          id: string
          kind: string
          known_by: Json
          project_id: string
          removed: boolean
          revision: number
          text: string
        }
        Insert: {
          at_scene_id?: string | null
          created_at?: string
          created_by?: string | null
          id: string
          kind: string
          known_by?: Json
          project_id: string
          removed?: boolean
          revision?: number
          text: string
        }
        Update: {
          at_scene_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          known_by?: Json
          project_id?: string
          removed?: boolean
          revision?: number
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_facts_at_scene_id_fkey"
            columns: ["at_scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_facts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      story_profile_stages: {
        Row: {
          asset_id: string
          created_at: string
          created_by: string | null
          from_scene_id: string
          id: string
          patch: Json
          project_id: string
          removed: boolean
          revision: number
        }
        Insert: {
          asset_id: string
          created_at?: string
          created_by?: string | null
          from_scene_id: string
          id: string
          patch: Json
          project_id: string
          removed?: boolean
          revision?: number
        }
        Update: {
          asset_id?: string
          created_at?: string
          created_by?: string | null
          from_scene_id?: string
          id?: string
          patch?: Json
          project_id?: string
          removed?: boolean
          revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "story_profile_stages_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_profile_stages_from_scene_id_fkey"
            columns: ["from_scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_profile_stages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      story_profiles: {
        Row: {
          asset_id: string
          created_at: string
          created_by: string | null
          id: string
          profile: Json
          project_id: string
          removed: boolean
          revision: number
        }
        Insert: {
          asset_id: string
          created_at?: string
          created_by?: string | null
          id: string
          profile: Json
          project_id: string
          removed?: boolean
          revision?: number
        }
        Update: {
          asset_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          profile?: Json
          project_id?: string
          removed?: boolean
          revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "story_profiles_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_profiles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      story_sessions: {
        Row: {
          context: Json
          cost_usd: number
          created_at: string
          created_by: string
          from_turn: number | null
          id: string
          kind: string
          parent_session_id: string | null
          project_id: string
          status: string
          title: string
          turns: Json
          updated_at: string
        }
        Insert: {
          context?: Json
          cost_usd?: number
          created_at?: string
          created_by: string
          from_turn?: number | null
          id: string
          kind: string
          parent_session_id?: string | null
          project_id: string
          status?: string
          title?: string
          turns?: Json
          updated_at?: string
        }
        Update: {
          context?: Json
          cost_usd?: number
          created_at?: string
          created_by?: string
          from_turn?: number | null
          id?: string
          kind?: string
          parent_session_id?: string | null
          project_id?: string
          status?: string
          title?: string
          turns?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_sessions_parent_session_id_fkey"
            columns: ["parent_session_id"]
            isOneToOne: false
            referencedRelation: "story_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      story_suggestions: {
        Row: {
          created_at: string
          created_by: string
          id: string
          kind: string
          payload: Json
          project_id: string
          session_id: string | null
          status: string
          turn_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id: string
          kind: string
          payload: Json
          project_id: string
          session_id?: string | null
          status?: string
          turn_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          payload?: Json
          project_id?: string
          session_id?: string | null
          status?: string
          turn_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "story_suggestions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_suggestions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "story_sessions"
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
      template_instances: {
        Row: {
          composition_id: string
          content: Json
          created_at: string
          created_by: string | null
          id: string
          project_id: string
          removed: boolean
          revision: number
          template_asset_id: string
          template_version_id: string
        }
        Insert: {
          composition_id: string
          content?: Json
          created_at?: string
          created_by?: string | null
          id: string
          project_id: string
          removed?: boolean
          revision?: number
          template_asset_id: string
          template_version_id: string
        }
        Update: {
          composition_id?: string
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          project_id?: string
          removed?: boolean
          revision?: number
          template_asset_id?: string
          template_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_instances_composition_id_fkey"
            columns: ["composition_id"]
            isOneToOne: false
            referencedRelation: "compositions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_instances_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_instances_template_asset_id_fkey"
            columns: ["template_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_instances_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "asset_versions"
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
      upload_sessions: {
        Row: {
          bytes_total: number
          context: Json
          created_at: string
          created_by: string
          creator_name: string
          expires_at: string
          files_count: number
          id: string
          kind: string
          label: string
          last_seen_at: string | null
          max_bytes: number
          max_files: number
          media_kinds: string[]
          parent_id: string | null
          project_id: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          bytes_total?: number
          context: Json
          created_at?: string
          created_by: string
          creator_name?: string
          expires_at: string
          files_count?: number
          id?: string
          kind: string
          label?: string
          last_seen_at?: string | null
          max_bytes: number
          max_files: number
          media_kinds?: string[]
          parent_id?: string | null
          project_id: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          bytes_total?: number
          context?: Json
          created_at?: string
          created_by?: string
          creator_name?: string
          expires_at?: string
          files_count?: number
          id?: string
          kind?: string
          label?: string
          last_seen_at?: string | null
          max_bytes?: number
          max_files?: number
          media_kinds?: string[]
          parent_id?: string | null
          project_id?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "upload_sessions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "upload_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upload_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          revoked_at: string | null
          role: string
          token_hash: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          revoked_at?: string | null
          role: string
          token_hash: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          revoked_at?: string | null
          role?: string
          token_hash?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          invited_by: string | null
          joined_at: string
          removed_at: string | null
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          invited_by?: string | null
          joined_at?: string
          removed_at?: string | null
          role: string
          user_id: string
          workspace_id: string
        }
        Update: {
          invited_by?: string | null
          joined_at?: string
          removed_at?: string | null
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          id: string
          name: string
          revision: number
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          name: string
          revision?: number
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          revision?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: string }
      accept_privacy: { Args: { p_version: number }; Returns: undefined }
      accept_workspace_invitation: {
        Args: { p_token: string }
        Returns: string
      }
      activate_film_share: {
        Args: { p_byte_size: number; p_share: string }
        Returns: string
      }
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
      attach_mobile_draft: {
        Args: { p_asset: string; p_draft: string; p_project: string }
        Returns: number
      }
      claim_mobile_import: { Args: { p_id: string }; Returns: boolean }
      create_film_share: {
        Args: {
          p_byte_size: number
          p_duration_ms: number
          p_export_record: string
          p_height: number
          p_project: string
          p_share_days: number
          p_title: string
          p_width: number
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
      create_workspace: { Args: { p_name: string }; Returns: string }
      create_workspace_invitation: {
        Args: { p_email: string; p_role?: string; p_workspace: string }
        Returns: string
      }
      delete_project: {
        Args: { p_actor: string; p_project: string }
        Returns: Json
      }
      dismiss_mobile_import: {
        Args: { p_dismissed: boolean; p_id: string }
        Returns: undefined
      }
      film_share_token: { Args: { p_share: string }; Returns: string }
      global_add_version: {
        Args: {
          p_bytes: number
          p_duration_ms: number
          p_height: number
          p_mime: string
          p_note: string
          p_sha256: string
          p_storage_key: string
          p_template_spec?: Json
          p_variant: string
          p_width: number
        }
        Returns: string
      }
      global_asset_projects: {
        Args: { p_asset: string }
        Returns: {
          project_id: string
          project_name: string
        }[]
      }
      global_create_asset: {
        Args: {
          p_categories: string[]
          p_description: string
          p_kind: string
          p_name: string
          p_tags: string[]
          p_workspace: string
        }
        Returns: string
      }
      global_create_variant: {
        Args: {
          p_appearance: string
          p_asset: string
          p_name: string
          p_style: string
        }
        Returns: string
      }
      global_publish_animation: {
        Args: {
          p_note: string
          p_patterns: Json
          p_rig_spec: Json
          p_variant: string
        }
        Returns: string
      }
      global_set_asset_archived: {
        Args: { p_archived: boolean; p_asset: string }
        Returns: undefined
      }
      global_update_asset: {
        Args: {
          p_asset: string
          p_categories: string[]
          p_description: string
          p_name: string
          p_revision: number
          p_tags: string[]
        }
        Returns: number
      }
      leave_project: { Args: { p_project: string }; Returns: undefined }
      leave_workspace: { Args: { p_workspace: string }; Returns: undefined }
      link_mobile_import: {
        Args: {
          p_asset: string
          p_id: string
          p_take: string
          p_version: string
        }
        Returns: undefined
      }
      list_workspace_members: {
        Args: { p_workspace: string }
        Returns: {
          display_name: string
          joined_at: string
          role: string
          user_id: string
        }[]
      }
      mobile_confirm_upload: {
        Args: {
          p_bytes: number
          p_client_file_id: string
          p_error: string
          p_ok: boolean
          p_token_hash: string
        }
        Returns: {
          approved_at: string | null
          approved_rig_version_id: string | null
          asset_id: string | null
          asset_version_id: string | null
          byte_size: number
          claimed_at: string | null
          claimed_by: string | null
          client_file_id: string
          confirmed_at: string | null
          context: Json
          contributor_name: string
          created_at: string
          dismissed: boolean
          error: string | null
          file_name: string
          id: string
          kind: string
          mime_type: string
          path: string
          project_id: string
          session_id: string
          status: string
          take_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "mobile_imports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mobile_register_upload: {
        Args: {
          p_bytes: number
          p_client_file_id: string
          p_contributor: string
          p_file_name: string
          p_kind: string
          p_mime: string
          p_path: string
          p_token_hash: string
        }
        Returns: {
          approved_at: string | null
          approved_rig_version_id: string | null
          asset_id: string | null
          asset_version_id: string | null
          byte_size: number
          claimed_at: string | null
          claimed_by: string | null
          client_file_id: string
          confirmed_at: string | null
          context: Json
          contributor_name: string
          created_at: string
          dismissed: boolean
          error: string | null
          file_name: string
          id: string
          kind: string
          mime_type: string
          path: string
          project_id: string
          session_id: string
          status: string
          take_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "mobile_imports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mobile_session_touch: {
        Args: { p_token_hash: string }
        Returns: {
          bytes_total: number
          context: Json
          created_at: string
          created_by: string
          creator_name: string
          expires_at: string
          files_count: number
          id: string
          kind: string
          label: string
          last_seen_at: string | null
          max_bytes: number
          max_files: number
          media_kinds: string[]
          parent_id: string | null
          project_id: string
          revoked_at: string | null
          token_hash: string
        }
        SetofOptions: {
          from: "*"
          to: "upload_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
      remove_workspace_member: {
        Args: { p_user: string; p_workspace: string }
        Returns: undefined
      }
      rename_workspace: {
        Args: { p_name: string; p_workspace: string }
        Returns: undefined
      }
      revoke_film_share: { Args: { p_share: string }; Returns: undefined }
      revoke_invitation: { Args: { p_invitation: string }; Returns: undefined }
      revoke_upload_session: { Args: { p_id: string }; Returns: undefined }
      revoke_workspace_invitation: {
        Args: { p_invitation: string }
        Returns: undefined
      }
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
      set_project_workspace: {
        Args: { p_project: string; p_workspace: string }
        Returns: undefined
      }
      set_workspace_member_role: {
        Args: { p_role: string; p_user: string; p_workspace: string }
        Returns: undefined
      }
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
