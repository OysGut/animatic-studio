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
          byte_size: number
          byte_size_big: number
          created_at: string
          created_by: string | null
          height: number | null
          id: string
          media_path: string
          mime_type: string
          note: string
          number: number
          project_id: string
          revision: number
          sha256: string
          variant_id: string
          width: number | null
        }
        Insert: {
          byte_size: number
          byte_size_big: number
          created_at?: string
          created_by?: string | null
          height?: number | null
          id: string
          media_path: string
          mime_type: string
          note?: string
          number: number
          project_id: string
          revision?: number
          sha256: string
          variant_id: string
          width?: number | null
        }
        Update: {
          byte_size?: number
          byte_size_big?: number
          created_at?: string
          created_by?: string | null
          height?: number | null
          id?: string
          media_path?: string
          mime_type?: string
          note?: string
          number?: number
          project_id?: string
          revision?: number
          sha256?: string
          variant_id?: string
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
          created_at: string
          created_by: string | null
          description: string
          id: string
          kind: string
          name: string
          names: Json
          project_id: string
          revision: number
          tags: Json
        }
        Insert: {
          archived?: boolean
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id: string
          kind: string
          name: string
          names?: Json
          project_id: string
          revision?: number
          tags?: Json
        }
        Update: {
          archived?: boolean
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          kind?: string
          name?: string
          names?: Json
          project_id?: string
          revision?: number
          tags?: Json
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
      production_segments: {
        Row: {
          created_at: string
          created_by: string | null
          end_block_id: string | null
          id: string
          occurrence_id: string
          order_key: string
          project_id: string
          reason: string
          revision: number
          start_block_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_block_id?: string | null
          id: string
          occurrence_id: string
          order_key: string
          project_id: string
          reason: string
          revision?: number
          start_block_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_block_id?: string | null
          id?: string
          occurrence_id?: string
          order_key?: string
          project_id?: string
          reason?: string
          revision?: number
          start_block_id?: string | null
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
          updated_at: string
          user_id: string
        }
        Insert: {
          display_name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          display_name?: string
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
          created_at: string
          created_by: string
          fps_den: number
          fps_num: number
          id: string
          name: string
          primary_language: string
          revision: number
        }
        Insert: {
          created_at?: string
          created_by: string
          fps_den?: number
          fps_num?: number
          id: string
          name: string
          primary_language?: string
          revision?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          fps_den?: number
          fps_num?: number
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
          order_key: string
          production_id: string
          production_number: string | null
          project_id: string
          revision: number
          scene_id: string
          variant_id: string
        }
        Insert: {
          active?: boolean
          active_take_id?: string | null
          created_at?: string
          created_by?: string | null
          excerpt_in?: number | null
          excerpt_out?: number | null
          id: string
          order_key: string
          production_id: string
          production_number?: string | null
          project_id: string
          revision?: number
          scene_id: string
          variant_id: string
        }
        Update: {
          active?: boolean
          active_take_id?: string | null
          created_at?: string
          created_by?: string | null
          excerpt_in?: number | null
          excerpt_out?: number | null
          id?: string
          order_key?: string
          production_id?: string
          production_number?: string | null
          project_id?: string
          revision?: number
          scene_id?: string
          variant_id?: string
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
          stamp_at: string
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
          stamp_at?: string
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
          stamp_at?: string
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
      takes: {
        Row: {
          created_at: string
          created_by: string | null
          duration_frames: number | null
          id: string
          kind: string
          media_ref: string | null
          occurrence_id: string
          produced_from: Json
          project_id: string
          revision: number
          segment_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          duration_frames?: number | null
          id: string
          kind: string
          media_ref?: string | null
          occurrence_id: string
          produced_from?: Json
          project_id: string
          revision?: number
          segment_id?: string | null
          status: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          duration_frames?: number | null
          id?: string
          kind?: string
          media_ref?: string | null
          occurrence_id?: string
          produced_from?: Json
          project_id?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: string }
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
