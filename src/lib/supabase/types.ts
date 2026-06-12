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
      event_types: {
        Row: {
          code: string
          default_perf_points: number
          id: string
          name: string
        }
        Insert: {
          code: string
          default_perf_points: number
          id?: string
          name: string
        }
        Update: {
          code?: string
          default_perf_points?: number
          id?: string
          name?: string
        }
        Relationships: []
      }
      holdings: {
        Row: {
          avg_cost: number
          player_id: string
          shares: number
          user_id: string
        }
        Insert: {
          avg_cost?: number
          player_id: string
          shares?: number
          user_id: string
        }
        Update: {
          avg_cost?: number
          player_id?: string
          shares?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "holdings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "holdings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_value"
            referencedColumns: ["user_id"]
          },
        ]
      }
      league_members: {
        Row: {
          joined_at: string
          league_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          league_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          league_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_members_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "league_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_value"
            referencedColumns: ["user_id"]
          },
        ]
      }
      leagues: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          invite_code: string
          name: string
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          invite_code: string
          name: string
          type?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          invite_code?: string
          name?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "leagues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leagues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "leagues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_portfolio_value"
            referencedColumns: ["user_id"]
          },
        ]
      }
      market_params: {
        Row: {
          id: string
          params: Json
        }
        Insert: {
          id?: string
          params: Json
        }
        Update: {
          id?: string
          params?: Json
        }
        Relationships: []
      }
      match_events: {
        Row: {
          api_event_key: string
          event_type_id: string
          id: string
          match_id: string
          minute: number | null
          player_id: string | null
        }
        Insert: {
          api_event_key: string
          event_type_id: string
          id?: string
          match_id: string
          minute?: number | null
          player_id?: string | null
        }
        Update: {
          api_event_key?: string
          event_type_id?: string
          id?: string
          match_id?: string
          minute?: number | null
          player_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_events_event_type_id_fkey"
            columns: ["event_type_id"]
            isOneToOne: false
            referencedRelation: "event_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_events_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          api_fixture_id: number
          away_team_id: string
          home_team_id: string
          id: string
          kickoff_utc: string
          processed: boolean
          round_id: string
          status: string
        }
        Insert: {
          api_fixture_id: number
          away_team_id: string
          home_team_id: string
          id?: string
          kickoff_utc: string
          processed?: boolean
          round_id: string
          status?: string
        }
        Update: {
          api_fixture_id?: number
          away_team_id?: string
          home_team_id?: string
          id?: string
          kickoff_utc?: string
          processed?: boolean
          round_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_price_deltas: {
        Row: {
          applied_pct: number
          created_at: string
          id: string
          player_id: string
          remaining_pct: number | null
          source_event_id: string | null
          total_pct: number
        }
        Insert: {
          applied_pct?: number
          created_at?: string
          id?: string
          player_id: string
          remaining_pct?: number | null
          source_event_id?: string | null
          total_pct: number
        }
        Update: {
          applied_pct?: number
          created_at?: string
          id?: string
          player_id?: string
          remaining_pct?: number | null
          source_event_id?: string | null
          total_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "pending_price_deltas_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_price_deltas_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "match_events"
            referencedColumns: ["id"]
          },
        ]
      }
      player_injuries: {
        Row: {
          expected_return: string | null
          id: string
          player_id: string
          started_at: string
          status: string
        }
        Insert: {
          expected_return?: string | null
          id?: string
          player_id: string
          started_at?: string
          status: string
        }
        Update: {
          expected_return?: string | null
          id?: string
          player_id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_injuries_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_match_appearances: {
        Row: {
          match_id: string
          minutes_played: number | null
          player_id: string
          started: boolean | null
        }
        Insert: {
          match_id: string
          minutes_played?: number | null
          player_id: string
          started?: boolean | null
        }
        Update: {
          match_id?: string
          minutes_played?: number | null
          player_id?: string
          started?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "player_match_appearances_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_match_appearances_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          api_player_id: number | null
          avatar_colors: Json | null
          base_value: number
          current_price: number
          dob: string | null
          fair_value: number
          full_name: string
          id: string
          liquidity_tier: string
          position_id: string
          shares_outstanding: number
          team_id: string
        }
        Insert: {
          api_player_id?: number | null
          avatar_colors?: Json | null
          base_value: number
          current_price: number
          dob?: string | null
          fair_value: number
          full_name: string
          id?: string
          liquidity_tier: string
          position_id: string
          shares_outstanding?: number
          team_id: string
        }
        Update: {
          api_player_id?: number | null
          avatar_colors?: Json | null
          base_value?: number
          current_price?: number
          dob?: string | null
          fair_value?: number
          full_name?: string
          id?: string
          liquidity_tier?: string
          position_id?: string
          shares_outstanding?: number
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          code: string
          id: string
          name: string
        }
        Insert: {
          code: string
          id?: string
          name: string
        }
        Update: {
          code?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      price_history: {
        Row: {
          captured_at: string
          fair_value: number
          id: string
          player_id: string
          price: number
          reason: string
        }
        Insert: {
          captured_at?: string
          fair_value: number
          id?: string
          player_id: string
          price: number
          reason: string
        }
        Update: {
          captured_at?: string
          fair_value?: number
          id?: string
          player_id?: string
          price?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_history_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          cash_balance: number
          created_at: string
          id: string
          locale: string
          username: string
        }
        Insert: {
          cash_balance?: number
          created_at?: string
          id: string
          locale?: string
          username: string
        }
        Update: {
          cash_balance?: number
          created_at?: string
          id?: string
          locale?: string
          username?: string
        }
        Relationships: []
      }
      rounds: {
        Row: {
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          id?: string
          name: string
          sort_order: number
        }
        Update: {
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      teams: {
        Row: {
          api_team_id: number | null
          colors: Json | null
          country: string
          eliminated_round_id: string | null
          group_name: string | null
          id: string
          is_eliminated: boolean
          name: string
        }
        Insert: {
          api_team_id?: number | null
          colors?: Json | null
          country: string
          eliminated_round_id?: string | null
          group_name?: string | null
          id?: string
          is_eliminated?: boolean
          name: string
        }
        Update: {
          api_team_id?: number | null
          colors?: Json | null
          country?: string
          eliminated_round_id?: string | null
          group_name?: string | null
          id?: string
          is_eliminated?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_eliminated_round_id_fkey"
            columns: ["eliminated_round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          created_at: string
          fee: number
          gross: number
          id: string
          net: number
          player_id: string
          price_per_share: number
          shares: number
          side: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fee: number
          gross: number
          id?: string
          net: number
          player_id: string
          price_per_share: number
          shares: number
          side: string
          user_id: string
        }
        Update: {
          created_at?: string
          fee?: number
          gross?: number
          id?: string
          net?: number
          player_id?: string
          price_per_share?: number
          shares?: number
          side?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "trades_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_value"
            referencedColumns: ["user_id"]
          },
        ]
      }
      wallet_ledger: {
        Row: {
          balance_after: number
          created_at: string
          delta: number
          entry_type: string
          id: string
          ref_id: string | null
          user_id: string
        }
        Insert: {
          balance_after: number
          created_at?: string
          delta: number
          entry_type: string
          id?: string
          ref_id?: string | null
          user_id: string
        }
        Update: {
          balance_after?: number
          created_at?: string
          delta?: number
          entry_type?: string
          id?: string
          ref_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_leaderboard"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "wallet_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_value"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Views: {
      v_leaderboard: {
        Row: {
          rank: number | null
          return_pct: number | null
          total_value: number | null
          user_id: string | null
          username: string | null
        }
        Relationships: []
      }
      v_player_stats: {
        Row: {
          assists: number | null
          goals: number | null
          player_id: string | null
          red_cards: number | null
          yellow_cards: number | null
        }
        Relationships: [
          {
            foreignKeyName: "match_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      v_portfolio_value: {
        Row: {
          return_pct: number | null
          total_value: number | null
          user_id: string | null
          username: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      apply_tick: { Args: { p: Json }; Returns: Json }
      check_cron_health: { Args: never; Returns: Json }
      finalize_match: {
        Args: { p_eliminated?: Json; p_fair_values?: Json; p_match_id: string }
        Returns: Json
      }
      get_ingest_state: { Args: never; Returns: Json }
      get_tick_state: { Args: never; Returns: Json }
      ingest_event: {
        Args: {
          p_api_event_key: string
          p_event_type_id: string
          p_expected_fair_value: number
          p_match_id: string
          p_minute: number
          p_new_fair_value: number
          p_player_id: string
          p_total_pct: number
        }
        Returns: Json
      }
      invoke_edge_function: { Args: { p_name: string }; Returns: undefined }
      trade: {
        Args: { p_player_id: string; p_shares: number; p_side: string }
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
    Enums: {},
  },
} as const

