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
      app_feedback: {
        Row: {
          author_role: Database["public"]["Enums"]["business_role"]
          author_seen_at: string | null
          author_update_at: string | null
          author_user_id: string
          body: string
          business_id: string
          created_at: string
          device: string | null
          id: string
          kind: string
          replied_at: string | null
          replied_by: string | null
          reply: string | null
          retracted_at: string | null
          screen_path: string | null
          status: string
          status_changed_at: string | null
          status_changed_by: string | null
        }
        Insert: {
          author_role: Database["public"]["Enums"]["business_role"]
          author_seen_at?: string | null
          author_update_at?: string | null
          author_user_id: string
          body: string
          business_id: string
          created_at?: string
          device?: string | null
          id?: string
          kind: string
          replied_at?: string | null
          replied_by?: string | null
          reply?: string | null
          retracted_at?: string | null
          screen_path?: string | null
          status?: string
          status_changed_at?: string | null
          status_changed_by?: string | null
        }
        Update: {
          author_role?: Database["public"]["Enums"]["business_role"]
          author_seen_at?: string | null
          author_update_at?: string | null
          author_user_id?: string
          body?: string
          business_id?: string
          created_at?: string
          device?: string | null
          id?: string
          kind?: string
          replied_at?: string | null
          replied_by?: string | null
          reply?: string | null
          retracted_at?: string | null
          screen_path?: string | null
          status?: string
          status_changed_at?: string | null
          status_changed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_feedback_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      app_feedback_events: {
        Row: {
          action: string
          actor_user_id: string
          business_id: string
          created_at: string
          feedback_id: string
          from_status: string | null
          id: string
          reply: string | null
          to_status: string | null
        }
        Insert: {
          action: string
          actor_user_id: string
          business_id: string
          created_at?: string
          feedback_id: string
          from_status?: string | null
          id?: string
          reply?: string | null
          to_status?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          business_id?: string
          created_at?: string
          feedback_id?: string
          from_status?: string | null
          id?: string
          reply?: string | null
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_feedback_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_feedback_events_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "app_feedback"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_items: {
        Row: {
          appointment_id: string
          branch_id: string
          business_id: string
          created_at: string
          duration_snapshot_minutes: number
          employee_id: string | null
          id: string
          position: number
          price_snapshot: number
          removed_at: string | null
          service_id: string
        }
        Insert: {
          appointment_id: string
          branch_id: string
          business_id: string
          created_at?: string
          duration_snapshot_minutes: number
          employee_id?: string | null
          id?: string
          position?: number
          price_snapshot: number
          removed_at?: string | null
          service_id: string
        }
        Update: {
          appointment_id?: string
          branch_id?: string
          business_id?: string
          created_at?: string
          duration_snapshot_minutes?: number
          employee_id?: string | null
          id?: string
          position?: number
          price_snapshot?: number
          removed_at?: string | null
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_items_business_id_branch_id_appointment_id_fkey"
            columns: ["business_id", "branch_id", "appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["business_id", "branch_id", "id"]
          },
          {
            foreignKeyName: "appointment_items_business_id_employee_id_fkey"
            columns: ["business_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "appointment_items_business_id_service_id_fkey"
            columns: ["business_id", "service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["business_id", "id"]
          },
        ]
      }
      appointment_notifications: {
        Row: {
          appointment_id: string
          branch_id: string
          business_id: string
          channel: string
          created_at: string
          created_by: string
          id: string
          kind: string
        }
        Insert: {
          appointment_id: string
          branch_id: string
          business_id: string
          channel?: string
          created_at?: string
          created_by: string
          id?: string
          kind: string
        }
        Update: {
          appointment_id?: string
          branch_id?: string
          business_id?: string
          channel?: string
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_notifications_appointment_fkey"
            columns: ["business_id", "branch_id", "appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["business_id", "branch_id", "id"]
          },
        ]
      }
      appointment_products: {
        Row: {
          added_at: string
          added_by: string
          appointment_id: string
          branch_id: string
          business_id: string
          id: string
          product_id: string
          quantity: number
          removed_at: string | null
          removed_by: string | null
          seller_employee_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          added_at?: string
          added_by: string
          appointment_id: string
          branch_id: string
          business_id: string
          id?: string
          product_id: string
          quantity: number
          removed_at?: string | null
          removed_by?: string | null
          seller_employee_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          added_at?: string
          added_by?: string
          appointment_id?: string
          branch_id?: string
          business_id?: string
          id?: string
          product_id?: string
          quantity?: number
          removed_at?: string | null
          removed_by?: string | null
          seller_employee_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_products_appointment_fkey"
            columns: ["business_id", "branch_id", "appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["business_id", "branch_id", "id"]
          },
          {
            foreignKeyName: "appointment_products_product_fkey"
            columns: ["business_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "appointment_products_seller_fkey"
            columns: ["business_id", "seller_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["business_id", "id"]
          },
        ]
      }
      appointments: {
        Row: {
          arrived_at: string | null
          assigned_employee_id: string | null
          branch_id: string
          business_id: string
          client_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_name: string
          customer_phone: string | null
          id: string
          notes: string | null
          scheduled_end_at: string | null
          scheduled_start_at: string | null
          source: Database["public"]["Enums"]["appointment_source"]
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        Insert: {
          arrived_at?: string | null
          assigned_employee_id?: string | null
          branch_id: string
          business_id: string
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_name: string
          customer_phone?: string | null
          id?: string
          notes?: string | null
          scheduled_end_at?: string | null
          scheduled_start_at?: string | null
          source?: Database["public"]["Enums"]["appointment_source"]
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Update: {
          arrived_at?: string | null
          assigned_employee_id?: string | null
          branch_id?: string
          business_id?: string
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_name?: string
          customer_phone?: string | null
          id?: string
          notes?: string | null
          scheduled_end_at?: string | null
          scheduled_start_at?: string | null
          source?: Database["public"]["Enums"]["appointment_source"]
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_business_id_assigned_employee_id_fkey"
            columns: ["business_id", "assigned_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "appointments_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "appointments_business_id_client_id_fkey"
            columns: ["business_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "appointments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          branch_id: string | null
          business_id: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: number
          reason: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          branch_id?: string | null
          business_id: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: never
          reason?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          branch_id?: string | null
          business_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: never
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "audit_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      bonus_goals: {
        Row: {
          applies_to: string
          bonus_amount: number
          branch_id: string
          business_id: string
          created_at: string
          created_by: string
          employee_id: string | null
          id: string
          is_active: boolean
          metric: string
          name: string
          threshold: number
          updated_at: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          applies_to: string
          bonus_amount: number
          branch_id: string
          business_id: string
          created_at?: string
          created_by: string
          employee_id?: string | null
          id?: string
          is_active?: boolean
          metric: string
          name: string
          threshold: number
          updated_at?: string
          valid_from: string
          valid_to?: string | null
        }
        Update: {
          applies_to?: string
          bonus_amount?: number
          branch_id?: string
          business_id?: string
          created_at?: string
          created_by?: string
          employee_id?: string | null
          id?: string
          is_active?: boolean
          metric?: string
          name?: string
          threshold?: number
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bonus_goals_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "bonus_goals_business_id_employee_id_fkey"
            columns: ["business_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "bonus_goals_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_inventory: {
        Row: {
          branch_id: string
          business_id: string
          id: string
          minimum_quantity: number
          product_id: string
          quantity_on_hand: number
          updated_at: string
        }
        Insert: {
          branch_id: string
          business_id: string
          id?: string
          minimum_quantity?: number
          product_id: string
          quantity_on_hand?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string
          business_id?: string
          id?: string
          minimum_quantity?: number
          product_id?: string
          quantity_on_hand?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_inventory_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "branch_inventory_business_id_product_id_fkey"
            columns: ["business_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["business_id", "id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          business_id: string
          cash_float_target: number
          created_at: string
          daily_reserve_amount: number
          daily_reserve_label: string
          id: string
          is_active: boolean
          name: string
          phone: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_id: string
          cash_float_target?: number
          created_at?: string
          daily_reserve_amount?: number
          daily_reserve_label?: string
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_id?: string
          cash_float_target?: number
          created_at?: string
          daily_reserve_amount?: number
          daily_reserve_label?: string
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_memberships: {
        Row: {
          business_id: string
          created_at: string
          is_active: boolean
          login_name: string | null
          must_change_pin: boolean
          role: Database["public"]["Enums"]["business_role"]
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          is_active?: boolean
          login_name?: string | null
          must_change_pin?: boolean
          role: Database["public"]["Enums"]["business_role"]
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          is_active?: boolean
          login_name?: string | null
          must_change_pin?: boolean
          role?: Database["public"]["Enums"]["business_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_memberships_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          created_at: string
          currency: string
          id: string
          is_active: boolean
          name: string
          owner_user_id: string
          product_commission_pct: number
          service_commission_pct: number
          settings: Json
          slug: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          name: string
          owner_user_id: string
          product_commission_pct?: number
          service_commission_pct?: number
          settings?: Json
          slug: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          name?: string
          owner_user_id?: string
          product_commission_pct?: number
          service_commission_pct?: number
          settings?: Json
          slug?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      cash_envelopes: {
        Row: {
          branch_id: string
          business_id: string
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          business_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          business_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_envelopes_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "cash_envelopes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_movements: {
        Row: {
          amount: number
          branch_id: string
          business_id: string
          cash_session_id: string
          commission_settlement_id: string | null
          created_at: string
          created_by: string
          description: string | null
          direction: Database["public"]["Enums"]["cash_direction"]
          expense_id: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          movement_type: Database["public"]["Enums"]["cash_movement_type"]
          payment_id: string | null
          sale_id: string | null
        }
        Insert: {
          amount: number
          branch_id: string
          business_id: string
          cash_session_id: string
          commission_settlement_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          direction: Database["public"]["Enums"]["cash_direction"]
          expense_id?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          movement_type: Database["public"]["Enums"]["cash_movement_type"]
          payment_id?: string | null
          sale_id?: string | null
        }
        Update: {
          amount?: number
          branch_id?: string
          business_id?: string
          cash_session_id?: string
          commission_settlement_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          direction?: Database["public"]["Enums"]["cash_direction"]
          expense_id?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          movement_type?: Database["public"]["Enums"]["cash_movement_type"]
          payment_id?: string | null
          sale_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_business_id_branch_id_cash_session_id_fkey"
            columns: ["business_id", "branch_id", "cash_session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["business_id", "branch_id", "id"]
          },
          {
            foreignKeyName: "cash_movements_business_id_branch_id_payment_id_fkey"
            columns: ["business_id", "branch_id", "payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["business_id", "branch_id", "id"]
          },
          {
            foreignKeyName: "cash_movements_business_id_branch_id_sale_id_fkey"
            columns: ["business_id", "branch_id", "sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["business_id", "branch_id", "id"]
          },
          {
            foreignKeyName: "cash_movements_commission_settlement_fk"
            columns: ["commission_settlement_id"]
            isOneToOne: true
            referencedRelation: "commission_settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_expense_fk"
            columns: ["business_id", "branch_id", "expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["business_id", "branch_id", "id"]
          },
        ]
      }
      cash_sessions: {
        Row: {
          branch_id: string
          business_id: string
          closed_at: string | null
          closed_by: string | null
          closing_note: string | null
          counted_breakdown: Json | null
          counted_cash: number | null
          difference_amount: number | null
          difference_reason: string | null
          expected_cash: number | null
          float_left: number | null
          id: string
          notes: string | null
          opened_at: string
          opened_by: string
          opening_cash: number
          opening_expected: number | null
          opening_note: string | null
          reserve_amount: number | null
          status: Database["public"]["Enums"]["cash_session_status"]
          withdrawal_delivered_to: string | null
          withdrawn_amount: number | null
        }
        Insert: {
          branch_id: string
          business_id: string
          closed_at?: string | null
          closed_by?: string | null
          closing_note?: string | null
          counted_breakdown?: Json | null
          counted_cash?: number | null
          difference_amount?: number | null
          difference_reason?: string | null
          expected_cash?: number | null
          float_left?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by: string
          opening_cash?: number
          opening_expected?: number | null
          opening_note?: string | null
          reserve_amount?: number | null
          status?: Database["public"]["Enums"]["cash_session_status"]
          withdrawal_delivered_to?: string | null
          withdrawn_amount?: number | null
        }
        Update: {
          branch_id?: string
          business_id?: string
          closed_at?: string | null
          closed_by?: string | null
          closing_note?: string | null
          counted_breakdown?: Json | null
          counted_cash?: number | null
          difference_amount?: number | null
          difference_reason?: string | null
          expected_cash?: number | null
          float_left?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string
          opening_cash?: number
          opening_expected?: number | null
          opening_note?: string | null
          reserve_amount?: number | null
          status?: Database["public"]["Enums"]["cash_session_status"]
          withdrawal_delivered_to?: string | null
          withdrawn_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_sessions_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "cash_sessions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          notes: string | null
          phone: string | null
          preferences: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          notes?: string | null
          phone?: string | null
          preferences?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          phone?: string | null
          preferences?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_adjustments: {
        Row: {
          amount: number
          branch_id: string
          business_id: string
          commission_entry_id: string
          created_at: string
          created_by: string
          employee_id: string
          id: string
          reason: string
          remaining_amount: number
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          amount: number
          branch_id: string
          business_id: string
          commission_entry_id: string
          created_at?: string
          created_by: string
          employee_id: string
          id?: string
          reason: string
          remaining_amount: number
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          amount?: number
          branch_id?: string
          business_id?: string
          commission_entry_id?: string
          created_at?: string
          created_by?: string
          employee_id?: string
          id?: string
          reason?: string
          remaining_amount?: number
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_adjustments_branch_fk"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "commission_adjustments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_adjustments_employee_fk"
            columns: ["business_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "commission_adjustments_entry_fk"
            columns: [
              "business_id",
              "branch_id",
              "employee_id",
              "commission_entry_id",
            ]
            isOneToOne: false
            referencedRelation: "commission_entries"
            referencedColumns: ["business_id", "branch_id", "employee_id", "id"]
          },
        ]
      }
      commission_entries: {
        Row: {
          basis: Database["public"]["Enums"]["commission_basis"]
          basis_amount: number
          branch_id: string
          business_id: string
          calculation_type: Database["public"]["Enums"]["commission_calculation_type"]
          commission_amount: number
          commission_rule_id: string | null
          employee_id: string
          fixed_amount_snapshot: number | null
          generated_at: string
          id: string
          percentage_snapshot: number | null
          reversal_reason: string | null
          reversed_at: string | null
          rule_snapshot: Json
          sale_id: string
          sale_item_id: string
          status: Database["public"]["Enums"]["commission_entry_status"]
        }
        Insert: {
          basis: Database["public"]["Enums"]["commission_basis"]
          basis_amount: number
          branch_id: string
          business_id: string
          calculation_type: Database["public"]["Enums"]["commission_calculation_type"]
          commission_amount: number
          commission_rule_id?: string | null
          employee_id: string
          fixed_amount_snapshot?: number | null
          generated_at?: string
          id?: string
          percentage_snapshot?: number | null
          reversal_reason?: string | null
          reversed_at?: string | null
          rule_snapshot?: Json
          sale_id: string
          sale_item_id: string
          status?: Database["public"]["Enums"]["commission_entry_status"]
        }
        Update: {
          basis?: Database["public"]["Enums"]["commission_basis"]
          basis_amount?: number
          branch_id?: string
          business_id?: string
          calculation_type?: Database["public"]["Enums"]["commission_calculation_type"]
          commission_amount?: number
          commission_rule_id?: string | null
          employee_id?: string
          fixed_amount_snapshot?: number | null
          generated_at?: string
          id?: string
          percentage_snapshot?: number | null
          reversal_reason?: string | null
          reversed_at?: string | null
          rule_snapshot?: Json
          sale_id?: string
          sale_item_id?: string
          status?: Database["public"]["Enums"]["commission_entry_status"]
        }
        Relationships: [
          {
            foreignKeyName: "commission_entries_business_id_branch_id_sale_id_fkey"
            columns: ["business_id", "branch_id", "sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["business_id", "branch_id", "id"]
          },
          {
            foreignKeyName: "commission_entries_business_id_branch_id_sale_item_id_fkey"
            columns: ["business_id", "branch_id", "sale_item_id"]
            isOneToOne: false
            referencedRelation: "sale_items"
            referencedColumns: ["business_id", "branch_id", "id"]
          },
          {
            foreignKeyName: "commission_entries_business_id_commission_rule_id_fkey"
            columns: ["business_id", "commission_rule_id"]
            isOneToOne: false
            referencedRelation: "commission_rules"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "commission_entries_business_id_employee_id_fkey"
            columns: ["business_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["business_id", "id"]
          },
        ]
      }
      commission_holds: {
        Row: {
          branch_id: string
          business_id: string
          created_at: string
          employee_candidate_ids: string[]
          id: string
          reason: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          sale_id: string
          sale_item_id: string
        }
        Insert: {
          branch_id: string
          business_id: string
          created_at?: string
          employee_candidate_ids?: string[]
          id?: string
          reason: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sale_id: string
          sale_item_id: string
        }
        Update: {
          branch_id?: string
          business_id?: string
          created_at?: string
          employee_candidate_ids?: string[]
          id?: string
          reason?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sale_id?: string
          sale_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_holds_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_holds_item_fk"
            columns: ["business_id", "branch_id", "sale_item_id"]
            isOneToOne: false
            referencedRelation: "sale_items"
            referencedColumns: ["business_id", "branch_id", "id"]
          },
          {
            foreignKeyName: "commission_holds_sale_fk"
            columns: ["business_id", "branch_id", "sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["business_id", "branch_id", "id"]
          },
        ]
      }
      commission_rules: {
        Row: {
          basis: Database["public"]["Enums"]["commission_basis"]
          business_id: string
          calculation_type: Database["public"]["Enums"]["commission_calculation_type"]
          created_at: string
          effective_from: string
          effective_to: string | null
          employee_id: string | null
          fixed_amount: number | null
          id: string
          is_active: boolean
          name: string
          percentage: number | null
          priority: number
          product_id: string | null
          service_id: string | null
          target_type: Database["public"]["Enums"]["commission_target_type"]
          updated_at: string
        }
        Insert: {
          basis: Database["public"]["Enums"]["commission_basis"]
          business_id: string
          calculation_type: Database["public"]["Enums"]["commission_calculation_type"]
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          employee_id?: string | null
          fixed_amount?: number | null
          id?: string
          is_active?: boolean
          name: string
          percentage?: number | null
          priority?: number
          product_id?: string | null
          service_id?: string | null
          target_type: Database["public"]["Enums"]["commission_target_type"]
          updated_at?: string
        }
        Update: {
          basis?: Database["public"]["Enums"]["commission_basis"]
          business_id?: string
          calculation_type?: Database["public"]["Enums"]["commission_calculation_type"]
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          employee_id?: string | null
          fixed_amount?: number | null
          id?: string
          is_active?: boolean
          name?: string
          percentage?: number | null
          priority?: number
          product_id?: string | null
          service_id?: string | null
          target_type?: Database["public"]["Enums"]["commission_target_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_rules_business_id_employee_id_fkey"
            columns: ["business_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "commission_rules_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_business_id_product_id_fkey"
            columns: ["business_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "commission_rules_business_id_service_id_fkey"
            columns: ["business_id", "service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["business_id", "id"]
          },
        ]
      }
      commission_settlement_lines: {
        Row: {
          amount: number
          branch_id: string
          business_id: string
          commission_adjustment_id: string | null
          commission_entry_id: string | null
          created_at: string
          employee_id: string
          id: string
          line_type: string
          settlement_id: string
        }
        Insert: {
          amount: number
          branch_id: string
          business_id: string
          commission_adjustment_id?: string | null
          commission_entry_id?: string | null
          created_at?: string
          employee_id: string
          id?: string
          line_type?: string
          settlement_id: string
        }
        Update: {
          amount?: number
          branch_id?: string
          business_id?: string
          commission_adjustment_id?: string | null
          commission_entry_id?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          line_type?: string
          settlement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_settlement_lines_adjustment_fk"
            columns: ["commission_adjustment_id"]
            isOneToOne: false
            referencedRelation: "commission_adjustments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_settlement_lines_business_id_branch_id_employe_fkey1"
            columns: [
              "business_id",
              "branch_id",
              "employee_id",
              "commission_entry_id",
            ]
            isOneToOne: false
            referencedRelation: "commission_entries"
            referencedColumns: ["business_id", "branch_id", "employee_id", "id"]
          },
          {
            foreignKeyName: "commission_settlement_lines_business_id_branch_id_employee_fkey"
            columns: [
              "business_id",
              "branch_id",
              "employee_id",
              "settlement_id",
            ]
            isOneToOne: false
            referencedRelation: "commission_settlements"
            referencedColumns: ["business_id", "branch_id", "employee_id", "id"]
          },
        ]
      }
      commission_settlement_payments: {
        Row: {
          amount: number
          branch_id: string
          business_id: string
          created_at: string
          employee_id: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          reference: string | null
          settlement_id: string
        }
        Insert: {
          amount: number
          branch_id: string
          business_id: string
          created_at?: string
          employee_id: string
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          reference?: string | null
          settlement_id: string
        }
        Update: {
          amount?: number
          branch_id?: string
          business_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          reference?: string | null
          settlement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_settlement_payment_business_id_branch_id_employ_fkey"
            columns: [
              "business_id",
              "branch_id",
              "employee_id",
              "settlement_id",
            ]
            isOneToOne: false
            referencedRelation: "commission_settlements"
            referencedColumns: ["business_id", "branch_id", "employee_id", "id"]
          },
        ]
      }
      commission_settlements: {
        Row: {
          advance_amount: number
          bonus_amount: number
          branch_id: string
          business_id: string
          carryover_in_amount: number
          carryover_out_amount: number
          created_at: string
          created_by: string
          deduction_amount: number
          employee_id: string
          id: string
          loan_payment_amount: number
          paid_at: string | null
          paid_by: string | null
          paid_via: Database["public"]["Enums"]["payment_method"] | null
          period_end: string
          period_start: string
          receipt_number: string
          reference: string | null
          status: Database["public"]["Enums"]["settlement_status"]
          total_amount: number
          wage_amount: number
          window_end: string
          window_start: string
        }
        Insert: {
          advance_amount?: number
          bonus_amount?: number
          branch_id: string
          business_id: string
          carryover_in_amount?: number
          carryover_out_amount?: number
          created_at?: string
          created_by: string
          deduction_amount?: number
          employee_id: string
          id?: string
          loan_payment_amount?: number
          paid_at?: string | null
          paid_by?: string | null
          paid_via?: Database["public"]["Enums"]["payment_method"] | null
          period_end: string
          period_start: string
          receipt_number: string
          reference?: string | null
          status?: Database["public"]["Enums"]["settlement_status"]
          total_amount?: number
          wage_amount?: number
          window_end: string
          window_start: string
        }
        Update: {
          advance_amount?: number
          bonus_amount?: number
          branch_id?: string
          business_id?: string
          carryover_in_amount?: number
          carryover_out_amount?: number
          created_at?: string
          created_by?: string
          deduction_amount?: number
          employee_id?: string
          id?: string
          loan_payment_amount?: number
          paid_at?: string | null
          paid_by?: string | null
          paid_via?: Database["public"]["Enums"]["payment_method"] | null
          period_end?: string
          period_start?: string
          receipt_number?: string
          reference?: string | null
          status?: Database["public"]["Enums"]["settlement_status"]
          total_amount?: number
          wage_amount?: number
          window_end?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_settlements_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "commission_settlements_business_id_employee_id_fkey"
            columns: ["business_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["business_id", "id"]
          },
        ]
      }
      employee_attendance_exceptions: {
        Row: {
          branch_id: string
          business_id: string
          created_at: string
          created_by: string
          employee_id: string
          id: string
          kind: string
          reason: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
          work_date: string
        }
        Insert: {
          branch_id: string
          business_id: string
          created_at?: string
          created_by: string
          employee_id: string
          id?: string
          kind: string
          reason: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          work_date: string
        }
        Update: {
          branch_id?: string
          business_id?: string
          created_at?: string
          created_by?: string
          employee_id?: string
          id?: string
          kind?: string
          reason?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_attendance_exceptions_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "employee_attendance_exceptions_business_id_employee_id_fkey"
            columns: ["business_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "employee_attendance_exceptions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_ledger: {
        Row: {
          amount: number
          bonus_goal_id: string | null
          branch_id: string
          business_id: string
          cash_movement_id: string | null
          cash_session_id: string | null
          created_at: string
          created_by: string
          details: Json | null
          effective_at: string
          employee_id: string
          entry_type: string
          envelope_id: string | null
          envelope_movement_id: string | null
          generated_by_settlement: boolean
          id: string
          idempotency_key: string | null
          loan_id: string | null
          method: Database["public"]["Enums"]["payment_method"] | null
          origin_settlement_id: string | null
          paid_from: string | null
          reason: string
          receipt_effect: number | null
          reverses_entry_id: string | null
          settlement_id: string | null
          week_start: string
        }
        Insert: {
          amount: number
          bonus_goal_id?: string | null
          branch_id: string
          business_id: string
          cash_movement_id?: string | null
          cash_session_id?: string | null
          created_at?: string
          created_by: string
          details?: Json | null
          effective_at?: string
          employee_id: string
          entry_type: string
          envelope_id?: string | null
          envelope_movement_id?: string | null
          generated_by_settlement?: boolean
          id?: string
          idempotency_key?: string | null
          loan_id?: string | null
          method?: Database["public"]["Enums"]["payment_method"] | null
          origin_settlement_id?: string | null
          paid_from?: string | null
          reason: string
          receipt_effect?: number | null
          reverses_entry_id?: string | null
          settlement_id?: string | null
          week_start: string
        }
        Update: {
          amount?: number
          bonus_goal_id?: string | null
          branch_id?: string
          business_id?: string
          cash_movement_id?: string | null
          cash_session_id?: string | null
          created_at?: string
          created_by?: string
          details?: Json | null
          effective_at?: string
          employee_id?: string
          entry_type?: string
          envelope_id?: string | null
          envelope_movement_id?: string | null
          generated_by_settlement?: boolean
          id?: string
          idempotency_key?: string | null
          loan_id?: string | null
          method?: Database["public"]["Enums"]["payment_method"] | null
          origin_settlement_id?: string | null
          paid_from?: string | null
          reason?: string
          receipt_effect?: number | null
          reverses_entry_id?: string | null
          settlement_id?: string | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_ledger_bonus_goal_fk"
            columns: ["bonus_goal_id"]
            isOneToOne: false
            referencedRelation: "bonus_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_ledger_business_id_branch_id_cash_session_id_fkey"
            columns: ["business_id", "branch_id", "cash_session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["business_id", "branch_id", "id"]
          },
          {
            foreignKeyName: "employee_ledger_business_id_branch_id_employee_id_loan_id_fkey"
            columns: ["business_id", "branch_id", "employee_id", "loan_id"]
            isOneToOne: false
            referencedRelation: "employee_loans"
            referencedColumns: ["business_id", "branch_id", "employee_id", "id"]
          },
          {
            foreignKeyName: "employee_ledger_business_id_branch_id_employee_id_settleme_fkey"
            columns: [
              "business_id",
              "branch_id",
              "employee_id",
              "settlement_id",
            ]
            isOneToOne: false
            referencedRelation: "commission_settlements"
            referencedColumns: ["business_id", "branch_id", "employee_id", "id"]
          },
          {
            foreignKeyName: "employee_ledger_business_id_branch_id_envelope_id_fkey"
            columns: ["business_id", "branch_id", "envelope_id"]
            isOneToOne: false
            referencedRelation: "cash_envelopes"
            referencedColumns: ["business_id", "branch_id", "id"]
          },
          {
            foreignKeyName: "employee_ledger_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "employee_ledger_business_id_employee_id_fkey"
            columns: ["business_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "employee_ledger_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_ledger_cash_movement_id_fkey"
            columns: ["cash_movement_id"]
            isOneToOne: false
            referencedRelation: "cash_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_ledger_envelope_movement_id_fkey"
            columns: ["envelope_movement_id"]
            isOneToOne: false
            referencedRelation: "envelope_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_ledger_origin_settlement_id_fkey"
            columns: ["origin_settlement_id"]
            isOneToOne: false
            referencedRelation: "commission_settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_ledger_reverses_entry_id_fkey"
            columns: ["reverses_entry_id"]
            isOneToOne: false
            referencedRelation: "employee_ledger"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_loans: {
        Row: {
          branch_id: string
          business_id: string
          created_at: string
          created_by: string
          employee_id: string
          id: string
          principal: number
          reason: string
          weekly_amount: number
        }
        Insert: {
          branch_id: string
          business_id: string
          created_at?: string
          created_by: string
          employee_id: string
          id?: string
          principal: number
          reason: string
          weekly_amount: number
        }
        Update: {
          branch_id?: string
          business_id?: string
          created_at?: string
          created_by?: string
          employee_id?: string
          id?: string
          principal?: number
          reason?: string
          weekly_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_loans_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "employee_loans_business_id_employee_id_fkey"
            columns: ["business_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "employee_loans_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_time_off: {
        Row: {
          branch_id: string
          business_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string
          employee_id: string
          ends_at: string
          id: string
          reason: string
          requested_at: string
          requested_via: string
          starts_at: string
        }
        Insert: {
          branch_id: string
          business_id: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by: string
          employee_id: string
          ends_at: string
          id?: string
          reason: string
          requested_at: string
          requested_via: string
          starts_at: string
        }
        Update: {
          branch_id?: string
          business_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string
          employee_id?: string
          ends_at?: string
          id?: string
          reason?: string
          requested_at?: string
          requested_via?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_time_off_branch_fk"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "employee_time_off_employee_fk"
            columns: ["business_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["business_id", "id"]
          },
        ]
      }
      employee_wage_rates: {
        Row: {
          branch_id: string
          business_id: string
          created_at: string
          created_by: string
          daily_amount: number
          effective_from: string
          employee_id: string
          id: string
          reason: string
          work_days: number[]
        }
        Insert: {
          branch_id: string
          business_id: string
          created_at?: string
          created_by: string
          daily_amount: number
          effective_from: string
          employee_id: string
          id?: string
          reason: string
          work_days: number[]
        }
        Update: {
          branch_id?: string
          business_id?: string
          created_at?: string
          created_by?: string
          daily_amount?: number
          effective_from?: string
          employee_id?: string
          id?: string
          reason?: string
          work_days?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "employee_wage_rates_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "employee_wage_rates_business_id_employee_id_fkey"
            columns: ["business_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "employee_wage_rates_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_weekly_schedule: {
        Row: {
          business_id: string
          employee_id: string
          ends: string | null
          is_off: boolean
          starts: string | null
          updated_at: string
          updated_by: string
          weekday: number
        }
        Insert: {
          business_id: string
          employee_id: string
          ends?: string | null
          is_off?: boolean
          starts?: string | null
          updated_at?: string
          updated_by: string
          weekday: number
        }
        Update: {
          business_id?: string
          employee_id?: string
          ends?: string | null
          is_off?: boolean
          starts?: string | null
          updated_at?: string
          updated_by?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "employee_weekly_schedule_employee_fk"
            columns: ["business_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["business_id", "id"]
          },
        ]
      }
      employees: {
        Row: {
          accepts_online_booking: boolean
          business_id: string
          can_authorize_discounts: boolean
          created_at: string
          display_name: string
          display_title: string | null
          id: string
          is_active: boolean
          is_barber: boolean
          phone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          accepts_online_booking?: boolean
          business_id: string
          can_authorize_discounts?: boolean
          created_at?: string
          display_name: string
          display_title?: string | null
          id?: string
          is_active?: boolean
          is_barber?: boolean
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          accepts_online_booking?: boolean
          business_id?: string
          can_authorize_discounts?: boolean
          created_at?: string
          display_name?: string
          display_title?: string | null
          id?: string
          is_active?: boolean
          is_barber?: boolean
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_business_id_user_id_fkey"
            columns: ["business_id", "user_id"]
            isOneToOne: true
            referencedRelation: "business_memberships"
            referencedColumns: ["business_id", "user_id"]
          },
        ]
      }
      envelope_movements: {
        Row: {
          amount: number
          branch_id: string
          business_id: string
          cash_session_id: string | null
          created_at: string
          created_by: string
          direction: Database["public"]["Enums"]["cash_direction"]
          envelope_id: string
          expense_id: string | null
          id: string
          idempotency_key: string | null
          reason: string | null
          source: string
        }
        Insert: {
          amount: number
          branch_id: string
          business_id: string
          cash_session_id?: string | null
          created_at?: string
          created_by: string
          direction: Database["public"]["Enums"]["cash_direction"]
          envelope_id: string
          expense_id?: string | null
          id?: string
          idempotency_key?: string | null
          reason?: string | null
          source: string
        }
        Update: {
          amount?: number
          branch_id?: string
          business_id?: string
          cash_session_id?: string | null
          created_at?: string
          created_by?: string
          direction?: Database["public"]["Enums"]["cash_direction"]
          envelope_id?: string
          expense_id?: string | null
          id?: string
          idempotency_key?: string | null
          reason?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "envelope_movements_business_id_branch_id_cash_session_id_fkey"
            columns: ["business_id", "branch_id", "cash_session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["business_id", "branch_id", "id"]
          },
          {
            foreignKeyName: "envelope_movements_business_id_branch_id_envelope_id_fkey"
            columns: ["business_id", "branch_id", "envelope_id"]
            isOneToOne: false
            referencedRelation: "cash_envelopes"
            referencedColumns: ["business_id", "branch_id", "id"]
          },
          {
            foreignKeyName: "envelope_movements_business_id_branch_id_expense_id_fkey"
            columns: ["business_id", "branch_id", "expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["business_id", "branch_id", "id"]
          },
          {
            foreignKeyName: "envelope_movements_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "envelope_movements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          affects_profit: boolean
          business_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          affects_profit?: boolean
          business_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          affects_profit?: boolean
          business_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          branch_id: string
          business_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cash_session_id: string | null
          category: string
          category_id: string
          created_at: string
          created_by: string
          description: string
          envelope_id: string | null
          id: string
          idempotency_key: string | null
          incurred_at: string
          method: Database["public"]["Enums"]["payment_method"]
          paid_from: string
          receipt_path: string | null
          recurring_expense_id: string | null
          status: Database["public"]["Enums"]["expense_status"]
          updated_at: string
          vendor: string | null
        }
        Insert: {
          amount: number
          branch_id: string
          business_id: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cash_session_id?: string | null
          category: string
          category_id: string
          created_at?: string
          created_by: string
          description: string
          envelope_id?: string | null
          id?: string
          idempotency_key?: string | null
          incurred_at?: string
          method: Database["public"]["Enums"]["payment_method"]
          paid_from?: string
          receipt_path?: string | null
          recurring_expense_id?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          amount?: number
          branch_id?: string
          business_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cash_session_id?: string | null
          category?: string
          category_id?: string
          created_at?: string
          created_by?: string
          description?: string
          envelope_id?: string | null
          id?: string
          idempotency_key?: string | null
          incurred_at?: string
          method?: Database["public"]["Enums"]["payment_method"]
          paid_from?: string
          receipt_path?: string | null
          recurring_expense_id?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_business_id_branch_id_cash_session_id_fkey"
            columns: ["business_id", "branch_id", "cash_session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["business_id", "branch_id", "id"]
          },
          {
            foreignKeyName: "expenses_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "expenses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_fk"
            columns: ["business_id", "category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "expenses_envelope_fk"
            columns: ["business_id", "branch_id", "envelope_id"]
            isOneToOne: false
            referencedRelation: "cash_envelopes"
            referencedColumns: ["business_id", "branch_id", "id"]
          },
          {
            foreignKeyName: "expenses_recurring_fk"
            columns: ["business_id", "branch_id", "recurring_expense_id"]
            isOneToOne: false
            referencedRelation: "recurring_expenses"
            referencedColumns: ["business_id", "branch_id", "id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          branch_id: string
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          notes: string | null
          product_id: string
          quantity_delta: number
          reference: string | null
          unit_cost_snapshot: number | null
        }
        Insert: {
          branch_id: string
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          notes?: string | null
          product_id: string
          quantity_delta: number
          reference?: string | null
          unit_cost_snapshot?: number | null
        }
        Update: {
          branch_id?: string
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          movement_type?: Database["public"]["Enums"]["stock_movement_type"]
          notes?: string | null
          product_id?: string
          quantity_delta?: number
          reference?: string | null
          unit_cost_snapshot?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "inventory_movements_business_id_product_id_fkey"
            columns: ["business_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["business_id", "id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          branch_id: string
          business_id: string
          id: string
          idempotency_key: string | null
          method: Database["public"]["Enums"]["payment_method"]
          processed_at: string
          processed_by: string | null
          reference: string | null
          sale_id: string
          status: Database["public"]["Enums"]["payment_status"]
        }
        Insert: {
          amount: number
          branch_id: string
          business_id: string
          id?: string
          idempotency_key?: string | null
          method: Database["public"]["Enums"]["payment_method"]
          processed_at?: string
          processed_by?: string | null
          reference?: string | null
          sale_id: string
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Update: {
          amount?: number
          branch_id?: string
          business_id?: string
          id?: string
          idempotency_key?: string | null
          method?: Database["public"]["Enums"]["payment_method"]
          processed_at?: string
          processed_by?: string | null
          reference?: string | null
          sale_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payments_business_id_branch_id_sale_id_fkey"
            columns: ["business_id", "branch_id", "sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["business_id", "branch_id", "id"]
          },
        ]
      }
      products: {
        Row: {
          business_id: string
          cost_price: number | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sale_price: number
          sku: string | null
          tracks_inventory: boolean
          updated_at: string
        }
        Insert: {
          business_id: string
          cost_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sale_price: number
          sku?: string | null
          tracks_inventory?: boolean
          updated_at?: string
        }
        Update: {
          business_id?: string
          cost_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sale_price?: number
          sku?: string | null
          tracks_inventory?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reconciliation_reviews: {
        Row: {
          appointment_id: string | null
          batch_id: string | null
          branch_id: string
          business_id: string
          created_at: string
          created_by: string
          decision: string
          employee_id: string | null
          id: number
          issue_day: string
          issue_key: string
          issue_kind: string
          reason: string
          sale_id: string | null
          sale_item_id: string | null
        }
        Insert: {
          appointment_id?: string | null
          batch_id?: string | null
          branch_id: string
          business_id: string
          created_at?: string
          created_by: string
          decision: string
          employee_id?: string | null
          id?: never
          issue_day: string
          issue_key: string
          issue_kind: string
          reason: string
          sale_id?: string | null
          sale_item_id?: string | null
        }
        Update: {
          appointment_id?: string | null
          batch_id?: string | null
          branch_id?: string
          business_id?: string
          created_at?: string
          created_by?: string
          decision?: string
          employee_id?: string | null
          id?: never
          issue_day?: string
          issue_key?: string
          issue_kind?: string
          reason?: string
          sale_id?: string | null
          sale_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_reviews_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_reviews_branch_fk"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "reconciliation_reviews_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_reviews_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: false
            referencedRelation: "sale_items"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_expenses: {
        Row: {
          branch_id: string
          business_id: string
          category_id: string
          created_at: string
          created_by: string
          day_of_month: number
          every_months: number
          id: string
          is_active: boolean
          is_estimate: boolean
          method: Database["public"]["Enums"]["payment_method"]
          name: string
          paid_from: string
          sort_order: number
          suggested_amount: number
          updated_at: string
          vendor: string | null
        }
        Insert: {
          branch_id: string
          business_id: string
          category_id: string
          created_at?: string
          created_by: string
          day_of_month: number
          every_months?: number
          id?: string
          is_active?: boolean
          is_estimate?: boolean
          method: Database["public"]["Enums"]["payment_method"]
          name: string
          paid_from: string
          sort_order?: number
          suggested_amount: number
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          branch_id?: string
          business_id?: string
          category_id?: string
          created_at?: string
          created_by?: string
          day_of_month?: number
          every_months?: number
          id?: string
          is_active?: boolean
          is_estimate?: boolean
          method?: Database["public"]["Enums"]["payment_method"]
          name?: string
          paid_from?: string
          sort_order?: number
          suggested_amount?: number
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expenses_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "recurring_expenses_business_id_category_id_fkey"
            columns: ["business_id", "category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "recurring_expenses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      report_exports: {
        Row: {
          audience: string
          branch_id: string
          business_id: string
          folio: string
          generated_at: string
          generated_by: string
          id: string
          period_from: string
          period_to: string
          sha256: string
          snapshot: Json
        }
        Insert: {
          audience: string
          branch_id: string
          business_id: string
          folio: string
          generated_at?: string
          generated_by: string
          id?: string
          period_from: string
          period_to: string
          sha256: string
          snapshot: Json
        }
        Update: {
          audience?: string
          branch_id?: string
          business_id?: string
          folio?: string
          generated_at?: string
          generated_by?: string
          id?: string
          period_from?: string
          period_to?: string
          sha256?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "report_exports_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_exports_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      report_folio_counters: {
        Row: {
          business_id: string
          last_number: number
        }
        Insert: {
          business_id: string
          last_number?: number
        }
        Update: {
          business_id?: string
          last_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_folio_counters_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          branch_id: string
          business_id: string
          commission_employee_id: string | null
          created_at: string
          discount_amount: number
          employee_id: string | null
          id: string
          item_name_snapshot: string
          item_type: Database["public"]["Enums"]["sale_item_type"]
          line_total: number
          product_id: string | null
          quantity: number
          sale_id: string
          service_id: string | null
          unit_cost_snapshot: number | null
          unit_price: number
        }
        Insert: {
          branch_id: string
          business_id: string
          commission_employee_id?: string | null
          created_at?: string
          discount_amount?: number
          employee_id?: string | null
          id?: string
          item_name_snapshot: string
          item_type: Database["public"]["Enums"]["sale_item_type"]
          line_total: number
          product_id?: string | null
          quantity?: number
          sale_id: string
          service_id?: string | null
          unit_cost_snapshot?: number | null
          unit_price: number
        }
        Update: {
          branch_id?: string
          business_id?: string
          commission_employee_id?: string | null
          created_at?: string
          discount_amount?: number
          employee_id?: string | null
          id?: string
          item_name_snapshot?: string
          item_type?: Database["public"]["Enums"]["sale_item_type"]
          line_total?: number
          product_id?: string | null
          quantity?: number
          sale_id?: string
          service_id?: string | null
          unit_cost_snapshot?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_business_id_branch_id_sale_id_fkey"
            columns: ["business_id", "branch_id", "sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["business_id", "branch_id", "id"]
          },
          {
            foreignKeyName: "sale_items_business_id_commission_employee_id_fkey"
            columns: ["business_id", "commission_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "sale_items_business_id_employee_id_fkey"
            columns: ["business_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "sale_items_business_id_product_id_fkey"
            columns: ["business_id", "product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "sale_items_business_id_service_id_fkey"
            columns: ["business_id", "service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["business_id", "id"]
          },
        ]
      }
      sale_reversals: {
        Row: {
          branch_id: string
          business_id: string
          created_at: string
          created_by: string
          id: string
          reason: string
          sale_id: string
        }
        Insert: {
          branch_id: string
          business_id: string
          created_at?: string
          created_by: string
          id?: string
          reason: string
          sale_id: string
        }
        Update: {
          branch_id?: string
          business_id?: string
          created_at?: string
          created_by?: string
          id?: string
          reason?: string
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_reversals_sale_fk"
            columns: ["business_id", "branch_id", "sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["business_id", "branch_id", "id"]
          },
        ]
      }
      sale_tips: {
        Row: {
          amount: number
          branch_id: string
          business_id: string
          created_at: string
          created_by: string
          employee_id: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          reversal_reason: string | null
          reversed_at: string | null
          sale_id: string
          settlement_id: string | null
          status: Database["public"]["Enums"]["commission_entry_status"]
        }
        Insert: {
          amount: number
          branch_id: string
          business_id: string
          created_at?: string
          created_by: string
          employee_id: string
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          reversal_reason?: string | null
          reversed_at?: string | null
          sale_id: string
          settlement_id?: string | null
          status?: Database["public"]["Enums"]["commission_entry_status"]
        }
        Update: {
          amount?: number
          branch_id?: string
          business_id?: string
          created_at?: string
          created_by?: string
          employee_id?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          reversal_reason?: string | null
          reversed_at?: string | null
          sale_id?: string
          settlement_id?: string | null
          status?: Database["public"]["Enums"]["commission_entry_status"]
        }
        Relationships: [
          {
            foreignKeyName: "sale_tips_employee_fk"
            columns: ["business_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "sale_tips_sale_fk"
            columns: ["business_id", "branch_id", "sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["business_id", "branch_id", "id"]
          },
          {
            foreignKeyName: "sale_tips_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "commission_settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          appointment_id: string | null
          branch_id: string
          business_id: string
          client_id: string | null
          created_at: string
          created_by: string | null
          discount_amount: number
          discount_authorized_by: string | null
          discount_reason: string | null
          folio: string
          id: string
          idempotency_key: string | null
          notes: string | null
          paid_at: string | null
          status: Database["public"]["Enums"]["sale_status"]
          subtotal_amount: number
          tax_amount: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          branch_id: string
          business_id: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          discount_authorized_by?: string | null
          discount_reason?: string | null
          folio: string
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["sale_status"]
          subtotal_amount?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          branch_id?: string
          business_id?: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          discount_authorized_by?: string | null
          discount_reason?: string | null
          folio?: string
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["sale_status"]
          subtotal_amount?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_business_id_branch_id_appointment_id_fkey"
            columns: ["business_id", "branch_id", "appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["business_id", "branch_id", "id"]
          },
          {
            foreignKeyName: "sales_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "sales_business_id_client_id_fkey"
            columns: ["business_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "sales_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          bookable_online: boolean
          business_id: string
          category: string
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          is_active: boolean
          name: string
          price: number
          sort_order: number
          updated_at: string
          variable_price: boolean
        }
        Insert: {
          bookable_online?: boolean
          business_id: string
          category?: string
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          name: string
          price: number
          sort_order?: number
          updated_at?: string
          variable_price?: boolean
        }
        Update: {
          bookable_online?: boolean
          business_id?: string
          category?: string
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          sort_order?: number
          updated_at?: string
          variable_price?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "services_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      user_branch_access: {
        Row: {
          branch_id: string
          business_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          branch_id: string
          business_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          branch_id?: string
          business_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_branch_access_business_id_branch_id_fkey"
            columns: ["business_id", "branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["business_id", "id"]
          },
          {
            foreignKeyName: "user_branch_access_business_id_user_id_fkey"
            columns: ["business_id", "user_id"]
            isOneToOne: false
            referencedRelation: "business_memberships"
            referencedColumns: ["business_id", "user_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_pre_agenda_sales: { Args: { p_branch_id: string }; Returns: Json }
      add_appointment_product: {
        Args: {
          p_appointment_id: string
          p_product_id: string
          p_quantity?: number
          p_seller_employee_id?: string
        }
        Returns: Json
      }
      adjust_inventory_stock: {
        Args: {
          p_branch_id: string
          p_notes: string
          p_product_id: string
          p_quantity_delta: number
        }
        Returns: Json
      }
      adjust_inventory_stock_confirmed: {
        Args: {
          p_branch_id: string
          p_comment: string
          p_product_id: string
          p_quantity_delta: number
        }
        Returns: Json
      }
      agenda_reconciliation: {
        Args: { p_branch_id: string; p_from: string; p_to: string }
        Returns: Json
      }
      app_feedback_counters: { Args: { p_business_id: string }; Returns: Json }
      appointment_products_read: {
        Args: { p_appointment_ids: string[]; p_branch_id: string }
        Returns: Json
      }
      assert_can_manage_account: {
        Args: {
          p_actor_user_id: string
          p_business_id: string
          p_user_id: string
        }
        Returns: Json
      }
      bonus_goal_progress: {
        Args: {
          p_branch_id: string
          p_employee_id?: string
          p_period_start?: string
        }
        Returns: Json
      }
      booking_availability: {
        Args: {
          p_barber_id: string
          p_client: string
          p_date: string
          p_service_id: string
          p_slug: string
        }
        Returns: Json
      }
      booking_cancel: {
        Args: { p_slug: string; p_token: string }
        Returns: Json
      }
      booking_config: { Args: { p_slug: string }; Returns: Json }
      booking_create: {
        Args: {
          p_accept_privacy: boolean
          p_barber_id: string
          p_client: string
          p_date: string
          p_name: string
          p_phone: string
          p_service_id: string
          p_slug: string
          p_time: string
        }
        Returns: Json
      }
      booking_days: {
        Args: {
          p_barber_id: string
          p_client: string
          p_from: string
          p_service_id: string
          p_slug: string
          p_to: string
        }
        Returns: Json
      }
      booking_get: { Args: { p_slug: string; p_token: string }; Returns: Json }
      bootstrap_first_owner: {
        Args: {
          p_branch_name: string
          p_business_name: string
          p_business_slug: string
          p_owner_name: string
          p_owner_user_id: string
          p_timezone?: string
        }
        Returns: Json
      }
      break_even_period: {
        Args: { p_branch_id: string; p_month?: string }
        Returns: Json
      }
      business_full_report: {
        Args: {
          p_audience: string
          p_branch_id: string
          p_from: string
          p_to: string
        }
        Returns: Json
      }
      business_metrics: {
        Args: {
          p_branch_id: string
          p_employee_id?: string
          p_from: string
          p_to: string
        }
        Returns: Json
      }
      business_report: {
        Args: {
          p_branch_id: string
          p_employee_id?: string
          p_from?: string
          p_period: string
          p_to?: string
        }
        Returns: Json
      }
      cancel_employee_ledger_entry: {
        Args: { p_entry_id: string; p_reason: string }
        Returns: Json
      }
      cancel_expense: {
        Args: { p_expense_id: string; p_reason: string }
        Returns: Json
      }
      cancel_time_off: {
        Args: { p_reason: string; p_time_off_id: string }
        Returns: Json
      }
      change_appointment_status: {
        Args: {
          p_appointment_id: string
          p_reason?: string
          p_status: Database["public"]["Enums"]["appointment_status"]
        }
        Returns: {
          arrived_at: string | null
          assigned_employee_id: string | null
          branch_id: string
          business_id: string
          client_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_name: string
          customer_phone: string | null
          id: string
          notes: string | null
          scheduled_end_at: string | null
          scheduled_start_at: string | null
          source: Database["public"]["Enums"]["appointment_source"]
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "appointments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      client_history: { Args: { p_client_id: string }; Returns: Json }
      client_summaries: {
        Args: { p_branch_id: string; p_client_ids?: string[] }
        Returns: {
          client_id: string
          last_visit_at: string
          next_appointment_at: string
          next_appointment_id: string
          no_shows: number
          total_spent: number
          visits: number
        }[]
      }
      close_cash_session: {
        Args: {
          p_breakdown?: Json
          p_cash_session_id: string
          p_counted_cash: number
          p_difference_reason?: string
          p_float_left?: number
          p_reserve_amount?: number
          p_short_float_reason?: string
          p_withdrawal_delivered_to?: string
        }
        Returns: Json
      }
      confirm_sale: {
        Args: {
          p_appointment_id?: string
          p_branch_id: string
          p_client_id?: string
          p_discount_approval_id?: string
          p_discount_authorized_by?: string
          p_discount_reason?: string
          p_idempotency_key: string
          p_items: Json
          p_notes?: string
          p_payments: Json
          p_tips?: Json
        }
        Returns: Json
      }
      create_app_feedback: {
        Args: {
          p_body: string
          p_business_id: string
          p_device?: string
          p_kind: string
          p_screen_path?: string
        }
        Returns: Json
      }
      create_catalog_product: {
        Args: {
          p_branch_id: string
          p_cost_price: number
          p_description: string
          p_initial_stock: number
          p_minimum_quantity?: number
          p_name: string
          p_sale_price: number
          p_sku: string
        }
        Returns: Json
      }
      create_initial_haircut_service: {
        Args: {
          p_branch_id: string
          p_business_id: string
          p_duration_minutes?: number
          p_name: string
          p_price: number
        }
        Returns: Json
      }
      create_time_off: {
        Args: {
          p_branch_id: string
          p_employee_id: string
          p_ends_at: string
          p_reason: string
          p_requested_at: string
          p_requested_via: string
          p_starts_at: string
        }
        Returns: Json
      }
      employee_ledger_list: {
        Args: {
          p_branch_id?: string
          p_employee_id?: string
          p_from?: string
          p_limit?: number
          p_to?: string
        }
        Returns: {
          amount: number
          bonus_goal_id: string
          branch_id: string
          created_at: string
          created_by: string
          effective_at: string
          employee_id: string
          employee_name: string
          entry_type: string
          id: string
          is_pending: boolean
          loan_id: string
          method: Database["public"]["Enums"]["payment_method"]
          origin_settlement_id: string
          paid_from: string
          reason: string
          receipt_effect: number
          receipt_number: string
          reversed_by_entry_id: string
          reverses_entry_id: string
          settlement_id: string
          week_start: string
        }[]
      }
      employee_loans_with_balance: {
        Args: { p_branch_id?: string; p_employee_id?: string }
        Returns: {
          branch_id: string
          created_at: string
          created_by: string
          employee_id: string
          id: string
          outstanding: number
          paid: number
          principal: number
          reason: string
          status: string
          weekly_amount: number
        }[]
      }
      employee_wage_week: {
        Args: {
          p_branch_id: string
          p_employee_id?: string
          p_period_start?: string
        }
        Returns: Json
      }
      envelope_adjust_confirmed: {
        Args: {
          p_comment: string
          p_counted_balance: number
          p_envelope_id: string
          p_idempotency_key?: string
        }
        Returns: Json
      }
      envelope_balance: {
        Args: { p_branch_id?: string }
        Returns: {
          balance: number
          branch_id: string
          envelope_id: string
          is_active: boolean
          is_default: boolean
          last_movement_at: string
          movements: number
          name: string
          total_in: number
          total_out: number
        }[]
      }
      envelope_bank_deposit_confirmed: {
        Args: {
          p_amount: number
          p_comment: string
          p_envelope_id: string
          p_idempotency_key?: string
        }
        Returns: Json
      }
      envelope_movements_list: {
        Args: {
          p_envelope_id: string
          p_from?: string
          p_limit?: number
          p_to?: string
        }
        Returns: {
          amount: number
          balance_after: number
          cash_session_id: string
          created_at: string
          created_by: string
          direction: Database["public"]["Enums"]["cash_direction"]
          envelope_id: string
          expense_id: string
          id: string
          reason: string
          signed_amount: number
          source: string
        }[]
      }
      get_booking_settings: { Args: { p_business_id: string }; Returns: Json }
      get_settlement_receipt: {
        Args: { p_settlement_id: string }
        Returns: Json
      }
      issue_discount_approval: {
        Args: {
          p_branch_id: string
          p_max_amount: number
          p_reason: string
          p_requested_by: string
        }
        Returns: Json
      }
      list_audit_log: {
        Args: {
          p_action?: string
          p_branch_id: string
          p_from?: string
          p_limit?: number
          p_role?: string
          p_to?: string
        }
        Returns: Json
      }
      list_discount_authorizers: {
        Args: { p_branch_id: string }
        Returns: Json
      }
      login_attempt_check: { Args: { p_login_id: string }; Returns: number }
      login_attempt_failed: { Args: { p_login_id: string }; Returns: number }
      login_attempt_succeeded: {
        Args: { p_login_id: string }
        Returns: undefined
      }
      mark_app_feedback_seen: {
        Args: { p_business_id: string }
        Returns: number
      }
      mark_pin_reset: {
        Args: {
          p_actor_user_id: string
          p_business_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      member_display_names: {
        Args: { p_business_id: string; p_user_ids: string[] }
        Returns: {
          display_name: string
          user_id: string
        }[]
      }
      my_account_status: { Args: never; Returns: Json }
      open_cash_session: {
        Args: {
          p_branch_id: string
          p_opening_cash: number
          p_opening_reason?: string
        }
        Returns: Json
      }
      pending_recurring_expenses: {
        Args: { p_branch_id: string; p_month?: string }
        Returns: {
          category_id: string
          category_name: string
          day_of_month: number
          due_on: string
          id: string
          is_overdue: boolean
          method: Database["public"]["Enums"]["payment_method"]
          name: string
          paid_from: string
          suggested_amount: number
          vendor: string
        }[]
      }
      pin_changed: { Args: never; Returns: boolean }
      preview_commission_settlement: {
        Args: {
          p_branch_id: string
          p_employee_id: string
          p_period_end: string
          p_period_start: string
        }
        Returns: Json
      }
      product_costs: {
        Args: { p_branch_id: string }
        Returns: {
          cost_price: number
          product_id: string
        }[]
      }
      product_seller_options: { Args: { p_branch_id: string }; Returns: Json }
      provision_account: {
        Args: {
          p_actor_user_id: string
          p_business_id: string
          p_employee_id: string
          p_full_name: string
          p_login_name: string
          p_role: Database["public"]["Enums"]["business_role"]
          p_user_id: string
        }
        Returns: Json
      }
      public_catalog: { Args: { p_slug: string }; Returns: Json }
      receive_inventory_stock: {
        Args: {
          p_branch_id: string
          p_comment: string
          p_product_id: string
          p_quantity: number
        }
        Returns: Json
      }
      record_appointment_notification: {
        Args: { p_appointment_id: string; p_kind: string }
        Returns: Json
      }
      record_attendance_exception: {
        Args: {
          p_branch_id: string
          p_employee_id: string
          p_kind: string
          p_reason: string
          p_work_date: string
        }
        Returns: Json
      }
      record_cash_movement: {
        Args: {
          p_amount: number
          p_cash_session_id: string
          p_description: string
          p_method: Database["public"]["Enums"]["payment_method"]
          p_movement_type: Database["public"]["Enums"]["cash_movement_type"]
        }
        Returns: Json
      }
      record_cash_movement_confirmed: {
        Args: {
          p_amount: number
          p_cash_session_id: string
          p_description: string
          p_method: Database["public"]["Enums"]["payment_method"]
          p_movement_type: Database["public"]["Enums"]["cash_movement_type"]
        }
        Returns: Json
      }
      record_employee_ledger_entry: {
        Args: {
          p_amount: number
          p_branch_id: string
          p_employee_id: string
          p_entry_type: string
          p_envelope_id?: string
          p_idempotency_key?: string
          p_loan_id?: string
          p_method?: Database["public"]["Enums"]["payment_method"]
          p_paid_from?: string
          p_reason: string
          p_weekly_amount?: number
        }
        Returns: Json
      }
      record_expense: {
        Args: {
          p_amount: number
          p_branch_id: string
          p_category_id: string
          p_comment?: string
          p_description: string
          p_envelope_id?: string
          p_idempotency_key?: string
          p_incurred_on?: string
          p_method?: Database["public"]["Enums"]["payment_method"]
          p_paid_from: string
          p_receipt_path?: string
          p_recurring_expense_id?: string
          p_vendor?: string
        }
        Returns: Json
      }
      record_sale_payment: {
        Args: {
          p_amount: number
          p_idempotency_key: string
          p_method: Database["public"]["Enums"]["payment_method"]
          p_reference?: string
          p_sale_id: string
        }
        Returns: Json
      }
      register_report_export: {
        Args: {
          p_audience: string
          p_branch_id: string
          p_from: string
          p_to: string
        }
        Returns: Json
      }
      remove_appointment_product: {
        Args: { p_line_id: string; p_quantity?: number }
        Returns: Json
      }
      reorder_recurring_expenses: {
        Args: { p_branch_id: string; p_ids: string[] }
        Returns: Json
      }
      retract_app_feedback: { Args: { p_feedback_id: string }; Returns: Json }
      reverse_sale: {
        Args: { p_reason: string; p_sale_id: string }
        Returns: Json
      }
      reverse_sale_confirmed: {
        Args: { p_reason: string; p_sale_id: string }
        Returns: Json
      }
      review_app_feedback: {
        Args: { p_feedback_id: string; p_reply?: string; p_status?: string }
        Returns: Json
      }
      review_commission_adjustment: {
        Args: { p_adjustment_id: string; p_approve: boolean; p_note: string }
        Returns: Json
      }
      review_reconciliation_issue: {
        Args: {
          p_branch_id: string
          p_decision: string
          p_issue_key: string
          p_reason: string
        }
        Returns: Json
      }
      sale_item_costs: {
        Args: { p_branch_id: string; p_sale_ids: string[] }
        Returns: {
          sale_item_id: string
          unit_cost_snapshot: number
        }[]
      }
      save_appointment: {
        Args: {
          p_appointment_id?: string
          p_barber_id?: string
          p_branch_id: string
          p_client_id?: string
          p_customer_name?: string
          p_customer_phone?: string
          p_duration_minutes?: number
          p_idempotency_key?: string
          p_notes?: string
          p_service_ids?: string[]
          p_start?: string
        }
        Returns: Json
      }
      save_bonus_goal: {
        Args: {
          p_applies_to?: string
          p_bonus_amount?: number
          p_branch_id: string
          p_clear_valid_to?: boolean
          p_employee_id?: string
          p_id?: string
          p_is_active?: boolean
          p_metric?: string
          p_name?: string
          p_threshold?: number
          p_valid_from?: string
          p_valid_to?: string
        }
        Returns: Json
      }
      save_expense_category: {
        Args: {
          p_business_id: string
          p_id?: string
          p_is_active?: boolean
          p_name?: string
          p_sort_order?: number
        }
        Returns: Json
      }
      save_recurring_expense: {
        Args: {
          p_branch_id: string
          p_category_id?: string
          p_day_of_month?: number
          p_every_months?: number
          p_id?: string
          p_is_active?: boolean
          p_is_estimate?: boolean
          p_method?: Database["public"]["Enums"]["payment_method"]
          p_name?: string
          p_paid_from?: string
          p_sort_order?: number
          p_suggested_amount?: number
          p_vendor?: string
        }
        Returns: Json
      }
      server_pin_pepper: { Args: never; Returns: string }
      set_account_active: {
        Args: { p_active: boolean; p_business_id: string; p_user_id: string }
        Returns: Json
      }
      set_appointment_product_seller: {
        Args: { p_line_id: string; p_seller_employee_id: string }
        Returns: Json
      }
      set_booking_settings: {
        Args: {
          p_business_id: string
          p_cancel_hours?: number
          p_comment?: string
          p_enabled: boolean
          p_lead_minutes?: number
          p_max_days_ahead?: number
          p_max_online_per_day?: number
        }
        Returns: Json
      }
      set_cash_settings: {
        Args: {
          p_branch_id: string
          p_float_target: number
          p_reserve_amount: number
          p_reserve_label: string
        }
        Returns: Json
      }
      set_cash_settings_confirmed: {
        Args: {
          p_branch_id: string
          p_comment: string
          p_float_target: number
          p_reserve_amount: number
          p_reserve_label: string
        }
        Returns: Json
      }
      set_commission_defaults: {
        Args: {
          p_business_id: string
          p_product_pct: number
          p_service_pct: number
        }
        Returns: Json
      }
      set_employee_discount_permission: {
        Args: { p_allowed: boolean; p_employee_id: string }
        Returns: Json
      }
      set_employee_display_title: {
        Args: { p_employee_id: string; p_title: string }
        Returns: Json
      }
      set_employee_schedule: {
        Args: { p_days: Json; p_employee_id: string }
        Returns: Json
      }
      set_employee_wage: {
        Args: {
          p_branch_id: string
          p_daily_amount: number
          p_effective_from?: string
          p_employee_id: string
          p_reason: string
          p_work_days: number[]
        }
        Returns: Json
      }
      set_expense_receipt: {
        Args: { p_expense_id: string; p_receipt_path: string }
        Returns: Json
      }
      set_inventory_minimum: {
        Args: {
          p_branch_id: string
          p_minimum_quantity: number
          p_product_id: string
        }
        Returns: Json
      }
      set_inventory_minimum_confirmed: {
        Args: {
          p_branch_id: string
          p_comment: string
          p_minimum_quantity: number
          p_product_id: string
        }
        Returns: Json
      }
      settle_commissions: {
        Args: {
          p_branch_id: string
          p_employee_id: string
          p_payments: Json
          p_period_end: string
          p_period_start: string
        }
        Returns: Json
      }
      staff_cost_lines: {
        Args: { p_branch_id: string; p_end: string; p_start: string }
        Returns: {
          amount: number
          cost_date: string
          employee_id: string
          kind: string
        }[]
      }
      team_ranking: {
        Args: { p_branch_id: string; p_from: string; p_to: string }
        Returns: Json
      }
      update_business_profile: {
        Args: {
          p_address: string
          p_branch_id: string
          p_business_id: string
          p_currency: string
          p_name: string
          p_phone: string
          p_settings: Json
          p_timezone: string
        }
        Returns: Json
      }
      verify_report_export: {
        Args: { p_code: string; p_folio: string }
        Returns: Json
      }
      void_attendance_exception: {
        Args: { p_exception_id: string; p_reason: string }
        Returns: Json
      }
      weekly_cuts_podium: { Args: { p_branch_id: string }; Returns: Json }
    }
    Enums: {
      appointment_source: "appointment" | "walk_in" | "online"
      appointment_status:
        | "scheduled"
        | "confirmed"
        | "checked_in"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "no_show"
      business_role:
        | "owner"
        | "admin"
        | "cashier"
        | "receptionist"
        | "barber"
        | "viewer"
      cash_direction: "in" | "out"
      cash_movement_type:
        | "sale_payment"
        | "expense"
        | "withdrawal"
        | "deposit"
        | "refund"
        | "adjustment"
      cash_session_status: "open" | "closed"
      commission_basis: "price_before_discount" | "price_after_discount"
      commission_calculation_type: "percentage" | "fixed_amount"
      commission_entry_status: "generated" | "reversed"
      commission_target_type: "service" | "product"
      expense_status: "posted" | "cancelled"
      payment_method: "cash" | "card" | "transfer" | "other"
      payment_status: "confirmed" | "reversed"
      sale_item_type: "service" | "product"
      sale_status:
        | "open"
        | "partially_paid"
        | "paid"
        | "cancelled"
        | "partially_refunded"
        | "refunded"
      settlement_status: "draft" | "paid" | "cancelled"
      stock_movement_type:
        | "purchase"
        | "sale"
        | "adjustment"
        | "waste"
        | "return_in"
        | "return_out"
        | "initial"
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
      appointment_source: ["appointment", "walk_in", "online"],
      appointment_status: [
        "scheduled",
        "confirmed",
        "checked_in",
        "in_progress",
        "completed",
        "cancelled",
        "no_show",
      ],
      business_role: [
        "owner",
        "admin",
        "cashier",
        "receptionist",
        "barber",
        "viewer",
      ],
      cash_direction: ["in", "out"],
      cash_movement_type: [
        "sale_payment",
        "expense",
        "withdrawal",
        "deposit",
        "refund",
        "adjustment",
      ],
      cash_session_status: ["open", "closed"],
      commission_basis: ["price_before_discount", "price_after_discount"],
      commission_calculation_type: ["percentage", "fixed_amount"],
      commission_entry_status: ["generated", "reversed"],
      commission_target_type: ["service", "product"],
      expense_status: ["posted", "cancelled"],
      payment_method: ["cash", "card", "transfer", "other"],
      payment_status: ["confirmed", "reversed"],
      sale_item_type: ["service", "product"],
      sale_status: [
        "open",
        "partially_paid",
        "paid",
        "cancelled",
        "partially_refunded",
        "refunded",
      ],
      settlement_status: ["draft", "paid", "cancelled"],
      stock_movement_type: [
        "purchase",
        "sale",
        "adjustment",
        "waste",
        "return_in",
        "return_out",
        "initial",
      ],
    },
  },
} as const
