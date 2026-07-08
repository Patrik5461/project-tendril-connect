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
      app_settings: {
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
      help_chat_usage: {
        Row: {
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      sent_reminders: {
        Row: {
          days_before: number
          id: string
          sent_at: string
          tender_id: string
          user_id: string
        }
        Insert: {
          days_before: number
          id?: string
          sent_at?: string
          tender_id: string
          user_id: string
        }
        Update: {
          days_before?: number
          id?: string
          sent_at?: string
          tender_id?: string
          user_id?: string
        }
        Relationships: []
      }
      tenders: {
        Row: {
          ai_summary: string | null
          ai_summary_generated_at: string | null
          contracting_authority: string
          country: string | null
          country_name: string | null
          cpv_code: string | null
          created_at: string
          currency: string | null
          deadline: string | null
          description: string | null
          estimated_value: number | null
          id: string
          publication_number: string | null
          published_at: string | null
          region: string | null
          source: string
          source_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          ai_summary?: string | null
          ai_summary_generated_at?: string | null
          contracting_authority: string
          country?: string | null
          country_name?: string | null
          cpv_code?: string | null
          created_at?: string
          currency?: string | null
          deadline?: string | null
          description?: string | null
          estimated_value?: number | null
          id?: string
          publication_number?: string | null
          published_at?: string | null
          region?: string | null
          source?: string
          source_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          ai_summary?: string | null
          ai_summary_generated_at?: string | null
          contracting_authority?: string
          country?: string | null
          country_name?: string | null
          cpv_code?: string | null
          created_at?: string
          currency?: string | null
          deadline?: string | null
          description?: string | null
          estimated_value?: number | null
          id?: string
          publication_number?: string | null
          published_at?: string | null
          region?: string | null
          source?: string
          source_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          cpv_codes: string[]
          created_at: string
          deadline_reminders: boolean
          digest_frequency: string
          email_notifications: boolean
          id: string
          keywords: string[]
          notification_email: string | null
          onboarding_completed: boolean
          regions: string[]
          subscription_status: string
          trial_started_at: string
          updated_at: string
          user_id: string
          welcome_email_sent: boolean
        }
        Insert: {
          cpv_codes?: string[]
          created_at?: string
          deadline_reminders?: boolean
          digest_frequency?: string
          email_notifications?: boolean
          id?: string
          keywords?: string[]
          notification_email?: string | null
          onboarding_completed?: boolean
          regions?: string[]
          subscription_status?: string
          trial_started_at?: string
          updated_at?: string
          user_id: string
          welcome_email_sent?: boolean
        }
        Update: {
          cpv_codes?: string[]
          created_at?: string
          deadline_reminders?: boolean
          digest_frequency?: string
          email_notifications?: boolean
          id?: string
          keywords?: string[]
          notification_email?: string | null
          onboarding_completed?: boolean
          regions?: string[]
          subscription_status?: string
          trial_started_at?: string
          updated_at?: string
          user_id?: string
          welcome_email_sent?: boolean
        }
        Relationships: []
      }
      user_radars: {
        Row: {
          active: boolean
          countries: string[]
          cpv_codes: string[]
          created_at: string
          id: string
          keywords: string[]
          name: string
          regions: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          countries?: string[]
          cpv_codes?: string[]
          created_at?: string
          id?: string
          keywords?: string[]
          name?: string
          regions?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          countries?: string[]
          cpv_codes?: string[]
          created_at?: string
          id?: string
          keywords?: string[]
          name?: string
          regions?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_tender_actions: {
        Row: {
          action: string
          created_at: string
          id: string
          tender_id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          tender_id: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          tender_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_tender_actions_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "tenders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _user_tender_base: {
        Args: { _q: string; _radar_ids: string[]; _tab: string; _uid: string }
        Returns: {
          ai_summary: string | null
          ai_summary_generated_at: string | null
          contracting_authority: string
          country: string | null
          country_name: string | null
          cpv_code: string | null
          created_at: string
          currency: string | null
          deadline: string | null
          description: string | null
          estimated_value: number | null
          id: string
          publication_number: string | null
          published_at: string | null
          region: string | null
          source: string
          source_url: string | null
          title: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "tenders"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      expire_trials: { Args: never; Returns: number }
      get_active_tenders_count: { Args: never; Returns: number }
      get_active_tenders_stats: {
        Args: never
        Returns: {
          active_count: number
          total_value_eur: number
        }[]
      }
      search_user_tenders: {
        Args: {
          _countries: string[]
          _from: number
          _limit: number
          _q: string
          _radar_ids: string[]
          _sort: string
          _tab: string
        }
        Returns: Json
      }
      set_ai_summaries_enabled: { Args: { enabled: boolean }; Returns: boolean }
      unaccent: { Args: { "": string }; Returns: string }
      user_tenders_country_facets: {
        Args: { _q: string; _radar_ids: string[]; _tab: string }
        Returns: {
          cnt: number
          country: string
        }[]
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
  public: {
    Enums: {},
  },
} as const
