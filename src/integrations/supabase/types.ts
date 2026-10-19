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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_events: {
        Row: {
          area_id: string | null
          company_id: string
          created_at: string
          id: string
          job_id: string | null
          kind: string
          meta: Json
          photo_id: string | null
          user_id: string | null
        }
        Insert: {
          area_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          job_id?: string | null
          kind: string
          meta?: Json
          photo_id?: string | null
          user_id?: string | null
        }
        Update: {
          area_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          job_id?: string | null
          kind?: string
          meta?: Json
          photo_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      app_roles: {
        Row: {
          can_add_photos: boolean
          can_add_projects: boolean
          can_delete_photos: boolean
          can_delete_projects: boolean
          can_edit_photos: boolean
          can_edit_projects: boolean
          can_manage_national_paint: boolean
          can_manage_safety: boolean
          can_send_messages: boolean
          can_view_safety: boolean
          created_at: string
          id: string
          is_active: boolean
          is_admin: boolean
          is_director: boolean
          name: string
          updated_at: string
        }
        Insert: {
          can_add_photos?: boolean
          can_add_projects?: boolean
          can_delete_photos?: boolean
          can_delete_projects?: boolean
          can_edit_photos?: boolean
          can_edit_projects?: boolean
          can_manage_national_paint?: boolean
          can_manage_safety?: boolean
          can_send_messages?: boolean
          can_view_safety?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          is_admin?: boolean
          is_director?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          can_add_photos?: boolean
          can_add_projects?: boolean
          can_delete_photos?: boolean
          can_delete_projects?: boolean
          can_edit_photos?: boolean
          can_edit_projects?: boolean
          can_manage_national_paint?: boolean
          can_manage_safety?: boolean
          can_send_messages?: boolean
          can_view_safety?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          is_admin?: boolean
          is_director?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      areas: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          job_id: string
          name: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          job_id: string
          name: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          job_id?: string
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "areas_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      checklist_item_photos: {
        Row: {
          attached_by: string
          created_at: string
          id: string
          item_id: string
          job_id: string
          photo_id: string
        }
        Insert: {
          attached_by?: string
          created_at?: string
          id?: string
          item_id: string
          job_id: string
          photo_id: string
        }
        Update: {
          attached_by?: string
          created_at?: string
          id?: string
          item_id?: string
          job_id?: string
          photo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_item_photos_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_item_photos_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_item_photos_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_items: {
        Row: {
          assignee_id: string | null
          checklist_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          instructions: string | null
          job_id: string
          photos_required: boolean
          position: number
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          checklist_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          instructions?: string | null
          job_id: string
          photos_required?: boolean
          position?: number
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          checklist_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          instructions?: string | null
          job_id?: string
          photos_required?: boolean
          position?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_questions: {
        Row: {
          answer: string | null
          answered_at: string | null
          answered_by: string | null
          created_at: string
          id: string
          item_id: string
          job_id: string
          position: number
          prompt: string
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          created_at?: string
          id?: string
          item_id: string
          job_id: string
          position?: number
          prompt: string
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          created_at?: string
          id?: string
          item_id?: string
          job_id?: string
          position?: number
          prompt?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_questions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_questions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      checklists: {
        Row: {
          assignee_id: string | null
          company_id: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          job_id: string
          position: number
          template_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          job_id: string
          position?: number
          template_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          job_id?: string
          position?: number
          template_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklists_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          body: string
          company_id: string
          created_at: string
          id: string
          job_id: string
          photo_id: string
          user_id: string
        }
        Insert: {
          body: string
          company_id: string
          created_at?: string
          id?: string
          job_id: string
          photo_id: string
          user_id: string
        }
        Update: {
          body?: string
          company_id?: string
          created_at?: string
          id?: string
          job_id?: string
          photo_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["company_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["company_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["company_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          display_name: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          last_sent_at: string
          role_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          last_sent_at?: string
          role_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          last_sent_at?: string
          role_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "app_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      jha_records: {
        Row: {
          answers: Json | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          job_id: string
          requested_at: string | null
          requested_by: string | null
          signature: string | null
        }
        Insert: {
          answers?: Json | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          job_id: string
          requested_at?: string | null
          requested_by?: string | null
          signature?: string | null
        }
        Update: {
          answers?: Json | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          job_id?: string
          requested_at?: string | null
          requested_by?: string | null
          signature?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jha_records_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jha_templates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          position: number
          prompt: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          position?: number
          prompt: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          position?: number
          prompt?: string
          updated_at?: string
        }
        Relationships: []
      }
      jobs: {
        Row: {
          address: string | null
          archived_at: string | null
          client: string | null
          cmic_number: string | null
          company_id: string
          created_at: string
          customer: string | null
          division: string | null
          divisions: string[]
          geocode_failed: boolean
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          notes: string | null
          owner: string | null
          owner_id: string | null
          phase: string | null
          status: string
          tags: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          client?: string | null
          cmic_number?: string | null
          company_id: string
          created_at?: string
          customer?: string | null
          division?: string | null
          divisions?: string[]
          geocode_failed?: boolean
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          notes?: string | null
          owner?: string | null
          owner_id?: string | null
          phase?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          client?: string | null
          cmic_number?: string | null
          company_id?: string
          created_at?: string
          customer?: string | null
          division?: string | null
          divisions?: string[]
          geocode_failed?: boolean
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          notes?: string | null
          owner?: string | null
          owner_id?: string | null
          phase?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      np_budget_targets: {
        Row: {
          amount: number
          created_at: string
          id: string
          month: number
          updated_at: string
          year: number
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          month: number
          updated_at?: string
          year: number
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          month?: number
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      np_contractors: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      np_crew_members: {
        Row: {
          created_at: string
          crew_id: string
          id: string
          name: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          crew_id: string
          id?: string
          name: string
          role: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          crew_id?: string
          id?: string
          name?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "np_crew_members_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "np_crews"
            referencedColumns: ["id"]
          }
        ]
      }
      np_crews: {
        Row: {
          contractor_id: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          owner_name: string | null
          crew_type: string | null
          size: number | null
          updated_at: string
        }
        Insert: {
          contractor_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          owner_name?: string | null
          crew_type?: string | null
          size?: number | null
          updated_at?: string
        }
        Update: {
          contractor_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          owner_name?: string | null
          crew_type?: string | null
          size?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "np_crews_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "np_contractors"
            referencedColumns: ["id"]
          }
        ]
      }
      np_pms: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      np_projects: {
        Row: {
          address: string | null
          bonus_eligible: boolean
          city: string | null
          cmic_job_number: string | null
          contractor_id: string | null
          crew_id: string | null
          created_at: string
          deadline: string | null
          est_end: string | null
          est_revenue: number | null
          est_start: string | null
          exclude_revenue: boolean
          id: string
          name: string
          notes: string | null
          pm_id: string | null
          progress: number | null
          state: string | null
          status: string
          tag: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          bonus_eligible?: boolean
          city?: string | null
          cmic_job_number?: string | null
          contractor_id?: string | null
          crew_id?: string | null
          created_at?: string
          deadline?: string | null
          est_end?: string | null
          est_revenue?: number | null
          est_start?: string | null
          exclude_revenue?: boolean
          id?: string
          name: string
          notes?: string | null
          pm_id?: string | null
          progress?: number | null
          state?: string | null
          status?: string
          tag?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          bonus_eligible?: boolean
          city?: string | null
          cmic_job_number?: string | null
          contractor_id?: string | null
          crew_id?: string | null
          created_at?: string
          deadline?: string | null
          est_end?: string | null
          est_revenue?: number | null
          est_start?: string | null
          exclude_revenue?: boolean
          id?: string
          name?: string
          notes?: string | null
          pm_id?: string | null
          progress?: number | null
          state?: string | null
          status?: string
          tag?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "np_projects_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "np_contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "np_projects_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "np_crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "np_projects_pm_id_fkey"
            columns: ["pm_id"]
            isOneToOne: false
            referencedRelation: "np_pms"
            referencedColumns: ["id"]
          }
        ]
      }
      photos: {
        Row: {
          accuracy: number | null
          annotated_image_url: string | null
          annotated_storage_path: string | null
          annotations_data: Json | null
          archived_at: string | null
          area_id: string | null
          caption: string | null
          company_id: string
          created_at: string
          duration_seconds: number | null
          file_size: number | null
          id: string
          image_url: string
          job_id: string
          latitude: number | null
          location_source: string | null
          longitude: number | null
          media_type: string
          mime_type: string | null
          phase: string | null
          storage_path: string
          tags: string[]
          taken_at: string
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          annotated_image_url?: string | null
          annotated_storage_path?: string | null
          annotations_data?: Json | null
          archived_at?: string | null
          area_id?: string | null
          caption?: string | null
          company_id: string
          created_at?: string
          duration_seconds?: number | null
          file_size?: number | null
          id?: string
          image_url: string
          job_id: string
          latitude?: number | null
          location_source?: string | null
          longitude?: number | null
          media_type?: string
          mime_type?: string | null
          phase?: string | null
          storage_path: string
          tags?: string[]
          taken_at?: string
          user_id: string
        }
        Update: {
          accuracy?: number | null
          annotated_image_url?: string | null
          annotated_storage_path?: string | null
          annotations_data?: Json | null
          archived_at?: string | null
          area_id?: string | null
          caption?: string | null
          company_id?: string
          created_at?: string
          duration_seconds?: number | null
          file_size?: number | null
          id?: string
          image_url?: string
          job_id?: string
          latitude?: number | null
          location_source?: string | null
          longitude?: number | null
          media_type?: string
          mime_type?: string | null
          phase?: string | null
          storage_path?: string
          tags?: string[]
          taken_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "photos_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      message_recipients: {
        Row: {
          id: string
          message_id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          message_id: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          message_id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_recipients_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          id: string
          project_id: string | null
          safety_document_id: string | null
          sender_id: string
          sent_at: string
          subject: string
        }
        Insert: {
          body: string
          id?: string
          project_id?: string | null
          safety_document_id?: string | null
          sender_id?: string
          sent_at?: string
          subject: string
        }
        Update: {
          body?: string
          id?: string
          project_id?: string | null
          safety_document_id?: string | null
          sender_id?: string
          sent_at?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_safety_document_id_fkey"
            columns: ["safety_document_id"]
            isOneToOne: false
            referencedRelation: "safety_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_disabled: boolean
          subcontractor_name: string | null
          updated_at: string
          worker_type: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          is_disabled?: boolean
          subcontractor_name?: string | null
          updated_at?: string
          worker_type?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_disabled?: boolean
          subcontractor_name?: string | null
          updated_at?: string
          worker_type?: string
        }
        Relationships: []
      }
      project_collaborators: {
        Row: {
          added_by: string | null
          company_id: string
          created_at: string
          id: string
          job_id: string
          role_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          added_by?: string | null
          company_id: string
          created_at?: string
          id?: string
          job_id: string
          role_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          added_by?: string | null
          company_id?: string
          created_at?: string
          id?: string
          job_id?: string
          role_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_collaborators_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_collaborators_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "app_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_notes: {
        Row: {
          body: string
          company_id: string
          created_at: string
          id: string
          job_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          company_id: string
          created_at?: string
          id?: string
          job_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          body?: string
          company_id?: string
          created_at?: string
          id?: string
          job_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_notes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_acknowledgements: {
        Row: {
          acknowledged_at: string
          document_id: string
          id: string
          revision: number
          user_id: string
        }
        Insert: {
          acknowledged_at?: string
          document_id: string
          id?: string
          revision: number
          user_id?: string
        }
        Update: {
          acknowledged_at?: string
          document_id?: string
          id?: string
          revision?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_acknowledgements_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "safety_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_documents: {
        Row: {
          archived: boolean
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          effective_date: string | null
          file_path: string
          id: string
          requires_acknowledgement: boolean
          revision: number
          shareable_with_subs: boolean
          title: string
          updated_at: string
          version: string | null
        }
        Insert: {
          archived?: boolean
          category: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          effective_date?: string | null
          file_path: string
          id?: string
          requires_acknowledgement?: boolean
          revision?: number
          shareable_with_subs?: boolean
          title: string
          updated_at?: string
          version?: string | null
        }
        Update: {
          archived?: boolean
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          effective_date?: string | null
          file_path?: string
          id?: string
          requires_acknowledgement?: boolean
          revision?: number
          shareable_with_subs?: boolean
          title?: string
          updated_at?: string
          version?: string | null
        }
        Relationships: []
      }
      share_links: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          job_id: string
          token: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          job_id: string
          token?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          job_id?: string
          token?: string
        }
        Relationships: []
      }
      toolbox_talk_topics: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      toolbox_talks: {
        Row: {
          attendees: Json | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          job_id: string
          led_by: string | null
          notes: string | null
          talk_date: string
          topic_body: string | null
          topic_id: string | null
          topic_title: string
        }
        Insert: {
          attendees?: Json | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          job_id: string
          led_by?: string | null
          notes?: string | null
          talk_date?: string
          topic_body?: string | null
          topic_id?: string | null
          topic_title: string
        }
        Update: {
          attendees?: Json | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          job_id?: string
          led_by?: string | null
          notes?: string | null
          talk_date?: string
          topic_body?: string | null
          topic_id?: string | null
          topic_title?: string
        }
        Relationships: [
          {
            foreignKeyName: "toolbox_talks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_divisions: {
        Row: {
          created_at: string
          division: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          division: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          division?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "app_roles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_see_job: {
        Args: { _job_id: string; _user_id: string }
        Returns: boolean
      }
      company_role_of: {
        Args: { _company_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["company_role"]
      }
      get_shared_job: { Args: { _token: string }; Returns: Json }
      np_import_workbook: { Args: { _payload: Json }; Returns: Json }
      has_perm: { Args: { _perm: string; _user_id: string }; Returns: boolean }
      has_role: {
        Args: { _role_name: string; _user_id: string }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_company_member: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_company_owner: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      is_director: { Args: { _user_id: string }; Returns: boolean }
      my_divisions: { Args: { _user_id: string }; Returns: string[] }
      visible_job_ids: { Args: { _user_id: string }; Returns: string[] }
    }
    Enums: {
      company_role: "owner" | "admin" | "member"
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
    Enums: {
      company_role: ["owner", "admin", "member"],
    },
  },
} as const
