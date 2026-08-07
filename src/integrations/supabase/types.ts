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
      admin_secrets: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
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
      billing_details: {
        Row: {
          city: string | null
          country: string
          created_at: string
          email: string
          faktero_customer_id: string | null
          ic_dph: string | null
          ico: string | null
          id: string
          name: string
          street: string | null
          updated_at: string
          user_id: string
          zip: string | null
        }
        Insert: {
          city?: string | null
          country?: string
          created_at?: string
          email: string
          faktero_customer_id?: string | null
          ic_dph?: string | null
          ico?: string | null
          id?: string
          name: string
          street?: string | null
          updated_at?: string
          user_id: string
          zip?: string | null
        }
        Update: {
          city?: string | null
          country?: string
          created_at?: string
          email?: string
          faktero_customer_id?: string | null
          ic_dph?: string | null
          ico?: string | null
          id?: string
          name?: string
          street?: string | null
          updated_at?: string
          user_id?: string
          zip?: string | null
        }
        Relationships: []
      }
      company_profile: {
        Row: {
          adresa: string | null
          auto_data: Json | null
          auto_fetched_at: string | null
          certifikaty: string[]
          created_at: string
          datum_vzniku: string | null
          dic: string | null
          doplnkove_info: string | null
          financne_roky: Json
          ico: string | null
          kluc_odbornici: string | null
          kraj: string | null
          mesto: string | null
          nazov: string | null
          pravna_forma: string | null
          psc: string | null
          referencie: Json
          sk_nace_code: string | null
          sk_nace_name: string | null
          technicke_vybavenie: string | null
          updated_at: string
          user_id: string
          velkost_kategoria: string | null
        }
        Insert: {
          adresa?: string | null
          auto_data?: Json | null
          auto_fetched_at?: string | null
          certifikaty?: string[]
          created_at?: string
          datum_vzniku?: string | null
          dic?: string | null
          doplnkove_info?: string | null
          financne_roky?: Json
          ico?: string | null
          kluc_odbornici?: string | null
          kraj?: string | null
          mesto?: string | null
          nazov?: string | null
          pravna_forma?: string | null
          psc?: string | null
          referencie?: Json
          sk_nace_code?: string | null
          sk_nace_name?: string | null
          technicke_vybavenie?: string | null
          updated_at?: string
          user_id: string
          velkost_kategoria?: string | null
        }
        Update: {
          adresa?: string | null
          auto_data?: Json | null
          auto_fetched_at?: string | null
          certifikaty?: string[]
          created_at?: string
          datum_vzniku?: string | null
          dic?: string | null
          doplnkove_info?: string | null
          financne_roky?: Json
          ico?: string | null
          kluc_odbornici?: string | null
          kraj?: string | null
          mesto?: string | null
          nazov?: string | null
          pravna_forma?: string | null
          psc?: string | null
          referencie?: Json
          sk_nace_code?: string | null
          sk_nace_name?: string | null
          technicke_vybavenie?: string | null
          updated_at?: string
          user_id?: string
          velkost_kategoria?: string | null
        }
        Relationships: []
      }
      gopay_payment_events: {
        Row: {
          amount_cents: number | null
          currency: string | null
          gopay_payment_id: string | null
          id: string
          parent_id: string | null
          processing_error: string | null
          raw: Json | null
          received_at: string
          state: string | null
          user_id: string | null
        }
        Insert: {
          amount_cents?: number | null
          currency?: string | null
          gopay_payment_id?: string | null
          id?: string
          parent_id?: string | null
          processing_error?: string | null
          raw?: Json | null
          received_at?: string
          state?: string | null
          user_id?: string | null
        }
        Update: {
          amount_cents?: number | null
          currency?: string | null
          gopay_payment_id?: string | null
          id?: string
          parent_id?: string | null
          processing_error?: string | null
          raw?: Json | null
          received_at?: string
          state?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      grant_analysis: {
        Row: {
          created_at: string
          eligibility: Json | null
          grant_id: string
          id: string
          model_versions: Json | null
          overall: string | null
          recommendation: string | null
          requirements: Json | null
          summary: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          eligibility?: Json | null
          grant_id: string
          id?: string
          model_versions?: Json | null
          overall?: string | null
          recommendation?: string | null
          requirements?: Json | null
          summary?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          eligibility?: Json | null
          grant_id?: string
          id?: string
          model_versions?: Json | null
          overall?: string | null
          recommendation?: string | null
          requirements?: Json | null
          summary?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grant_analysis_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "grant_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      grant_calls: {
        Row: {
          created_at: string
          currency: string
          datum_vyhlasenia: string | null
          deadline: string | null
          detail_url: string | null
          documents: Json
          druh: string | null
          id: string
          itms_updated_at: string | null
          kod: string | null
          kontakt: Json | null
          miesto_realizacie: Json
          oblasti: Json
          opravneny_ziadatel: Json
          poskytovatel: string | null
          program: string | null
          raw: Json | null
          source: string
          source_id: string
          stav: string
          structured_conditions: Json | null
          suma_eu: number | null
          suma_sr: number | null
          title: string
          typ: string | null
          updated_at: string
          vyhlasovatel: string | null
          zameranie: string | null
        }
        Insert: {
          created_at?: string
          currency?: string
          datum_vyhlasenia?: string | null
          deadline?: string | null
          detail_url?: string | null
          documents?: Json
          druh?: string | null
          id?: string
          itms_updated_at?: string | null
          kod?: string | null
          kontakt?: Json | null
          miesto_realizacie?: Json
          oblasti?: Json
          opravneny_ziadatel?: Json
          poskytovatel?: string | null
          program?: string | null
          raw?: Json | null
          source?: string
          source_id: string
          stav?: string
          structured_conditions?: Json | null
          suma_eu?: number | null
          suma_sr?: number | null
          title: string
          typ?: string | null
          updated_at?: string
          vyhlasovatel?: string | null
          zameranie?: string | null
        }
        Update: {
          created_at?: string
          currency?: string
          datum_vyhlasenia?: string | null
          deadline?: string | null
          detail_url?: string | null
          documents?: Json
          druh?: string | null
          id?: string
          itms_updated_at?: string | null
          kod?: string | null
          kontakt?: Json | null
          miesto_realizacie?: Json
          oblasti?: Json
          opravneny_ziadatel?: Json
          poskytovatel?: string | null
          program?: string | null
          raw?: Json | null
          source?: string
          source_id?: string
          stav?: string
          structured_conditions?: Json | null
          suma_eu?: number | null
          suma_sr?: number | null
          title?: string
          typ?: string | null
          updated_at?: string
          vyhlasovatel?: string | null
          zameranie?: string | null
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
      invoices: {
        Row: {
          amount: number
          created_at: string
          currency: string
          error_message: string | null
          faktero_invoice_id: string | null
          gopay_payment_id: string
          id: string
          invoice_number: string | null
          issued_at: string | null
          next_retry_at: string | null
          retry_count: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          error_message?: string | null
          faktero_invoice_id?: string | null
          gopay_payment_id: string
          id?: string
          invoice_number?: string | null
          issued_at?: string | null
          next_retry_at?: string | null
          retry_count?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          error_message?: string | null
          faktero_invoice_id?: string | null
          gopay_payment_id?: string
          id?: string
          invoice_number?: string | null
          issued_at?: string | null
          next_retry_at?: string | null
          retry_count?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          last_used_at: string | null
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          platform: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      sent_grant_notifications: {
        Row: {
          extra: string | null
          grant_id: string
          id: string
          kind: string
          sent_at: string
          user_id: string
        }
        Insert: {
          extra?: string | null
          grant_id: string
          id?: string
          kind: string
          sent_at?: string
          user_id: string
        }
        Update: {
          extra?: string | null
          grant_id?: string
          id?: string
          kind?: string
          sent_at?: string
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
      seo_pages: {
        Row: {
          active_tenders_count: number
          category_slug: string | null
          cpv_prefix: string | null
          created_at: string
          description: string
          h1: string
          id: string
          intro_text: string
          last_generated_at: string
          page_type: string
          region_name: string | null
          region_slug: string | null
          title: string
          updated_at: string
        }
        Insert: {
          active_tenders_count?: number
          category_slug?: string | null
          cpv_prefix?: string | null
          created_at?: string
          description: string
          h1: string
          id?: string
          intro_text: string
          last_generated_at?: string
          page_type: string
          region_name?: string | null
          region_slug?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          active_tenders_count?: number
          category_slug?: string | null
          cpv_prefix?: string | null
          created_at?: string
          description?: string
          h1?: string
          id?: string
          intro_text?: string
          last_generated_at?: string
          page_type?: string
          region_name?: string | null
          region_slug?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      sk_nace: {
        Row: {
          code: string
          name: string
          parent_code: string | null
        }
        Insert: {
          code: string
          name: string
          parent_code?: string | null
        }
        Update: {
          code?: string
          name?: string
          parent_code?: string | null
        }
        Relationships: []
      }
      subscription_admin_log: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          id: string
          note: string | null
          status: string | null
          user_id: string
          valid_until: string | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          id?: string
          note?: string | null
          status?: string | null
          user_id: string
          valid_until?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          id?: string
          note?: string | null
          status?: string | null
          user_id?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      tender_analysis: {
        Row: {
          created_at: string
          eligibility: Json | null
          id: string
          model_versions: Json | null
          overall: string | null
          recommendation: string | null
          requirements: Json | null
          summary: string | null
          tender_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          eligibility?: Json | null
          id?: string
          model_versions?: Json | null
          overall?: string | null
          recommendation?: string | null
          requirements?: Json | null
          summary?: string | null
          tender_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          eligibility?: Json | null
          id?: string
          model_versions?: Json | null
          overall?: string | null
          recommendation?: string | null
          requirements?: Json | null
          summary?: string | null
          tender_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tender_analysis_tender_id_fkey"
            columns: ["tender_id"]
            isOneToOne: false
            referencedRelation: "tenders"
            referencedColumns: ["id"]
          },
        ]
      }
      tender_subcontracting: {
        Row: {
          created_at: string
          firma_zvladne_sama: boolean
          id: string
          model_versions: Json | null
          poznamka: string | null
          selections: Json
          suggested: Json
          tender_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          firma_zvladne_sama?: boolean
          id?: string
          model_versions?: Json | null
          poznamka?: string | null
          selections?: Json
          suggested?: Json
          tender_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          firma_zvladne_sama?: boolean
          id?: string
          model_versions?: Json | null
          poznamka?: string | null
          selections?: Json
          suggested?: Json
          tender_id?: string
          updated_at?: string
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
          structured_criteria: Json | null
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
          structured_criteria?: Json | null
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
          structured_criteria?: Json | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_grant_radars: {
        Row: {
          active: boolean
          applicant_categories: string[]
          created_at: string
          formats: string[]
          id: string
          keywords: string[]
          name: string
          programs: string[]
          regions: string[]
          suma_eu_max: number | null
          suma_eu_min: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          applicant_categories?: string[]
          created_at?: string
          formats?: string[]
          id?: string
          keywords?: string[]
          name?: string
          programs?: string[]
          regions?: string[]
          suma_eu_max?: number | null
          suma_eu_min?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          applicant_categories?: string[]
          created_at?: string
          formats?: string[]
          id?: string
          keywords?: string[]
          name?: string
          programs?: string[]
          regions?: string[]
          suma_eu_max?: number | null
          suma_eu_min?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          ai_quota_period_start: string | null
          billing_period: string
          cpv_codes: string[]
          created_at: string
          deadline_reminders: boolean
          digest_frequency: string
          email_notifications: boolean
          gopay_recurrence_id: string | null
          gopay_subscription_id: string | null
          grant_deadline_reminders: boolean
          grant_new_match_notifications: boolean
          grant_weekly_digest: boolean
          id: string
          keywords: string[]
          last_payment_at: string | null
          last_settings_email_at: string | null
          notification_email: string | null
          onboarding_completed: boolean
          regions: string[]
          subscription_cancel_requested_at: string | null
          subscription_note: string | null
          subscription_source: string
          subscription_status: string
          subscription_tier: string
          subscription_valid_until: string | null
          trial_ai_analyses_used: number
          trial_started_at: string
          updated_at: string
          user_id: string
          welcome_email_sent: boolean
        }
        Insert: {
          ai_quota_period_start?: string | null
          billing_period?: string
          cpv_codes?: string[]
          created_at?: string
          deadline_reminders?: boolean
          digest_frequency?: string
          email_notifications?: boolean
          gopay_recurrence_id?: string | null
          gopay_subscription_id?: string | null
          grant_deadline_reminders?: boolean
          grant_new_match_notifications?: boolean
          grant_weekly_digest?: boolean
          id?: string
          keywords?: string[]
          last_payment_at?: string | null
          last_settings_email_at?: string | null
          notification_email?: string | null
          onboarding_completed?: boolean
          regions?: string[]
          subscription_cancel_requested_at?: string | null
          subscription_note?: string | null
          subscription_source?: string
          subscription_status?: string
          subscription_tier?: string
          subscription_valid_until?: string | null
          trial_ai_analyses_used?: number
          trial_started_at?: string
          updated_at?: string
          user_id: string
          welcome_email_sent?: boolean
        }
        Update: {
          ai_quota_period_start?: string | null
          billing_period?: string
          cpv_codes?: string[]
          created_at?: string
          deadline_reminders?: boolean
          digest_frequency?: string
          email_notifications?: boolean
          gopay_recurrence_id?: string | null
          gopay_subscription_id?: string | null
          grant_deadline_reminders?: boolean
          grant_new_match_notifications?: boolean
          grant_weekly_digest?: boolean
          id?: string
          keywords?: string[]
          last_payment_at?: string | null
          last_settings_email_at?: string | null
          notification_email?: string | null
          onboarding_completed?: boolean
          regions?: string[]
          subscription_cancel_requested_at?: string | null
          subscription_note?: string | null
          subscription_source?: string
          subscription_status?: string
          subscription_tier?: string
          subscription_valid_until?: string | null
          trial_ai_analyses_used?: number
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
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
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
          structured_criteria: Json | null
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
      admin_get_analytics_config: { Args: never; Returns: Json }
      admin_get_gopay_mode: { Args: never; Returns: string }
      admin_list_users: {
        Args: { _limit?: number }
        Returns: {
          billing_period: string
          created_at: string
          email: string
          radars_count: number
          subscription_note: string
          subscription_source: string
          subscription_status: string
          subscription_tier: string
          subscription_valid_until: string
          trial_started_at: string
          user_id: string
        }[]
      }
      admin_overview_stats: { Args: never; Returns: Json }
      admin_set_analytics_config: { Args: { _config: Json }; Returns: Json }
      admin_set_gopay_mode: { Args: { _mode: string }; Returns: string }
      admin_set_gopay_recurring_enabled: {
        Args: { _enabled: boolean }
        Returns: boolean
      }
      admin_set_subscription:
        | {
            Args: {
              _note: string
              _source: string
              _status: string
              _tier?: string
              _user_id: string
              _valid_until: string
            }
            Returns: Json
          }
        | {
            Args: {
              _note: string
              _period?: string
              _source: string
              _status: string
              _tier?: string
              _user_id: string
              _valid_until: string
            }
            Returns: Json
          }
      admin_stuck_paid_payments: {
        Args: { _limit?: number }
        Returns: {
          amount_cents: number
          currency: string
          email: string
          gopay_payment_id: string
          id: string
          processing_error: string
          received_at: string
          state: string
          subscription_status: string
          subscription_tier: string
          subscription_valid_until: string
          user_id: string
        }[]
      }
      ai_monthly_limit: { Args: { _tier: string }; Returns: number }
      cleanup_grant_calls: { Args: never; Returns: number }
      consume_ai_credit: { Args: { _tender_id: string }; Returns: Json }
      consume_ai_credit_grant: { Args: { _grant_id: string }; Returns: Json }
      count_seo_active_tenders: {
        Args: { _cpv_prefix: string; _region_name: string }
        Returns: number
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
      get_ai_credit_status: { Args: never; Returns: Json }
      get_analytics_config: { Args: never; Returns: Json }
      get_entitlements: { Args: never; Returns: Json }
      get_gopay_recurring_enabled: { Args: never; Returns: boolean }
      get_open_grants_stats: {
        Args: never
        Returns: {
          open_count: number
          total_alloc_eur: number
        }[]
      }
      get_seo_tenders: {
        Args: { _cpv_prefix: string; _limit?: number; _region_name: string }
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
          structured_criteria: Json | null
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
      grant_applicant_categories: {
        Args: { _opravneny: Json }
        Returns: string[]
      }
      grant_classify_applicant: { Args: { _name: string }; Returns: string }
      grant_is_nationwide: { Args: { _miesto: Json }; Returns: boolean }
      grant_region_names: { Args: { _miesto: Json }; Returns: string[] }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_grant_programs: {
        Args: never
        Returns: {
          cnt: number
          program: string
        }[]
      }
      match_grants_for_radar: {
        Args: { _radar_id: string }
        Returns: {
          created_at: string
          currency: string
          datum_vyhlasenia: string | null
          deadline: string | null
          detail_url: string | null
          documents: Json
          druh: string | null
          id: string
          itms_updated_at: string | null
          kod: string | null
          kontakt: Json | null
          miesto_realizacie: Json
          oblasti: Json
          opravneny_ziadatel: Json
          poskytovatel: string | null
          program: string | null
          raw: Json | null
          source: string
          source_id: string
          stav: string
          structured_conditions: Json | null
          suma_eu: number | null
          suma_sr: number | null
          title: string
          typ: string | null
          updated_at: string
          vyhlasovatel: string | null
          zameranie: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "grant_calls"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      search_user_tenders: {
        Args: {
          _countries: string[]
          _from: number
          _limit: number
          _q: string
          _radar_ids: string[]
          _sort: string
          _sources?: string[]
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
      app_role: "user" | "admin"
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
    Enums: {
      app_role: ["user", "admin"],
    },
  },
} as const
