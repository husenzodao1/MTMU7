/**
 * GENERATED FILE — do not edit by hand.
 * Source: supabase/migrations (applied to PGlite) via scripts/db/generate-types.mts
 * Regenerate with: npm run db:types
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      academic_terms: {
        Row: {
          id: string;
          school_id: string;
          academic_year_id: string;
          name: string;
          kind: string;
          start_date: string;
          end_date: string;
          is_locked: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          academic_year_id: string;
          name: string;
          kind?: string;
          start_date: string;
          end_date: string;
          is_locked?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          academic_year_id?: string;
          name?: string;
          kind?: string;
          start_date?: string;
          end_date?: string;
          is_locked?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "academic_terms_academic_year_id_fkey";
            columns: ["academic_year_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "academic_terms_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      academic_years: {
        Row: {
          id: string;
          school_id: string;
          name: string;
          start_date: string;
          end_date: string;
          is_current: boolean;
          created_at: string;
          updated_at: string;
          status: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          name: string;
          start_date: string;
          end_date: string;
          is_current?: boolean;
          created_at?: string;
          updated_at?: string;
          status?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          name?: string;
          start_date?: string;
          end_date?: string;
          is_current?: boolean;
          created_at?: string;
          updated_at?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "academic_years_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_scopes: {
        Row: {
          id: string;
          user_id: string;
          scope_type: string;
          scope_role: string;
          region_id: string | null;
          district_id: string | null;
          school_id: string | null;
          granted_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          scope_type: string;
          scope_role: string;
          region_id?: string | null;
          district_id?: string | null;
          school_id?: string | null;
          granted_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          scope_type?: string;
          scope_role?: string;
          region_id?: string | null;
          district_id?: string | null;
          school_id?: string | null;
          granted_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_scopes_district_id_fkey";
            columns: ["district_id"];
            isOneToOne: false;
            referencedRelation: "districts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_scopes_granted_by_fkey";
            columns: ["granted_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_scopes_region_id_fkey";
            columns: ["region_id"];
            isOneToOne: false;
            referencedRelation: "regions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_scopes_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "admin_scopes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      announcements: {
        Row: {
          id: string;
          school_id: string;
          title: string;
          body: string;
          priority: string;
          audience_type: string;
          audience_roles: string[];
          audience_class_ids: string[];
          audience_user_ids: string[];
          publish_at: string;
          expires_at: string | null;
          status: string;
          attachment_path: string | null;
          attachment_name: string | null;
          created_by: string | null;
          published_by: string | null;
          published_at: string | null;
          notified_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          title: string;
          body: string;
          priority?: string;
          audience_type?: string;
          audience_roles?: string[];
          audience_class_ids?: string[];
          audience_user_ids?: string[];
          publish_at?: string;
          expires_at?: string | null;
          status?: string;
          attachment_path?: string | null;
          attachment_name?: string | null;
          created_by?: string | null;
          published_by?: string | null;
          published_at?: string | null;
          notified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          title?: string;
          body?: string;
          priority?: string;
          audience_type?: string;
          audience_roles?: string[];
          audience_class_ids?: string[];
          audience_user_ids?: string[];
          publish_at?: string;
          expires_at?: string | null;
          status?: string;
          attachment_path?: string | null;
          attachment_name?: string | null;
          created_by?: string | null;
          published_by?: string | null;
          published_at?: string | null;
          notified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "announcements_published_by_fkey";
            columns: ["published_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "announcements_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      assessment_types: {
        Row: {
          id: string;
          school_id: string;
          code: string;
          name_tg: string;
          name_ru: string | null;
          name_en: string | null;
          weight: number;
          max_score: number;
          is_final: boolean;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          code: string;
          name_tg: string;
          name_ru?: string | null;
          name_en?: string | null;
          weight?: number;
          max_score?: number;
          is_final?: boolean;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          code?: string;
          name_tg?: string;
          name_ru?: string | null;
          name_en?: string | null;
          weight?: number;
          max_score?: number;
          is_final?: boolean;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assessment_types_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      attendance_records: {
        Row: {
          id: string;
          school_id: string;
          student_id: string;
          class_id: string;
          class_subject_id: string | null;
          attendance_date: string;
          period_number: number | null;
          status: string;
          minutes_late: number | null;
          note: string | null;
          marked_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          student_id: string;
          class_id: string;
          class_subject_id?: string | null;
          attendance_date: string;
          period_number?: number | null;
          status: string;
          minutes_late?: number | null;
          note?: string | null;
          marked_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          student_id?: string;
          class_id?: string;
          class_subject_id?: string | null;
          attendance_date?: string;
          period_number?: number | null;
          status?: string;
          minutes_late?: number | null;
          note?: string | null;
          marked_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_records_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_records_class_subject_id_fkey";
            columns: ["class_subject_id"];
            isOneToOne: false;
            referencedRelation: "class_subjects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_records_marked_by_fkey";
            columns: ["marked_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_records_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_records_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_records_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          id: string;
          school_id: string | null;
          user_id: string | null;
          user_public_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          old_values: Json | null;
          new_values: Json | null;
          ip_address: string | null;
          user_agent: string | null;
          metadata: Json | null;
          created_at: string;
          actor_role: string | null;
        };
        Insert: {
          id?: string;
          school_id?: string | null;
          user_id?: string | null;
          user_public_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          old_values?: Json | null;
          new_values?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          metadata?: Json | null;
          created_at?: string;
          actor_role?: string | null;
        };
        Update: {
          id?: string;
          school_id?: string | null;
          user_id?: string | null;
          user_public_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          old_values?: Json | null;
          new_values?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          metadata?: Json | null;
          created_at?: string;
          actor_role?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      bell_periods: {
        Row: {
          id: string;
          school_id: string;
          shift: number;
          period_number: number;
          start_time: string;
          end_time: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          shift?: number;
          period_number: number;
          start_time: string;
          end_time: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          shift?: number;
          period_number?: number;
          start_time?: string;
          end_time?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bell_periods_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      class_positions: {
        Row: {
          id: string;
          school_id: string;
          class_id: string;
          student_id: string;
          position: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          class_id: string;
          student_id: string;
          position: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          class_id?: string;
          student_id?: string;
          position?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "class_positions_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "class_positions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "class_positions_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "class_positions_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      class_students: {
        Row: {
          id: string;
          class_id: string;
          student_id: string;
          school_id: string;
          enrolled_at: string;
        };
        Insert: {
          id?: string;
          class_id: string;
          student_id: string;
          school_id: string;
          enrolled_at?: string;
        };
        Update: {
          id?: string;
          class_id?: string;
          student_id?: string;
          school_id?: string;
          enrolled_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "class_students_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "class_students_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "class_students_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      class_subjects: {
        Row: {
          id: string;
          school_id: string;
          class_id: string;
          subject_id: string;
          teacher_id: string | null;
          weekly_hours: number | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          group_label: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          class_id: string;
          subject_id: string;
          teacher_id?: string | null;
          weekly_hours?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          group_label?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          class_id?: string;
          subject_id?: string;
          teacher_id?: string | null;
          weekly_hours?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          group_label?: string;
        };
        Relationships: [
          {
            foreignKeyName: "class_subjects_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "class_subjects_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "class_subjects_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "class_subjects_teacher_id_fkey";
            columns: ["teacher_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      classes: {
        Row: {
          id: string;
          school_id: string;
          academic_year_id: string;
          name: string;
          grade_level: number;
          homeroom_teacher_id: string | null;
          is_active: boolean;
          deactivated_at: string | null;
          created_at: string;
          updated_at: string;
          homeroom_staff_id: string | null;
          room_id: string | null;
          capacity: number | null;
          shift: number;
        };
        Insert: {
          id?: string;
          school_id: string;
          academic_year_id: string;
          name: string;
          grade_level: number;
          homeroom_teacher_id?: string | null;
          is_active?: boolean;
          deactivated_at?: string | null;
          created_at?: string;
          updated_at?: string;
          homeroom_staff_id?: string | null;
          room_id?: string | null;
          capacity?: number | null;
          shift?: number;
        };
        Update: {
          id?: string;
          school_id?: string;
          academic_year_id?: string;
          name?: string;
          grade_level?: number;
          homeroom_teacher_id?: string | null;
          is_active?: boolean;
          deactivated_at?: string | null;
          created_at?: string;
          updated_at?: string;
          homeroom_staff_id?: string | null;
          room_id?: string | null;
          capacity?: number | null;
          shift?: number;
        };
        Relationships: [
          {
            foreignKeyName: "classes_academic_year_id_fkey";
            columns: ["academic_year_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "classes_homeroom_staff_id_fkey";
            columns: ["homeroom_staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "classes_homeroom_teacher_id_fkey";
            columns: ["homeroom_teacher_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "classes_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "classes_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      content_blocks: {
        Row: {
          id: string;
          school_id: string;
          page_id: string | null;
          section: string;
          type: string;
          title_tg: string | null;
          title_ru: string | null;
          body_tg: string | null;
          body_ru: string | null;
          image_url: string | null;
          link_url: string | null;
          is_visible: boolean;
          hidden_at: string | null;
          sort_order: number;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
          title_en: string | null;
          body_en: string | null;
        };
        Insert: {
          id?: string;
          school_id: string;
          page_id?: string | null;
          section: string;
          type: string;
          title_tg?: string | null;
          title_ru?: string | null;
          body_tg?: string | null;
          body_ru?: string | null;
          image_url?: string | null;
          link_url?: string | null;
          is_visible?: boolean;
          hidden_at?: string | null;
          sort_order?: number;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
          title_en?: string | null;
          body_en?: string | null;
        };
        Update: {
          id?: string;
          school_id?: string;
          page_id?: string | null;
          section?: string;
          type?: string;
          title_tg?: string | null;
          title_ru?: string | null;
          body_tg?: string | null;
          body_ru?: string | null;
          image_url?: string | null;
          link_url?: string | null;
          is_visible?: boolean;
          hidden_at?: string | null;
          sort_order?: number;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
          title_en?: string | null;
          body_en?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "content_blocks_page_id_fkey";
            columns: ["page_id"];
            isOneToOne: false;
            referencedRelation: "pages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_blocks_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_members: {
        Row: {
          id: string;
          conversation_id: string;
          user_id: string;
          school_id: string;
          role: string;
          joined_at: string;
          last_read_at: string | null;
          is_muted: boolean;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          user_id: string;
          school_id: string;
          role?: string;
          joined_at?: string;
          last_read_at?: string | null;
          is_muted?: boolean;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          user_id?: string;
          school_id?: string;
          role?: string;
          joined_at?: string;
          last_read_at?: string | null;
          is_muted?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_members_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: {
          id: string;
          school_id: string;
          type: string;
          name: string | null;
          avatar_url: string | null;
          class_id: string | null;
          created_by: string | null;
          is_active: boolean;
          deactivated_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          type: string;
          name?: string | null;
          avatar_url?: string | null;
          class_id?: string | null;
          created_by?: string | null;
          is_active?: boolean;
          deactivated_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          type?: string;
          name?: string | null;
          avatar_url?: string | null;
          class_id?: string | null;
          created_by?: string | null;
          is_active?: boolean;
          deactivated_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      device_tokens: {
        Row: {
          id: string;
          user_id: string;
          school_id: string;
          token: string;
          platform: string;
          locale: string;
          created_at: string;
          last_seen_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          school_id: string;
          token: string;
          platform: string;
          locale?: string;
          created_at?: string;
          last_seen_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          school_id?: string;
          token?: string;
          platform?: string;
          locale?: string;
          created_at?: string;
          last_seen_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "device_tokens_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "device_tokens_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      directors: {
        Row: {
          id: string;
          school_id: string;
          full_name_tg: string;
          full_name_ru: string | null;
          full_name_en: string | null;
          position_tg: string;
          position_ru: string | null;
          position_en: string | null;
          photo_url: string | null;
          year_start: number;
          year_end: number | null;
          sort_order: number;
          is_visible: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          full_name_tg: string;
          full_name_ru?: string | null;
          full_name_en?: string | null;
          position_tg: string;
          position_ru?: string | null;
          position_en?: string | null;
          photo_url?: string | null;
          year_start: number;
          year_end?: number | null;
          sort_order?: number;
          is_visible?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          full_name_tg?: string;
          full_name_ru?: string | null;
          full_name_en?: string | null;
          position_tg?: string;
          position_ru?: string | null;
          position_en?: string | null;
          photo_url?: string | null;
          year_start?: number;
          year_end?: number | null;
          sort_order?: number;
          is_visible?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "directors_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      districts: {
        Row: {
          id: string;
          region_id: string;
          code: string;
          name_tg: string;
          name_ru: string | null;
          name_en: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          region_id: string;
          code: string;
          name_tg: string;
          name_ru?: string | null;
          name_en?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          region_id?: string;
          code?: string;
          name_tg?: string;
          name_ru?: string | null;
          name_en?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "districts_region_id_fkey";
            columns: ["region_id"];
            isOneToOne: false;
            referencedRelation: "regions";
            referencedColumns: ["id"];
          },
        ];
      };
      document_folders: {
        Row: {
          id: string;
          school_id: string;
          parent_id: string | null;
          name: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          parent_id?: string | null;
          name: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          parent_id?: string | null;
          name?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_folders_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "document_folders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_folders_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      document_versions: {
        Row: {
          id: string;
          document_id: string;
          school_id: string;
          version: number;
          storage_path: string;
          file_name: string;
          mime_type: string;
          size_bytes: number;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          document_id: string;
          school_id: string;
          version: number;
          storage_path: string;
          file_name: string;
          mime_type: string;
          size_bytes: number;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          document_id?: string;
          school_id?: string;
          version?: number;
          storage_path?: string;
          file_name?: string;
          mime_type?: string;
          size_bytes?: number;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_versions_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_versions_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          id: string;
          school_id: string;
          folder_id: string | null;
          title: string;
          description: string | null;
          category: string;
          access: string;
          allowed_roles: string[];
          status: string;
          current_version: number;
          storage_path: string;
          file_name: string;
          mime_type: string;
          size_bytes: number;
          published_at: string | null;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          folder_id?: string | null;
          title: string;
          description?: string | null;
          category?: string;
          access?: string;
          allowed_roles?: string[];
          status?: string;
          current_version?: number;
          storage_path: string;
          file_name: string;
          mime_type: string;
          size_bytes: number;
          published_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          folder_id?: string | null;
          title?: string;
          description?: string | null;
          category?: string;
          access?: string;
          allowed_roles?: string[];
          status?: string;
          current_version?: number;
          storage_path?: string;
          file_name?: string;
          mime_type?: string;
          size_bytes?: number;
          published_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "documents_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_folder_id_fkey";
            columns: ["folder_id"];
            isOneToOne: false;
            referencedRelation: "document_folders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      enrollments: {
        Row: {
          id: string;
          school_id: string;
          student_id: string;
          class_id: string;
          academic_year_id: string;
          status: string;
          enrolled_on: string;
          left_on: string | null;
          reason: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          student_id: string;
          class_id: string;
          academic_year_id: string;
          status?: string;
          enrolled_on?: string;
          left_on?: string | null;
          reason?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          student_id?: string;
          class_id?: string;
          academic_year_id?: string;
          status?: string;
          enrolled_on?: string;
          left_on?: string | null;
          reason?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "enrollments_academic_year_id_fkey";
            columns: ["academic_year_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enrollments_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enrollments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enrollments_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enrollments_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          id: string;
          school_id: string;
          title: string;
          description: string | null;
          category: string;
          starts_at: string;
          ends_at: string | null;
          all_day: boolean;
          location: string | null;
          audience: string;
          organizer: string | null;
          image_path: string | null;
          status: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          title: string;
          description?: string | null;
          category?: string;
          starts_at: string;
          ends_at?: string | null;
          all_day?: boolean;
          location?: string | null;
          audience?: string;
          organizer?: string | null;
          image_path?: string | null;
          status?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          title?: string;
          description?: string | null;
          category?: string;
          starts_at?: string;
          ends_at?: string | null;
          all_day?: boolean;
          location?: string | null;
          audience?: string;
          organizer?: string | null;
          image_path?: string | null;
          status?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      friend_requests: {
        Row: {
          id: string;
          school_id: string;
          sender_id: string;
          receiver_id: string;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          sender_id: string;
          receiver_id: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          sender_id?: string;
          receiver_id?: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "friend_requests_receiver_id_fkey";
            columns: ["receiver_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "friend_requests_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "friend_requests_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      grades: {
        Row: {
          id: string;
          school_id: string;
          student_id: string;
          class_subject_id: string;
          academic_term_id: string | null;
          assessment_type_id: string;
          score: number;
          max_score: number;
          grade_date: string;
          comment: string | null;
          status: string;
          approved_by: string | null;
          approved_at: string | null;
          entered_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          student_id: string;
          class_subject_id: string;
          academic_term_id?: string | null;
          assessment_type_id: string;
          score: number;
          max_score: number;
          grade_date?: string;
          comment?: string | null;
          status?: string;
          approved_by?: string | null;
          approved_at?: string | null;
          entered_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          student_id?: string;
          class_subject_id?: string;
          academic_term_id?: string | null;
          assessment_type_id?: string;
          score?: number;
          max_score?: number;
          grade_date?: string;
          comment?: string | null;
          status?: string;
          approved_by?: string | null;
          approved_at?: string | null;
          entered_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "grades_academic_term_id_fkey";
            columns: ["academic_term_id"];
            isOneToOne: false;
            referencedRelation: "academic_terms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "grades_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "grades_assessment_type_id_fkey";
            columns: ["assessment_type_id"];
            isOneToOne: false;
            referencedRelation: "assessment_types";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "grades_class_subject_id_fkey";
            columns: ["class_subject_id"];
            isOneToOne: false;
            referencedRelation: "class_subjects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "grades_entered_by_fkey";
            columns: ["entered_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "grades_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "grades_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "grades_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      guardians: {
        Row: {
          id: string;
          school_id: string;
          user_id: string | null;
          first_name: string;
          last_name: string;
          middle_name: string | null;
          phone: string | null;
          email: string | null;
          address: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          user_id?: string | null;
          first_name: string;
          last_name: string;
          middle_name?: string | null;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          user_id?: string | null;
          first_name?: string;
          last_name?: string;
          middle_name?: string | null;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "guardians_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "guardians_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      homework_assignments: {
        Row: {
          id: string;
          school_id: string;
          class_subject_id: string;
          title: string;
          instructions: string | null;
          due_at: string | null;
          max_score: number | null;
          allow_submissions: boolean;
          status: string;
          published_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          class_subject_id: string;
          title: string;
          instructions?: string | null;
          due_at?: string | null;
          max_score?: number | null;
          allow_submissions?: boolean;
          status?: string;
          published_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          class_subject_id?: string;
          title?: string;
          instructions?: string | null;
          due_at?: string | null;
          max_score?: number | null;
          allow_submissions?: boolean;
          status?: string;
          published_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "homework_assignments_class_subject_id_fkey";
            columns: ["class_subject_id"];
            isOneToOne: false;
            referencedRelation: "class_subjects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "homework_assignments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "homework_assignments_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      homework_attachments: {
        Row: {
          id: string;
          school_id: string;
          assignment_id: string | null;
          submission_id: string | null;
          storage_path: string;
          file_name: string;
          mime_type: string;
          size_bytes: number;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          assignment_id?: string | null;
          submission_id?: string | null;
          storage_path: string;
          file_name: string;
          mime_type: string;
          size_bytes: number;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          assignment_id?: string | null;
          submission_id?: string | null;
          storage_path?: string;
          file_name?: string;
          mime_type?: string;
          size_bytes?: number;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "homework_attachments_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: false;
            referencedRelation: "homework_assignments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "homework_attachments_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "homework_attachments_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: false;
            referencedRelation: "homework_submissions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "homework_attachments_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      homework_submissions: {
        Row: {
          id: string;
          school_id: string;
          assignment_id: string;
          student_id: string;
          content: string | null;
          status: string;
          submitted_at: string | null;
          score: number | null;
          feedback: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          assignment_id: string;
          student_id: string;
          content?: string | null;
          status?: string;
          submitted_at?: string | null;
          score?: number | null;
          feedback?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          assignment_id?: string;
          student_id?: string;
          content?: string | null;
          status?: string;
          submitted_at?: string | null;
          score?: number | null;
          feedback?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "homework_submissions_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: false;
            referencedRelation: "homework_assignments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "homework_submissions_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "homework_submissions_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "homework_submissions_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      invitation_codes: {
        Row: {
          id: string;
          school_id: string;
          role_id: string;
          code: string;
          max_uses: number;
          used_count: number;
          expires_at: string | null;
          created_by: string;
          is_active: boolean;
          created_at: string;
          person_type: string | null;
          person_id: string | null;
          class_id: string | null;
          note: string | null;
          last_used_at: string | null;
        };
        Insert: {
          id?: string;
          school_id: string;
          role_id: string;
          code: string;
          max_uses?: number;
          used_count?: number;
          expires_at?: string | null;
          created_by: string;
          is_active?: boolean;
          created_at?: string;
          person_type?: string | null;
          person_id?: string | null;
          class_id?: string | null;
          note?: string | null;
          last_used_at?: string | null;
        };
        Update: {
          id?: string;
          school_id?: string;
          role_id?: string;
          code?: string;
          max_uses?: number;
          used_count?: number;
          expires_at?: string | null;
          created_by?: string;
          is_active?: boolean;
          created_at?: string;
          person_type?: string | null;
          person_id?: string | null;
          class_id?: string | null;
          note?: string | null;
          last_used_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "invitation_codes_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitation_codes_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitation_codes_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitation_codes_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      journal_columns: {
        Row: {
          id: string;
          school_id: string;
          class_subject_id: string;
          academic_term_id: string;
          column_date: string;
          assessment_type_id: string;
          period_number: number | null;
          label: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          kind: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          class_subject_id: string;
          academic_term_id: string;
          column_date: string;
          assessment_type_id: string;
          period_number?: number | null;
          label?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          kind?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          class_subject_id?: string;
          academic_term_id?: string;
          column_date?: string;
          assessment_type_id?: string;
          period_number?: number | null;
          label?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          kind?: string;
        };
        Relationships: [
          {
            foreignKeyName: "journal_columns_academic_term_id_fkey";
            columns: ["academic_term_id"];
            isOneToOne: false;
            referencedRelation: "academic_terms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "journal_columns_assessment_type_id_fkey";
            columns: ["assessment_type_id"];
            isOneToOne: false;
            referencedRelation: "assessment_types";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "journal_columns_class_subject_id_fkey";
            columns: ["class_subject_id"];
            isOneToOne: false;
            referencedRelation: "class_subjects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "journal_columns_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "journal_columns_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      lesson_topics: {
        Row: {
          id: string;
          school_id: string;
          class_subject_id: string;
          academic_term_id: string | null;
          lesson_date: string;
          period_number: number | null;
          topic: string;
          homework: string | null;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          class_subject_id: string;
          academic_term_id?: string | null;
          lesson_date: string;
          period_number?: number | null;
          topic: string;
          homework?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          class_subject_id?: string;
          academic_term_id?: string | null;
          lesson_date?: string;
          period_number?: number | null;
          topic?: string;
          homework?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lesson_topics_academic_term_id_fkey";
            columns: ["academic_term_id"];
            isOneToOne: false;
            referencedRelation: "academic_terms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lesson_topics_class_subject_id_fkey";
            columns: ["class_subject_id"];
            isOneToOne: false;
            referencedRelation: "class_subjects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lesson_topics_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lesson_topics_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "lesson_topics_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      library_categories: {
        Row: {
          id: string;
          school_id: string;
          parent_id: string | null;
          name_tg: string;
          name_ru: string | null;
          slug: string;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          name_en: string | null;
        };
        Insert: {
          id?: string;
          school_id: string;
          parent_id?: string | null;
          name_tg: string;
          name_ru?: string | null;
          slug: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          name_en?: string | null;
        };
        Update: {
          id?: string;
          school_id?: string;
          parent_id?: string | null;
          name_tg?: string;
          name_ru?: string | null;
          slug?: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          name_en?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "library_categories_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "library_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "library_categories_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      library_favorites: {
        Row: {
          user_id: string;
          item_id: string;
          school_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          item_id: string;
          school_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          item_id?: string;
          school_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "library_favorites_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "library_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "library_favorites_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "library_favorites_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      library_item_access: {
        Row: {
          id: string;
          item_id: string;
          school_id: string;
          role_id: string | null;
          class_id: string | null;
        };
        Insert: {
          id?: string;
          item_id: string;
          school_id: string;
          role_id?: string | null;
          class_id?: string | null;
        };
        Update: {
          id?: string;
          item_id?: string;
          school_id?: string;
          role_id?: string | null;
          class_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "library_item_access_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "library_item_access_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "library_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "library_item_access_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "library_item_access_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      library_items: {
        Row: {
          id: string;
          school_id: string;
          title: string;
          author: string | null;
          description: string | null;
          cover_url: string | null;
          file_url: string | null;
          file_name: string | null;
          file_size: number | null;
          file_type: string | null;
          category_id: string | null;
          language: string;
          publication_year: number | null;
          publisher: string | null;
          subject_id: string | null;
          grade_level: number | null;
          visibility: string;
          is_published: boolean;
          unpublished_at: string | null;
          uploaded_by: string | null;
          metadata: Json | null;
          search_vector: string | null;
          created_at: string;
          updated_at: string;
          subtitle: string | null;
          isbn: string | null;
          page_count: number | null;
          tags: string[];
          shelf_location: string | null;
          quantity: number;
          available_quantity: number;
          is_featured: boolean;
          status: string;
          published_at: string | null;
          archived_at: string | null;
          updated_by: string | null;
          view_count: number;
        };
        Insert: {
          id?: string;
          school_id: string;
          title: string;
          author?: string | null;
          description?: string | null;
          cover_url?: string | null;
          file_url?: string | null;
          file_name?: string | null;
          file_size?: number | null;
          file_type?: string | null;
          category_id?: string | null;
          language?: string;
          publication_year?: number | null;
          publisher?: string | null;
          subject_id?: string | null;
          grade_level?: number | null;
          visibility?: string;
          is_published?: boolean;
          unpublished_at?: string | null;
          uploaded_by?: string | null;
          metadata?: Json | null;
          search_vector?: never;
          created_at?: string;
          updated_at?: string;
          subtitle?: string | null;
          isbn?: string | null;
          page_count?: number | null;
          tags?: string[];
          shelf_location?: string | null;
          quantity?: number;
          available_quantity?: number;
          is_featured?: boolean;
          status?: string;
          published_at?: string | null;
          archived_at?: string | null;
          updated_by?: string | null;
          view_count?: number;
        };
        Update: {
          id?: string;
          school_id?: string;
          title?: string;
          author?: string | null;
          description?: string | null;
          cover_url?: string | null;
          file_url?: string | null;
          file_name?: string | null;
          file_size?: number | null;
          file_type?: string | null;
          category_id?: string | null;
          language?: string;
          publication_year?: number | null;
          publisher?: string | null;
          subject_id?: string | null;
          grade_level?: number | null;
          visibility?: string;
          is_published?: boolean;
          unpublished_at?: string | null;
          uploaded_by?: string | null;
          metadata?: Json | null;
          search_vector?: never;
          created_at?: string;
          updated_at?: string;
          subtitle?: string | null;
          isbn?: string | null;
          page_count?: number | null;
          tags?: string[];
          shelf_location?: string | null;
          quantity?: number;
          available_quantity?: number;
          is_featured?: boolean;
          status?: string;
          published_at?: string | null;
          archived_at?: string | null;
          updated_by?: string | null;
          view_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "library_items_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "library_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "library_items_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "library_items_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "library_items_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "library_items_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      library_reading_history: {
        Row: {
          id: string;
          user_id: string;
          item_id: string;
          school_id: string;
          last_page: number | null;
          last_position: string | null;
          opened_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          item_id: string;
          school_id: string;
          last_page?: number | null;
          last_position?: string | null;
          opened_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          item_id?: string;
          school_id?: string;
          last_page?: number | null;
          last_position?: string | null;
          opened_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "library_reading_history_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "library_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "library_reading_history_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "library_reading_history_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      login_secret: {
        Row: {
          id: number;
          secret_sha256: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          secret_sha256: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          secret_sha256?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      media_assets: {
        Row: {
          id: string;
          school_id: string;
          bucket: string;
          storage_path: string;
          file_name: string;
          mime_type: string;
          size_bytes: number;
          width: number | null;
          height: number | null;
          alt_text: string | null;
          usage: string;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          bucket: string;
          storage_path: string;
          file_name: string;
          mime_type: string;
          size_bytes: number;
          width?: number | null;
          height?: number | null;
          alt_text?: string | null;
          usage?: string;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          bucket?: string;
          storage_path?: string;
          file_name?: string;
          mime_type?: string;
          size_bytes?: number;
          width?: number | null;
          height?: number | null;
          alt_text?: string | null;
          usage?: string;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "media_assets_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "media_assets_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      message_attachments: {
        Row: {
          id: string;
          message_id: string;
          file_url: string;
          file_name: string;
          file_size: number;
          file_type: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          message_id: string;
          file_url: string;
          file_name: string;
          file_size: number;
          file_type: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          message_id?: string;
          file_url?: string;
          file_name?: string;
          file_size?: number;
          file_type?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_attachments_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
        ];
      };
      message_deletions: {
        Row: {
          user_id: string;
          message_id: string;
          deleted_at: string;
        };
        Insert: {
          user_id: string;
          message_id: string;
          deleted_at?: string;
        };
        Update: {
          user_id?: string;
          message_id?: string;
          deleted_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_deletions_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "message_deletions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      message_favorites: {
        Row: {
          id: string;
          user_id: string;
          message_id: string;
          school_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          message_id: string;
          school_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          message_id?: string;
          school_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_favorites_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "message_favorites_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "message_favorites_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      message_push_log: {
        Row: {
          message_id: string;
          pushed_at: string;
        };
        Insert: {
          message_id: string;
          pushed_at?: string;
        };
        Update: {
          message_id?: string;
          pushed_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_push_log_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: true;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
        ];
      };
      message_reactions: {
        Row: {
          message_id: string;
          user_id: string;
          conversation_id: string;
          school_id: string;
          emoji: string | null;
          updated_at: string;
        };
        Insert: {
          message_id: string;
          user_id: string;
          conversation_id: string;
          school_id: string;
          emoji?: string | null;
          updated_at?: string;
        };
        Update: {
          message_id?: string;
          user_id?: string;
          conversation_id?: string;
          school_id?: string;
          emoji?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_reactions_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "message_reactions_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "message_reactions_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      message_reports: {
        Row: {
          id: string;
          school_id: string;
          message_id: string;
          conversation_id: string;
          reporter_id: string | null;
          reason: string;
          details: string | null;
          status: string;
          resolution_note: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          message_id: string;
          conversation_id: string;
          reporter_id?: string | null;
          reason: string;
          details?: string | null;
          status?: string;
          resolution_note?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          message_id?: string;
          conversation_id?: string;
          reporter_id?: string | null;
          reason?: string;
          details?: string | null;
          status?: string;
          resolution_note?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_reports_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "message_reports_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "message_reports_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "message_reports_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "message_reports_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string | null;
          school_id: string;
          content: string;
          type: string;
          reply_to_id: string | null;
          is_pinned: boolean;
          is_edited: boolean;
          edited_at: string | null;
          is_deleted: boolean;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
          deleted_by: string | null;
          location_lat: number | null;
          location_lng: number | null;
          media_path: string | null;
          media_width: number | null;
          media_height: number | null;
          media_name: string | null;
          media_size: number | null;
          media_mime: string | null;
          media_duration: number | null;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          sender_id?: string | null;
          school_id: string;
          content?: string;
          type?: string;
          reply_to_id?: string | null;
          is_pinned?: boolean;
          is_edited?: boolean;
          edited_at?: string | null;
          is_deleted?: boolean;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_by?: string | null;
          location_lat?: number | null;
          location_lng?: number | null;
          media_path?: string | null;
          media_width?: number | null;
          media_height?: number | null;
          media_name?: string | null;
          media_size?: number | null;
          media_mime?: string | null;
          media_duration?: number | null;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          sender_id?: string | null;
          school_id?: string;
          content?: string;
          type?: string;
          reply_to_id?: string | null;
          is_pinned?: boolean;
          is_edited?: boolean;
          edited_at?: string | null;
          is_deleted?: boolean;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_by?: string | null;
          location_lat?: number | null;
          location_lng?: number | null;
          media_path?: string | null;
          media_width?: number | null;
          media_height?: number | null;
          media_name?: string | null;
          media_size?: number | null;
          media_mime?: string | null;
          media_duration?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_deleted_by_fkey";
            columns: ["deleted_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_reply_to_id_fkey";
            columns: ["reply_to_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      module_role_access: {
        Row: {
          school_id: string;
          module_id: string;
          role_id: string;
          is_visible: boolean;
        };
        Insert: {
          school_id: string;
          module_id: string;
          role_id: string;
          is_visible?: boolean;
        };
        Update: {
          school_id?: string;
          module_id?: string;
          role_id?: string;
          is_visible?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "module_role_access_module_id_fkey";
            columns: ["module_id"];
            isOneToOne: false;
            referencedRelation: "modules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "module_role_access_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "module_role_access_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      modules: {
        Row: {
          id: string;
          slug: string;
          name_tg: string;
          name_ru: string | null;
          description_tg: string | null;
          description_ru: string | null;
          icon: string | null;
          route: string | null;
          is_system: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
          name_en: string | null;
          category: string;
          required_permission: string | null;
          is_core: boolean;
        };
        Insert: {
          id?: string;
          slug: string;
          name_tg: string;
          name_ru?: string | null;
          description_tg?: string | null;
          description_ru?: string | null;
          icon?: string | null;
          route?: string | null;
          is_system?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
          name_en?: string | null;
          category?: string;
          required_permission?: string | null;
          is_core?: boolean;
        };
        Update: {
          id?: string;
          slug?: string;
          name_tg?: string;
          name_ru?: string | null;
          description_tg?: string | null;
          description_ru?: string | null;
          icon?: string | null;
          route?: string | null;
          is_system?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
          name_en?: string | null;
          category?: string;
          required_permission?: string | null;
          is_core?: boolean;
        };
        Relationships: [
        ];
      };
      news_article_categories: {
        Row: {
          article_id: string;
          category_id: string;
        };
        Insert: {
          article_id: string;
          category_id: string;
        };
        Update: {
          article_id?: string;
          category_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "news_article_categories_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "news_articles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "news_article_categories_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "news_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      news_articles: {
        Row: {
          id: string;
          school_id: string;
          title: string;
          content: string;
          cover_image_url: string | null;
          author_id: string | null;
          status: string;
          rejection_reason: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          published_at: string | null;
          published_by: string | null;
          is_pinned: boolean;
          view_count: number;
          created_at: string;
          updated_at: string;
          slug: string;
          summary: string | null;
          category_id: string | null;
          tags: string[];
          language: string;
          seo_title: string | null;
          seo_description: string | null;
          publish_at: string | null;
          expires_at: string | null;
          visibility: string;
          is_featured: boolean;
          gallery: Json;
          archived_at: string | null;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          school_id: string;
          title: string;
          content?: string;
          cover_image_url?: string | null;
          author_id?: string | null;
          status?: string;
          rejection_reason?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          published_at?: string | null;
          published_by?: string | null;
          is_pinned?: boolean;
          view_count?: number;
          created_at?: string;
          updated_at?: string;
          slug: string;
          summary?: string | null;
          category_id?: string | null;
          tags?: string[];
          language?: string;
          seo_title?: string | null;
          seo_description?: string | null;
          publish_at?: string | null;
          expires_at?: string | null;
          visibility?: string;
          is_featured?: boolean;
          gallery?: Json;
          archived_at?: string | null;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          school_id?: string;
          title?: string;
          content?: string;
          cover_image_url?: string | null;
          author_id?: string | null;
          status?: string;
          rejection_reason?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          published_at?: string | null;
          published_by?: string | null;
          is_pinned?: boolean;
          view_count?: number;
          created_at?: string;
          updated_at?: string;
          slug?: string;
          summary?: string | null;
          category_id?: string | null;
          tags?: string[];
          language?: string;
          seo_title?: string | null;
          seo_description?: string | null;
          publish_at?: string | null;
          expires_at?: string | null;
          visibility?: string;
          is_featured?: boolean;
          gallery?: Json;
          archived_at?: string | null;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "news_articles_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "news_articles_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "news_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "news_articles_published_by_fkey";
            columns: ["published_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "news_articles_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "news_articles_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "news_articles_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      news_categories: {
        Row: {
          id: string;
          school_id: string;
          name_tg: string;
          name_ru: string | null;
          name_en: string | null;
          slug: string;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          name_tg: string;
          name_ru?: string | null;
          name_en?: string | null;
          slug: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          name_tg?: string;
          name_ru?: string | null;
          name_en?: string | null;
          slug?: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "news_categories_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      news_comments: {
        Row: {
          id: string;
          school_id: string;
          article_id: string;
          author_id: string;
          body: string;
          is_hidden: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          article_id: string;
          author_id: string;
          body: string;
          is_hidden?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          article_id?: string;
          author_id?: string;
          body?: string;
          is_hidden?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "news_comments_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "news_articles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "news_comments_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "news_comments_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      news_likes: {
        Row: {
          article_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          article_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          article_id?: string;
          user_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "news_likes_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "news_articles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "news_likes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      news_views: {
        Row: {
          article_id: string;
          user_id: string;
          first_seen_at: string;
        };
        Insert: {
          article_id: string;
          user_id: string;
          first_seen_at?: string;
        };
        Update: {
          article_id?: string;
          user_id?: string;
          first_seen_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "news_views_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "news_articles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "news_views_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_broadcasts: {
        Row: {
          id: string;
          school_id: string;
          title: string;
          body: string | null;
          link_url: string | null;
          audience_type: string;
          audience_roles: string[];
          audience_class_ids: string[];
          audience_user_ids: string[];
          scheduled_at: string | null;
          status: string;
          sent_count: number;
          sent_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          title: string;
          body?: string | null;
          link_url?: string | null;
          audience_type?: string;
          audience_roles?: string[];
          audience_class_ids?: string[];
          audience_user_ids?: string[];
          scheduled_at?: string | null;
          status?: string;
          sent_count?: number;
          sent_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          title?: string;
          body?: string | null;
          link_url?: string | null;
          audience_type?: string;
          audience_roles?: string[];
          audience_class_ids?: string[];
          audience_user_ids?: string[];
          scheduled_at?: string | null;
          status?: string;
          sent_count?: number;
          sent_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_broadcasts_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_broadcasts_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_settings: {
        Row: {
          id: string;
          school_id: string;
          type: string;
          is_enabled: boolean;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          school_id: string;
          type: string;
          is_enabled?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          school_id?: string;
          type?: string;
          is_enabled?: boolean;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "notification_settings_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notification_settings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          school_id: string;
          type: string;
          module: string;
          title: string | null;
          body: string | null;
          data: Json | null;
          is_read: boolean;
          read_at: string | null;
          created_at: string;
          template_key: string | null;
          params: Json;
          link_url: string | null;
          actor_id: string | null;
          group_key: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          school_id: string;
          type: string;
          module: string;
          title?: string | null;
          body?: string | null;
          data?: Json | null;
          is_read?: boolean;
          read_at?: string | null;
          created_at?: string;
          template_key?: string | null;
          params?: Json;
          link_url?: string | null;
          actor_id?: string | null;
          group_key?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          school_id?: string;
          type?: string;
          module?: string;
          title?: string | null;
          body?: string | null;
          data?: Json | null;
          is_read?: boolean;
          read_at?: string | null;
          created_at?: string;
          template_key?: string | null;
          params?: Json;
          link_url?: string | null;
          actor_id?: string | null;
          group_key?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      pages: {
        Row: {
          id: string;
          school_id: string;
          slug: string;
          title_tg: string;
          title_ru: string | null;
          is_published: boolean;
          unpublished_at: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
          title_en: string | null;
        };
        Insert: {
          id?: string;
          school_id: string;
          slug: string;
          title_tg: string;
          title_ru?: string | null;
          is_published?: boolean;
          unpublished_at?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
          title_en?: string | null;
        };
        Update: {
          id?: string;
          school_id?: string;
          slug?: string;
          title_tg?: string;
          title_ru?: string | null;
          is_published?: boolean;
          unpublished_at?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
          title_en?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "pages_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      parent_codes: {
        Row: {
          student_id: string;
          school_id: string;
          code_hash: string;
          issued_at: string;
          issued_by: string | null;
        };
        Insert: {
          student_id: string;
          school_id: string;
          code_hash: string;
          issued_at?: string;
          issued_by?: string | null;
        };
        Update: {
          student_id?: string;
          school_id?: string;
          code_hash?: string;
          issued_at?: string;
          issued_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "parent_codes_issued_by_fkey";
            columns: ["issued_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "parent_codes_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "parent_codes_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: true;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      permissions: {
        Row: {
          id: string;
          slug: string;
          module: string;
          action: string;
          name_tg: string;
          name_ru: string | null;
          description: string | null;
          created_at: string;
          name_en: string | null;
          is_platform: boolean;
        };
        Insert: {
          id?: string;
          slug: string;
          module: string;
          action: string;
          name_tg: string;
          name_ru?: string | null;
          description?: string | null;
          created_at?: string;
          name_en?: string | null;
          is_platform?: boolean;
        };
        Update: {
          id?: string;
          slug?: string;
          module?: string;
          action?: string;
          name_tg?: string;
          name_ru?: string | null;
          description?: string | null;
          created_at?: string;
          name_en?: string | null;
          is_platform?: boolean;
        };
        Relationships: [
        ];
      };
      platform_identity: {
        Row: {
          id: boolean;
          platform_name_tg: string | null;
          platform_name_ru: string | null;
          platform_name_en: string | null;
          authority_name_tg: string | null;
          authority_name_ru: string | null;
          authority_name_en: string | null;
          emblem_url: string | null;
          footer_attribution_tg: string | null;
          footer_attribution_ru: string | null;
          footer_attribution_en: string | null;
          copyright_tg: string | null;
          copyright_ru: string | null;
          copyright_en: string | null;
          support_email: string | null;
          support_phone: string | null;
          is_approved: boolean;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          platform_name_tg?: string | null;
          platform_name_ru?: string | null;
          platform_name_en?: string | null;
          authority_name_tg?: string | null;
          authority_name_ru?: string | null;
          authority_name_en?: string | null;
          emblem_url?: string | null;
          footer_attribution_tg?: string | null;
          footer_attribution_ru?: string | null;
          footer_attribution_en?: string | null;
          copyright_tg?: string | null;
          copyright_ru?: string | null;
          copyright_en?: string | null;
          support_email?: string | null;
          support_phone?: string | null;
          is_approved?: boolean;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: boolean;
          platform_name_tg?: string | null;
          platform_name_ru?: string | null;
          platform_name_en?: string | null;
          authority_name_tg?: string | null;
          authority_name_ru?: string | null;
          authority_name_en?: string | null;
          emblem_url?: string | null;
          footer_attribution_tg?: string | null;
          footer_attribution_ru?: string | null;
          footer_attribution_en?: string | null;
          copyright_tg?: string | null;
          copyright_ru?: string | null;
          copyright_en?: string | null;
          support_email?: string | null;
          support_phone?: string | null;
          is_approved?: boolean;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "platform_identity_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          school_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          locale: string;
          created_at: string;
          last_seen_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          school_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          locale?: string;
          created_at?: string;
          last_seen_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          school_id?: string;
          endpoint?: string;
          p256dh?: string;
          auth?: string;
          locale?: string;
          created_at?: string;
          last_seen_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      regions: {
        Row: {
          id: string;
          code: string;
          name_tg: string;
          name_ru: string | null;
          name_en: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name_tg: string;
          name_ru?: string | null;
          name_en?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name_tg?: string;
          name_ru?: string | null;
          name_en?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      registration_requests: {
        Row: {
          id: string;
          school_id: string;
          auth_user_id: string | null;
          email: string;
          first_name: string;
          last_name: string;
          middle_name: string | null;
          avatar_url: string | null;
          requested_role_id: string;
          requested_class_id: string | null;
          enrollment_year: number | null;
          additional_data: Json | null;
          status: string;
          rejection_reason: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
          invitation_code_id: string | null;
        };
        Insert: {
          id?: string;
          school_id: string;
          auth_user_id?: string | null;
          email: string;
          first_name: string;
          last_name: string;
          middle_name?: string | null;
          avatar_url?: string | null;
          requested_role_id: string;
          requested_class_id?: string | null;
          enrollment_year?: number | null;
          additional_data?: Json | null;
          status?: string;
          rejection_reason?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
          invitation_code_id?: string | null;
        };
        Update: {
          id?: string;
          school_id?: string;
          auth_user_id?: string | null;
          email?: string;
          first_name?: string;
          last_name?: string;
          middle_name?: string | null;
          avatar_url?: string | null;
          requested_role_id?: string;
          requested_class_id?: string | null;
          enrollment_year?: number | null;
          additional_data?: Json | null;
          status?: string;
          rejection_reason?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
          invitation_code_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "registration_requests_invitation_code_id_fkey";
            columns: ["invitation_code_id"];
            isOneToOne: false;
            referencedRelation: "invitation_codes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "registration_requests_requested_class_id_fkey";
            columns: ["requested_class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "registration_requests_requested_role_id_fkey";
            columns: ["requested_role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "registration_requests_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "registration_requests_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      role_permissions: {
        Row: {
          role_id: string;
          permission_id: string;
        };
        Insert: {
          role_id: string;
          permission_id: string;
        };
        Update: {
          role_id?: string;
          permission_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey";
            columns: ["permission_id"];
            isOneToOne: false;
            referencedRelation: "permissions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
        ];
      };
      roles: {
        Row: {
          id: string;
          school_id: string;
          slug: string;
          name_tg: string;
          name_ru: string | null;
          level: number;
          is_system: boolean;
          is_active: boolean;
          deactivated_at: string | null;
          created_at: string;
          updated_at: string;
          name_en: string | null;
          description: string | null;
        };
        Insert: {
          id?: string;
          school_id: string;
          slug: string;
          name_tg: string;
          name_ru?: string | null;
          level: number;
          is_system?: boolean;
          is_active?: boolean;
          deactivated_at?: string | null;
          created_at?: string;
          updated_at?: string;
          name_en?: string | null;
          description?: string | null;
        };
        Update: {
          id?: string;
          school_id?: string;
          slug?: string;
          name_tg?: string;
          name_ru?: string | null;
          level?: number;
          is_system?: boolean;
          is_active?: boolean;
          deactivated_at?: string | null;
          created_at?: string;
          updated_at?: string;
          name_en?: string | null;
          description?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "roles_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      rooms: {
        Row: {
          id: string;
          school_id: string;
          name: string;
          code: string | null;
          room_type: string;
          capacity: number | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          name: string;
          code?: string | null;
          room_type?: string;
          capacity?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          name?: string;
          code?: string | null;
          room_type?: string;
          capacity?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rooms_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      school_domains: {
        Row: {
          host: string;
          school_id: string;
          created_at: string;
        };
        Insert: {
          host: string;
          school_id: string;
          created_at?: string;
        };
        Update: {
          host?: string;
          school_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "school_domains_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      school_modules: {
        Row: {
          school_id: string;
          module_id: string;
          is_enabled: boolean;
          enabled_at: string | null;
          disabled_at: string | null;
          updated_by: string | null;
        };
        Insert: {
          school_id: string;
          module_id: string;
          is_enabled?: boolean;
          enabled_at?: string | null;
          disabled_at?: string | null;
          updated_by?: string | null;
        };
        Update: {
          school_id?: string;
          module_id?: string;
          is_enabled?: boolean;
          enabled_at?: string | null;
          disabled_at?: string | null;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "school_modules_module_id_fkey";
            columns: ["module_id"];
            isOneToOne: false;
            referencedRelation: "modules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "school_modules_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "school_modules_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      schools: {
        Row: {
          id: string;
          short_name: string;
          full_name: string;
          slug: string;
          logo_url: string | null;
          description_tg: string | null;
          description_ru: string | null;
          address: string | null;
          phone: string | null;
          email: string | null;
          website: string | null;
          id_prefix: string;
          id_sequence: number;
          is_active: boolean;
          deactivated_at: string | null;
          created_at: string;
          updated_at: string;
          description_en: string | null;
          official_name_tg: string | null;
          official_name_ru: string | null;
          official_name_en: string | null;
          code: string | null;
          region_id: string | null;
          district_id: string | null;
          director_name: string | null;
          deputy_directors: Json;
          working_hours_tg: string | null;
          working_hours_ru: string | null;
          working_hours_en: string | null;
          social_links: Json;
          photo_url: string | null;
          status: string;
          timezone: string;
          default_locale: string;
          settings: Json;
          admin_email: string | null;
          admin_claimed_at: string | null;
        };
        Insert: {
          id?: string;
          short_name: string;
          full_name: string;
          slug: string;
          logo_url?: string | null;
          description_tg?: string | null;
          description_ru?: string | null;
          address?: string | null;
          phone?: string | null;
          email?: string | null;
          website?: string | null;
          id_prefix?: string;
          id_sequence?: number;
          is_active?: boolean;
          deactivated_at?: string | null;
          created_at?: string;
          updated_at?: string;
          description_en?: string | null;
          official_name_tg?: string | null;
          official_name_ru?: string | null;
          official_name_en?: string | null;
          code?: string | null;
          region_id?: string | null;
          district_id?: string | null;
          director_name?: string | null;
          deputy_directors?: Json;
          working_hours_tg?: string | null;
          working_hours_ru?: string | null;
          working_hours_en?: string | null;
          social_links?: Json;
          photo_url?: string | null;
          status?: string;
          timezone?: string;
          default_locale?: string;
          settings?: Json;
          admin_email?: string | null;
          admin_claimed_at?: string | null;
        };
        Update: {
          id?: string;
          short_name?: string;
          full_name?: string;
          slug?: string;
          logo_url?: string | null;
          description_tg?: string | null;
          description_ru?: string | null;
          address?: string | null;
          phone?: string | null;
          email?: string | null;
          website?: string | null;
          id_prefix?: string;
          id_sequence?: number;
          is_active?: boolean;
          deactivated_at?: string | null;
          created_at?: string;
          updated_at?: string;
          description_en?: string | null;
          official_name_tg?: string | null;
          official_name_ru?: string | null;
          official_name_en?: string | null;
          code?: string | null;
          region_id?: string | null;
          district_id?: string | null;
          director_name?: string | null;
          deputy_directors?: Json;
          working_hours_tg?: string | null;
          working_hours_ru?: string | null;
          working_hours_en?: string | null;
          social_links?: Json;
          photo_url?: string | null;
          status?: string;
          timezone?: string;
          default_locale?: string;
          settings?: Json;
          admin_email?: string | null;
          admin_claimed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "schools_district_id_fkey";
            columns: ["district_id"];
            isOneToOne: false;
            referencedRelation: "districts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "schools_region_id_fkey";
            columns: ["region_id"];
            isOneToOne: false;
            referencedRelation: "regions";
            referencedColumns: ["id"];
          },
        ];
      };
      site_sections: {
        Row: {
          id: string;
          school_id: string;
          section_key: string;
          is_enabled: boolean;
          sort_order: number;
          content: Json;
          is_approved: boolean;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          section_key: string;
          is_enabled?: boolean;
          sort_order?: number;
          content?: Json;
          is_approved?: boolean;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          section_key?: string;
          is_enabled?: boolean;
          sort_order?: number;
          content?: Json;
          is_approved?: boolean;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "site_sections_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "site_sections_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      staff: {
        Row: {
          id: string;
          school_id: string;
          user_id: string | null;
          employee_number: string | null;
          first_name: string;
          last_name: string;
          middle_name: string | null;
          gender: string | null;
          date_of_birth: string | null;
          staff_type: string;
          position: string | null;
          qualification: string | null;
          hire_date: string | null;
          phone: string | null;
          email: string | null;
          max_weekly_hours: number | null;
          status: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          user_id?: string | null;
          employee_number?: string | null;
          first_name: string;
          last_name: string;
          middle_name?: string | null;
          gender?: string | null;
          date_of_birth?: string | null;
          staff_type?: string;
          position?: string | null;
          qualification?: string | null;
          hire_date?: string | null;
          phone?: string | null;
          email?: string | null;
          max_weekly_hours?: number | null;
          status?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          user_id?: string | null;
          employee_number?: string | null;
          first_name?: string;
          last_name?: string;
          middle_name?: string | null;
          gender?: string | null;
          date_of_birth?: string | null;
          staff_type?: string;
          position?: string | null;
          qualification?: string | null;
          hire_date?: string | null;
          phone?: string | null;
          email?: string | null;
          max_weekly_hours?: number | null;
          status?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      student_enrollments: {
        Row: {
          id: string;
          school_id: string;
          student_id: string;
          class_id: string;
          academic_year_id: string;
          enrolled_at: string;
          enrolled_by: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          student_id: string;
          class_id: string;
          academic_year_id: string;
          enrolled_at?: string;
          enrolled_by?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          student_id?: string;
          class_id?: string;
          academic_year_id?: string;
          enrolled_at?: string;
          enrolled_by?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_enrollments_academic_year_id_fkey";
            columns: ["academic_year_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_enrollments_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_enrollments_enrolled_by_fkey";
            columns: ["enrolled_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_enrollments_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_enrollments_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      student_guardians: {
        Row: {
          student_id: string;
          guardian_id: string;
          school_id: string;
          relationship: string;
          is_primary: boolean;
          created_at: string;
        };
        Insert: {
          student_id: string;
          guardian_id: string;
          school_id: string;
          relationship?: string;
          is_primary?: boolean;
          created_at?: string;
        };
        Update: {
          student_id?: string;
          guardian_id?: string;
          school_id?: string;
          relationship?: string;
          is_primary?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_guardians_guardian_id_fkey";
            columns: ["guardian_id"];
            isOneToOne: false;
            referencedRelation: "guardians";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_guardians_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_guardians_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      students: {
        Row: {
          id: string;
          school_id: string;
          user_id: string | null;
          student_number: string | null;
          first_name: string;
          last_name: string;
          middle_name: string | null;
          gender: string | null;
          date_of_birth: string | null;
          admission_date: string | null;
          status: string;
          status_changed_at: string | null;
          address: string | null;
          phone: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          user_id?: string | null;
          student_number?: string | null;
          first_name: string;
          last_name: string;
          middle_name?: string | null;
          gender?: string | null;
          date_of_birth?: string | null;
          admission_date?: string | null;
          status?: string;
          status_changed_at?: string | null;
          address?: string | null;
          phone?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          user_id?: string | null;
          student_number?: string | null;
          first_name?: string;
          last_name?: string;
          middle_name?: string | null;
          gender?: string | null;
          date_of_birth?: string | null;
          admission_date?: string | null;
          status?: string;
          status_changed_at?: string | null;
          address?: string | null;
          phone?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "students_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "students_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "students_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      subjects: {
        Row: {
          id: string;
          school_id: string;
          name_tg: string;
          name_ru: string | null;
          code: string | null;
          is_active: boolean;
          deactivated_at: string | null;
          created_at: string;
          updated_at: string;
          name_en: string | null;
          description: string | null;
          default_weekly_hours: number | null;
        };
        Insert: {
          id?: string;
          school_id: string;
          name_tg: string;
          name_ru?: string | null;
          code?: string | null;
          is_active?: boolean;
          deactivated_at?: string | null;
          created_at?: string;
          updated_at?: string;
          name_en?: string | null;
          description?: string | null;
          default_weekly_hours?: number | null;
        };
        Update: {
          id?: string;
          school_id?: string;
          name_tg?: string;
          name_ru?: string | null;
          code?: string | null;
          is_active?: boolean;
          deactivated_at?: string | null;
          created_at?: string;
          updated_at?: string;
          name_en?: string | null;
          description?: string | null;
          default_weekly_hours?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "subjects_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      substitutions: {
        Row: {
          id: string;
          school_id: string;
          timetable_entry_id: string;
          substitution_date: string;
          substitute_teacher_id: string | null;
          room_id: string | null;
          status: string;
          reason: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          timetable_entry_id: string;
          substitution_date: string;
          substitute_teacher_id?: string | null;
          room_id?: string | null;
          status?: string;
          reason?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          timetable_entry_id?: string;
          substitution_date?: string;
          substitute_teacher_id?: string | null;
          room_id?: string | null;
          status?: string;
          reason?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "substitutions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "substitutions_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "substitutions_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "substitutions_substitute_teacher_id_fkey";
            columns: ["substitute_teacher_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "substitutions_timetable_entry_id_fkey";
            columns: ["timetable_entry_id"];
            isOneToOne: false;
            referencedRelation: "timetable_entries";
            referencedColumns: ["id"];
          },
        ];
      };
      support_requests: {
        Row: {
          id: string;
          school_id: string;
          name: string;
          contact: string;
          message: string;
          status: string;
          handled_by: string | null;
          handled_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          name: string;
          contact: string;
          message: string;
          status?: string;
          handled_by?: string | null;
          handled_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          name?: string;
          contact?: string;
          message?: string;
          status?: string;
          handled_by?: string | null;
          handled_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "support_requests_handled_by_fkey";
            columns: ["handled_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "support_requests_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      teacher_subjects: {
        Row: {
          id: string;
          teacher_id: string;
          subject_id: string;
          class_id: string;
          school_id: string;
          academic_year_id: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          subject_id: string;
          class_id: string;
          school_id: string;
          academic_year_id: string;
        };
        Update: {
          id?: string;
          teacher_id?: string;
          subject_id?: string;
          class_id?: string;
          school_id?: string;
          academic_year_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "teacher_subjects_academic_year_id_fkey";
            columns: ["academic_year_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teacher_subjects_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teacher_subjects_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teacher_subjects_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "teacher_subjects_teacher_id_fkey";
            columns: ["teacher_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      telegram_chats: {
        Row: {
          chat_id: number;
          school_id: string | null;
          locale: string;
          state: string;
          pending_student: string | null;
          attempts: number;
          blocked_until: string | null;
          subscribed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          chat_id: number;
          school_id?: string | null;
          locale?: string;
          state?: string;
          pending_student?: string | null;
          attempts?: number;
          blocked_until?: string | null;
          subscribed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          chat_id?: number;
          school_id?: string | null;
          locale?: string;
          state?: string;
          pending_student?: string | null;
          attempts?: number;
          blocked_until?: string | null;
          subscribed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "telegram_chats_pending_student_fkey";
            columns: ["pending_student"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "telegram_chats_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      telegram_children: {
        Row: {
          chat_id: number;
          student_id: string;
          school_id: string;
          linked_at: string;
        };
        Insert: {
          chat_id: number;
          student_id: string;
          school_id: string;
          linked_at?: string;
        };
        Update: {
          chat_id?: number;
          student_id?: string;
          school_id?: string;
          linked_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "telegram_children_chat_id_fkey";
            columns: ["chat_id"];
            isOneToOne: false;
            referencedRelation: "telegram_chats";
            referencedColumns: ["chat_id"];
          },
          {
            foreignKeyName: "telegram_children_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "telegram_children_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      telegram_outbox: {
        Row: {
          id: string;
          chat_id: number;
          school_id: string;
          student_id: string | null;
          kind: string;
          payload: Json;
          dedupe_key: string;
          send_after: string;
          sent_at: string | null;
          attempts: number;
          last_error: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          chat_id: number;
          school_id: string;
          student_id?: string | null;
          kind: string;
          payload?: Json;
          dedupe_key: string;
          send_after?: string;
          sent_at?: string | null;
          attempts?: number;
          last_error?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          chat_id?: number;
          school_id?: string;
          student_id?: string | null;
          kind?: string;
          payload?: Json;
          dedupe_key?: string;
          send_after?: string;
          sent_at?: string | null;
          attempts?: number;
          last_error?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "telegram_outbox_chat_id_fkey";
            columns: ["chat_id"];
            isOneToOne: false;
            referencedRelation: "telegram_chats";
            referencedColumns: ["chat_id"];
          },
          {
            foreignKeyName: "telegram_outbox_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "telegram_outbox_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      timetable_entries: {
        Row: {
          id: string;
          school_id: string;
          academic_year_id: string;
          class_id: string;
          class_subject_id: string;
          teacher_id: string | null;
          room_id: string | null;
          day_of_week: number;
          shift: number;
          period_number: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          group_label: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          academic_year_id: string;
          class_id: string;
          class_subject_id: string;
          teacher_id?: string | null;
          room_id?: string | null;
          day_of_week: number;
          shift?: number;
          period_number: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          group_label?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          academic_year_id?: string;
          class_id?: string;
          class_subject_id?: string;
          teacher_id?: string | null;
          room_id?: string | null;
          day_of_week?: number;
          shift?: number;
          period_number?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          group_label?: string;
        };
        Relationships: [
          {
            foreignKeyName: "timetable_entries_academic_year_id_fkey";
            columns: ["academic_year_id"];
            isOneToOne: false;
            referencedRelation: "academic_years";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "timetable_entries_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "timetable_entries_class_subject_id_fkey";
            columns: ["class_subject_id"];
            isOneToOne: false;
            referencedRelation: "class_subjects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "timetable_entries_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "timetable_entries_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "timetable_entries_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "timetable_entries_teacher_id_fkey";
            columns: ["teacher_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["id"];
          },
        ];
      };
      user_blocks: {
        Row: {
          blocker_id: string;
          blocked_id: string;
          school_id: string;
          created_at: string;
        };
        Insert: {
          blocker_id: string;
          blocked_id: string;
          school_id: string;
          created_at?: string;
        };
        Update: {
          blocker_id?: string;
          blocked_id?: string;
          school_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_blocks_blocked_id_fkey";
            columns: ["blocked_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_blocks_blocker_id_fkey";
            columns: ["blocker_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_blocks_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          id: string;
          user_id: string;
          role_id: string;
          school_id: string;
          assigned_at: string;
          assigned_by: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          role_id: string;
          school_id: string;
          assigned_at?: string;
          assigned_by?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          role_id?: string;
          school_id?: string;
          assigned_at?: string;
          assigned_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "user_roles_assigned_by_fkey";
            columns: ["assigned_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_roles_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "roles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_roles_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_roles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      user_settings: {
        Row: {
          id: string;
          user_id: string;
          school_id: string;
          locale: string;
          notifications_enabled: boolean;
          notification_types: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          school_id: string;
          locale?: string;
          notifications_enabled?: boolean;
          notification_types?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          school_id?: string;
          locale?: string;
          notifications_enabled?: boolean;
          notification_types?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_settings_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_settings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      user_status_history: {
        Row: {
          id: string;
          school_id: string;
          user_id: string;
          action: string;
          old_value: string | null;
          new_value: string | null;
          performed_by: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          school_id: string;
          user_id: string;
          action: string;
          old_value?: string | null;
          new_value?: string | null;
          performed_by?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          school_id?: string;
          user_id?: string;
          action?: string;
          old_value?: string | null;
          new_value?: string | null;
          performed_by?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_status_history_performed_by_fkey";
            columns: ["performed_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_status_history_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_status_history_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      users: {
        Row: {
          id: string;
          school_id: string;
          public_id: string;
          email: string;
          first_name: string;
          last_name: string;
          middle_name: string | null;
          avatar_url: string | null;
          phone: string | null;
          date_of_birth: string | null;
          gender: string | null;
          is_active: boolean;
          deactivated_at: string | null;
          last_login_at: string | null;
          created_at: string;
          updated_at: string;
          is_super_admin: boolean;
          status: string;
          graduation_year: number | null;
          graduation_date: string | null;
          years_in_school: number | null;
          nickname: string | null;
          credentials_issued_at: string | null;
        };
        Insert: {
          id: string;
          school_id: string;
          public_id: string;
          email: string;
          first_name: string;
          last_name: string;
          middle_name?: string | null;
          avatar_url?: string | null;
          phone?: string | null;
          date_of_birth?: string | null;
          gender?: string | null;
          is_active?: boolean;
          deactivated_at?: string | null;
          last_login_at?: string | null;
          created_at?: string;
          updated_at?: string;
          is_super_admin?: boolean;
          status?: string;
          graduation_year?: number | null;
          graduation_date?: string | null;
          years_in_school?: number | null;
          nickname?: string | null;
          credentials_issued_at?: string | null;
        };
        Update: {
          id?: string;
          school_id?: string;
          public_id?: string;
          email?: string;
          first_name?: string;
          last_name?: string;
          middle_name?: string | null;
          avatar_url?: string | null;
          phone?: string | null;
          date_of_birth?: string | null;
          gender?: string | null;
          is_active?: boolean;
          deactivated_at?: string | null;
          last_login_at?: string | null;
          created_at?: string;
          updated_at?: string;
          is_super_admin?: boolean;
          status?: string;
          graduation_year?: number | null;
          graduation_date?: string | null;
          years_in_school?: number | null;
          nickname?: string | null;
          credentials_issued_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "users_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      account_credentials_recipients: { Args: { p_logins: string[] }; Returns: Json };
      account_details: { Args: { p_user_id: string }; Returns: Json };
      account_directory: { Args: { p_category?: string; p_query?: string; p_class_id?: string; p_limit?: number; p_offset?: number }; Returns: Json };
      add_conversation_members: { Args: { p_conversation_id: string; p_member_ids: string[] }; Returns: number };
      add_news_comment: { Args: { p_article: string; p_body: string }; Returns: string };
      admin_dashboard: { Args: { p_school_id?: string }; Returns: Json };
      admin_get_user: { Args: { p_user_id: string }; Returns: Json };
      admin_search_users: { Args: { p_query?: string; p_role?: string; p_status?: string; p_sort?: string; p_limit?: number; p_offset?: number; p_school_id?: string }; Returns: { id: string | null; public_id: string | null; email: string | null; first_name: string | null; last_name: string | null; middle_name: string | null; phone: string | null; avatar_url: string | null; status: string | null; is_active: boolean | null; created_at: string | null; last_login_at: string | null; roles: Json | null; total_count: number | null }[] };
      admin_set_role_permissions: { Args: { p_role_id: string; p_permission_slugs: string[] }; Returns: undefined };
      admin_set_user_roles: { Args: { p_user_id: string; p_role_ids: string[] }; Returns: undefined };
      admin_set_user_status: { Args: { p_user_id: string; p_status: string; p_reason?: string }; Returns: undefined };
      advance_academic_year: { Args: { p_name: string; p_start: string; p_end: string }; Returns: Json };
      analytics_overview: { Args: { p_school_id?: string }; Returns: Json };
      change_student_status: { Args: { p_student_ids: string[]; p_status: string; p_effective_date?: string; p_reason?: string }; Returns: number };
      class_timetable: { Args: { p_class_id: string }; Returns: { timetable_entry_id: string | null; day_of_week: number | null; shift: number | null; period_number: number | null; start_time: string | null; end_time: string | null; class_subject_id: string | null; subject_tg: string | null; subject_ru: string | null; subject_en: string | null; teacher_name: string | null; room_name: string | null }[] };
      confirm_account: { Args: { p_user_id: string }; Returns: undefined };
      create_direct_conversation: { Args: { p_target_user_id: string }; Returns: string };
      create_group_conversation: { Args: { p_name: string; p_member_ids: string[] }; Returns: string };
      create_school: { Args: { p_short_name: string; p_full_name: string; p_slug: string; p_id_prefix: string; p_admin_email?: string; p_photo_url?: string; p_logo_url?: string; p_address?: string; p_social_links?: Json; p_code?: string; p_region_id?: string; p_district_id?: string }; Returns: Json };
      current_user_has_permission: { Args: { p_permission_slug: string }; Returns: boolean };
      current_user_is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      current_user_school_id: { Args: Record<PropertyKey, never>; Returns: string };
      forget_my_device_token: { Args: { p_token: string }; Returns: undefined };
      get_conversation_messages: { Args: { p_conversation_id: string; p_before_created_at?: string; p_before_id?: string; p_limit?: number }; Returns: { id: string | null; conversation_id: string | null; sender_id: string | null; sender_first_name: string | null; sender_last_name: string | null; sender_avatar_url: string | null; content: string | null; type: string | null; reply_to_id: string | null; is_pinned: boolean | null; is_edited: boolean | null; is_deleted: boolean | null; is_favorite: boolean | null; created_at: string | null; edited_at: string | null; location_lat: number | null; location_lng: number | null; media_path: string | null; media_width: number | null; media_height: number | null; media_name: string | null; media_size: number | null; media_mime: string | null; media_duration: number | null; reactions: Json | null }[] };
      get_member_card: { Args: { p_user_id: string }; Returns: Json };
      get_my_access: { Args: Record<PropertyKey, never>; Returns: Json };
      get_my_profile: { Args: Record<PropertyKey, never>; Returns: Json };
      get_registration_options: { Args: { p_school_slug: string }; Returns: Json };
      get_unread_message_count: { Args: Record<PropertyKey, never>; Returns: number };
      get_user_school_id: { Args: { p_user_id: string }; Returns: string };
      grantable_roles: { Args: Record<PropertyKey, never>; Returns: { id: string | null; slug: string | null; name_tg: string | null; name_ru: string | null; name_en: string | null; level: number | null; permissions: number | null }[] };
      import_classes: { Args: { p_rows: Json; p_dry_run?: boolean }; Returns: Json };
      import_guardians: { Args: { p_rows: Json }; Returns: number };
      import_people: { Args: { p_kind: string; p_rows: Json; p_dry_run?: boolean; p_offset?: number; p_limit?: number }; Returns: Json };
      import_staff: { Args: { p_rows: Json; p_dry_run?: boolean }; Returns: Json };
      import_students: { Args: { p_rows: Json; p_dry_run?: boolean }; Returns: Json };
      import_subjects: { Args: { p_rows: Json; p_dry_run?: boolean }; Returns: Json };
      import_timetable: { Args: { p_rows: Json; p_dry_run?: boolean }; Returns: Json };
      issue_parent_codes: { Args: { p_class: string }; Returns: { student_id: string | null; class_name: string | null; full_name: string | null; nickname: string | null; login: string | null; code: string | null }[] };
      join_support_conversation: { Args: { p_conversation_id: string }; Returns: undefined };
      list_my_conversations: { Args: { p_limit?: number }; Returns: { id: string | null; type: string | null; name: string | null; avatar_url: string | null; updated_at: string | null; is_muted: boolean | null; last_message_content: string | null; last_message_sender_id: string | null; last_message_at: string | null; last_message_deleted: boolean | null; unread_count: number | null; members: Json | null; created_by: string | null; last_message_type: string | null }[] };
      list_news_comments: { Args: { p_article: string; p_limit?: number }; Returns: { id: string | null; body: string | null; created_at: string | null; author_id: string | null; author_name: string | null; author_nickname: string | null; author_avatar_url: string | null; author_role: Json | null; is_mine: boolean | null }[] };
      list_public_schools: { Args: Record<PropertyKey, never>; Returns: { id: string | null; slug: string | null; short_name: string | null; full_name: string | null; logo_url: string | null; photo_url: string | null; address: string | null; district_id: string | null; registration_open: boolean | null }[] };
      list_support_inbox: { Args: { p_limit?: number }; Returns: { id: string | null; requester_id: string | null; requester_name: string | null; requester_avatar: string | null; requester_public_id: string | null; requester_roles: Json | null; last_message_content: string | null; last_message_type: string | null; last_message_sender_id: string | null; last_message_at: string | null; awaiting_reply: boolean | null; unread_count: number | null }[] };
      login_lookup: { Args: { p_login: string; p_secret: string }; Returns: string };
      mark_conversation_read: { Args: { p_conversation_id: string }; Returns: undefined };
      mfa_required: { Args: Record<PropertyKey, never>; Returns: boolean };
      moderation_get_report: { Args: { p_report_id: string }; Returns: Json };
      moderation_resolve_report: { Args: { p_report_id: string; p_action: string; p_note?: string }; Returns: undefined };
      my_children: { Args: Record<PropertyKey, never>; Returns: { id: string | null; first_name: string | null; last_name: string | null; class_name: string | null; relationship: string | null }[] };
      my_teaching_timetable: { Args: Record<PropertyKey, never>; Returns: { timetable_entry_id: string | null; day_of_week: number | null; shift: number | null; period_number: number | null; start_time: string | null; end_time: string | null; class_id: string | null; class_name: string | null; class_subject_id: string | null; subject_tg: string | null; subject_ru: string | null; subject_en: string | null; room_name: string | null }[] };
      news_engagement: { Args: { p_ids: string[] }; Returns: { article_id: string | null; views: number | null; likes: number | null; comments: number | null; liked: boolean | null; author_name: string | null; author_role: Json | null }[] };
      open_support_conversation: { Args: Record<PropertyKey, never>; Returns: string };
      promote_students: { Args: { p_from_class_id: string; p_to_class_id: string; p_student_ids: string[] }; Returns: number };
      provision_person: { Args: { p_kind: string; p_row: Json; p_role_id?: string }; Returns: Json };
      record_library_view: { Args: { p_item_id: string }; Returns: undefined };
      record_news_view: { Args: { p_article_id: string }; Returns: undefined };
      remove_conversation_member: { Args: { p_conversation_id: string; p_user_id: string }; Returns: undefined };
      report_attendance: { Args: { p_from: string; p_to: string; p_class_id?: string; p_school_id?: string }; Returns: { student_id: string | null; student_name: string | null; class_name: string | null; present: number | null; late: number | null; absent: number | null; excused: number | null; total: number | null; attendance_rate: number | null }[] };
      report_content_activity: { Args: { p_from: string; p_to: string; p_school_id?: string }; Returns: { month: string | null; news_published: number | null; announcements_published: number | null; events_held: number | null; documents_published: number | null; books_published: number | null; registrations: number | null }[] };
      report_enrollment: { Args: { p_academic_year_id?: string; p_school_id?: string }; Returns: { class_id: string | null; class_name: string | null; grade_level: number | null; homeroom_teacher: string | null; capacity: number | null; active_count: number | null; male_count: number | null; female_count: number | null; transferred_count: number | null; completed_count: number | null }[] };
      report_grades: { Args: { p_class_id: string; p_term_id?: string; p_school_id?: string }; Returns: { student_id: string | null; student_name: string | null; subject_id: string | null; subject_name: string | null; grade_count: number | null; average_percent: number | null; final_score: number | null }[] };
      report_library: { Args: { p_school_id?: string }; Returns: Json };
      report_message: { Args: { p_message_id: string; p_reason: string; p_details?: string }; Returns: string };
      report_teacher_workload: { Args: { p_academic_year_id?: string; p_school_id?: string }; Returns: { staff_id: string | null; teacher_name: string | null; staff_type: string | null; planned_weekly_hours: number | null; scheduled_lessons_per_week: number | null; max_weekly_hours: number | null; classes: number | null; subjects: number | null }[] };
      reset_account_mfa: { Args: { p_user_id: string }; Returns: undefined };
      reset_account_password: { Args: { p_user_id: string }; Returns: Json };
      resolve_public_school: { Args: { p_host?: string; p_slug?: string }; Returns: string };
      resolve_support_request: { Args: { p_request_id: string; p_done: boolean }; Returns: undefined };
      review_registration: { Args: { p_request_id: string; p_approve: boolean; p_role_id?: string; p_class_id?: string; p_reason?: string }; Returns: undefined };
      role_permission_slugs: { Args: { p_role_id: string }; Returns: string[] };
      rule_journal_column: { Args: { p_class_subject_id: string; p_academic_term_id: string; p_kind: string; p_date?: string; p_assessment_type_id?: string; p_label?: string }; Returns: string };
      save_account: { Args: { p_user_id: string; p_data: Json }; Returns: Json };
      save_device_token: { Args: { p_token: string; p_platform: string; p_locale?: string }; Returns: undefined };
      save_journal_cells: { Args: { p_class_subject_id: string; p_academic_term_id: string; p_cells: Json }; Returns: Json };
      save_push_subscription: { Args: { p_endpoint: string; p_p256dh: string; p_auth: string; p_locale?: string }; Returns: undefined };
      scope_school_overview: { Args: Record<PropertyKey, never>; Returns: { school_id: string | null; short_name: string | null; district_id: string | null; status: string | null; students: number | null; staff: number | null; classes: number | null; attendance_rate_30d: number | null; pending_registrations: number | null }[] };
      search_message_contacts: { Args: { p_query: string; p_limit?: number }; Returns: { id: string | null; first_name: string | null; last_name: string | null; nickname: string | null; avatar_url: string | null; roles: Json | null }[] };
      send_notification_broadcast: { Args: { p_broadcast_id: string }; Returns: number };
      set_message_pinned: { Args: { p_message_id: string; p_pinned: boolean }; Returns: undefined };
      set_message_reaction: { Args: { p_message_id: string; p_emoji: string }; Returns: undefined };
      student_overview: { Args: { p_student_id?: string; p_date?: string }; Returns: Json };
      student_statistics: { Args: { p_student: string; p_from: string; p_to: string; p_bucket?: string }; Returns: Json };
      submit_support_request: { Args: { p_school_id: string; p_name: string; p_contact: string; p_message: string }; Returns: string };
      teacher_today: { Args: { p_date?: string }; Returns: Json };
      toggle_news_like: { Args: { p_article: string }; Returns: Json };
      transfer_student_class: { Args: { p_student_id: string; p_to_class_id: string; p_reason?: string }; Returns: string };
      update_conversation: { Args: { p_conversation_id: string; p_name: string }; Returns: undefined };
      update_school_identity: { Args: { p_school_id: string; p_photo_url?: string; p_logo_url?: string; p_social_links?: Json; p_admin_email?: string }; Returns: undefined };
      user_by_nickname: { Args: { p_nickname: string }; Returns: string };
      user_has_role_in_school: { Args: { p_user_id: string; p_school_id: string; p_role_slugs: string[] }; Returns: boolean };
      write_audit_log: { Args: { p_action: string; p_entity_type: string; p_entity_id?: string; p_old?: Json; p_new?: Json; p_metadata?: Json }; Returns: undefined };
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
export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
export type FunctionReturns<T extends keyof PublicSchema["Functions"]> = PublicSchema["Functions"][T]["Returns"];
