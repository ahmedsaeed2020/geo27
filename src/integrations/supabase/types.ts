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
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          thread_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          thread_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          created_at: string
          id: string
          locale: string
          title: string | null
          updated_at: string
          visitor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          locale?: string
          title?: string | null
          updated_at?: string
          visitor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          locale?: string
          title?: string | null
          updated_at?: string
          visitor_id?: string
        }
        Relationships: []
      }
      cms_audit: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
        }
        Relationships: []
      }
      cms_config: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      cms_config_revisions: {
        Row: {
          action: string
          author_id: string | null
          config_key: string
          created_at: string
          id: string
          snapshot: Json
        }
        Insert: {
          action: string
          author_id?: string | null
          config_key: string
          created_at?: string
          id?: string
          snapshot: Json
        }
        Update: {
          action?: string
          author_id?: string | null
          config_key?: string
          created_at?: string
          id?: string
          snapshot?: Json
        }
        Relationships: []
      }
      cms_documents: {
        Row: {
          draft: Json
          id: string
          kind: string
          path: string
          publish_at: string | null
          published: Json | null
          published_at: string | null
          scheduled: Json | null
          scheduled_by: string | null
          state: string
          unpublish_at: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          draft?: Json
          id?: string
          kind?: string
          path: string
          publish_at?: string | null
          published?: Json | null
          published_at?: string | null
          scheduled?: Json | null
          scheduled_by?: string | null
          state?: string
          unpublish_at?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          draft?: Json
          id?: string
          kind?: string
          path?: string
          publish_at?: string | null
          published?: Json | null
          published_at?: string | null
          scheduled?: Json | null
          scheduled_by?: string | null
          state?: string
          unpublish_at?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      cms_media: {
        Row: {
          alt_ar: string
          alt_en: string
          approval: string
          archived_at: string | null
          bytes: number | null
          created_at: string
          created_by: string | null
          focal_x: number
          focal_y: number
          height: number | null
          id: string
          locked: boolean
          mime: string | null
          replaced_at: string | null
          source: string
          storage_path: string | null
          title: string
          url: string
          variants: Json
          width: number | null
        }
        Insert: {
          alt_ar?: string
          alt_en?: string
          approval?: string
          archived_at?: string | null
          bytes?: number | null
          created_at?: string
          created_by?: string | null
          focal_x?: number
          focal_y?: number
          height?: number | null
          id?: string
          locked?: boolean
          mime?: string | null
          replaced_at?: string | null
          source?: string
          storage_path?: string | null
          title: string
          url: string
          variants?: Json
          width?: number | null
        }
        Update: {
          alt_ar?: string
          alt_en?: string
          approval?: string
          archived_at?: string | null
          bytes?: number | null
          created_at?: string
          created_by?: string | null
          focal_x?: number
          focal_y?: number
          height?: number | null
          id?: string
          locked?: boolean
          mime?: string | null
          replaced_at?: string | null
          source?: string
          storage_path?: string | null
          title?: string
          url?: string
          variants?: Json
          width?: number | null
        }
        Relationships: []
      }
      cms_members: {
        Row: {
          created_at: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      cms_preview_tokens: {
        Row: {
          created_at: string
          created_by: string
          document_id: string
          expires_at: string
          last_used_at: string | null
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          created_at?: string
          created_by: string
          document_id: string
          expires_at: string
          last_used_at?: string | null
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          created_at?: string
          created_by?: string
          document_id?: string
          expires_at?: string
          last_used_at?: string | null
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "cms_preview_tokens_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "cms_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_redirects: {
        Row: {
          created_at: string
          created_by: string | null
          enabled: boolean
          from_path: string
          hits: number
          id: string
          last_hit_at: string | null
          note: string
          status_code: number
          to_path: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          from_path: string
          hits?: number
          id?: string
          last_hit_at?: string | null
          note?: string
          status_code?: number
          to_path: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          from_path?: string
          hits?: number
          id?: string
          last_hit_at?: string | null
          note?: string
          status_code?: number
          to_path?: string
          updated_at?: string
        }
        Relationships: []
      }
      cms_revisions: {
        Row: {
          action: string
          author_id: string | null
          created_at: string
          document_id: string
          id: string
          snapshot: Json
        }
        Insert: {
          action: string
          author_id?: string | null
          created_at?: string
          document_id: string
          id?: string
          snapshot: Json
        }
        Update: {
          action?: string
          author_id?: string | null
          created_at?: string
          document_id?: string
          id?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "cms_revisions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "cms_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_site_config: {
        Row: {
          draft: Json
          key: string
          published: Json | null
          published_at: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          draft?: Json
          key: string
          published?: Json | null
          published_at?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          draft?: Json
          key?: string
          published?: Json | null
          published_at?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      contact_requests: {
        Row: {
          assigned_to: string | null
          company: string | null
          consent: boolean
          created_at: string
          department: string | null
          email: string | null
          id: string
          industry: string | null
          interest: string | null
          job_role: string | null
          kind: string
          locale: string
          message: string | null
          name: string
          notification_error: string | null
          notification_recipient: string | null
          notification_status: string
          page_path: string | null
          phone: string | null
          product: string | null
          referrer: string | null
          request_type: string
          status: string
          topic: string
          utm: Json
        }
        Insert: {
          assigned_to?: string | null
          company?: string | null
          consent?: boolean
          created_at?: string
          department?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          interest?: string | null
          job_role?: string | null
          kind?: string
          locale?: string
          message?: string | null
          name: string
          notification_error?: string | null
          notification_recipient?: string | null
          notification_status?: string
          page_path?: string | null
          phone?: string | null
          product?: string | null
          referrer?: string | null
          request_type?: string
          status?: string
          topic?: string
          utm?: Json
        }
        Update: {
          assigned_to?: string | null
          company?: string | null
          consent?: boolean
          created_at?: string
          department?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          interest?: string | null
          job_role?: string | null
          kind?: string
          locale?: string
          message?: string | null
          name?: string
          notification_error?: string | null
          notification_recipient?: string | null
          notification_status?: string
          page_path?: string | null
          phone?: string | null
          product?: string | null
          referrer?: string | null
          request_type?: string
          status?: string
          topic?: string
          utm?: Json
        }
        Relationships: []
      }
      lead_rate_limits: {
        Row: {
          attempts: number
          key: string
          window_start: string
        }
        Insert: {
          attempts?: number
          key: string
          window_start?: string
        }
        Update: {
          attempts?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      site_settings: {
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
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cms_access: { Args: { scope: string }; Returns: boolean }
      cms_apply_schedules: { Args: never; Returns: number }
      cms_media_public: {
        Args: never
        Returns: {
          focal_x: number
          focal_y: number
          height: number
          url: string
          width: number
        }[]
      }
      cms_published: {
        Args: never
        Returns: {
          kind: string
          path: string
          published: Json
          published_at: string
        }[]
      }
      cms_resolve_redirect: {
        Args: { p_path: string }
        Returns: {
          status_code: number
          to_path: string
        }[]
      }
      cms_site_published: {
        Args: never
        Returns: {
          key: string
          published: Json
          published_at: string
        }[]
      }
      consume_lead_limit: { Args: { rate_key: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
