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
      appointment_items: {
        Row: {
          appointment_id: string
          branch_id: string
          business_id: string
          created_at: string
          duration_snapshot_minutes: number
          employee_id: string | null
          id: string
          price_snapshot: number
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
          price_snapshot: number
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
          price_snapshot?: number
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
          counted_breakdown: Json | null
          counted_cash: number | null
          difference_amount: number | null
          expected_cash: number | null
          float_left: number | null
          id: string
          notes: string | null
          opened_at: string
          opened_by: string
          opening_cash: number
          opening_expected: number | null
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
          counted_breakdown?: Json | null
          counted_cash?: number | null
          difference_amount?: number | null
          expected_cash?: number | null
          float_left?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by: string
          opening_cash?: number
          opening_expected?: number | null
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
          counted_breakdown?: Json | null
          counted_cash?: number | null
          difference_amount?: number | null
          expected_cash?: number | null
          float_left?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string
          opening_cash?: number
          opening_expected?: number | null
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
          email: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          preferences: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          preferences?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
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
          branch_id: string
          business_id: string
          created_at: string
          created_by: string
          employee_id: string
          id: string
          paid_at: string | null
          paid_by: string | null
          paid_via: Database["public"]["Enums"]["payment_method"] | null
          period_end: string
          period_start: string
          receipt_number: string
          reference: string | null
          status: Database["public"]["Enums"]["settlement_status"]
          total_amount: number
          window_end: string
          window_start: string
        }
        Insert: {
          branch_id: string
          business_id: string
          created_at?: string
          created_by: string
          employee_id: string
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          paid_via?: Database["public"]["Enums"]["payment_method"] | null
          period_end: string
          period_start: string
          receipt_number: string
          reference?: string | null
          status?: Database["public"]["Enums"]["settlement_status"]
          total_amount?: number
          window_end: string
          window_start: string
        }
        Update: {
          branch_id?: string
          business_id?: string
          created_at?: string
          created_by?: string
          employee_id?: string
          id?: string
          paid_at?: string | null
          paid_by?: string | null
          paid_via?: Database["public"]["Enums"]["payment_method"] | null
          period_end?: string
          period_start?: string
          receipt_number?: string
          reference?: string | null
          status?: Database["public"]["Enums"]["settlement_status"]
          total_amount?: number
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
          business_id: string
          can_authorize_discounts: boolean
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          is_barber: boolean
          phone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          business_id: string
          can_authorize_discounts?: boolean
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          is_barber?: boolean
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          business_id?: string
          can_authorize_discounts?: boolean
          created_at?: string
          display_name?: string
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
      expenses: {
        Row: {
          amount: number
          branch_id: string
          business_id: string
          cash_session_id: string | null
          category: string
          created_at: string
          created_by: string
          description: string
          id: string
          incurred_at: string
          method: Database["public"]["Enums"]["payment_method"]
          status: Database["public"]["Enums"]["expense_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          branch_id: string
          business_id: string
          cash_session_id?: string | null
          category: string
          created_at?: string
          created_by: string
          description: string
          id?: string
          incurred_at?: string
          method: Database["public"]["Enums"]["payment_method"]
          status?: Database["public"]["Enums"]["expense_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          branch_id?: string
          business_id?: string
          cash_session_id?: string | null
          category?: string
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          incurred_at?: string
          method?: Database["public"]["Enums"]["payment_method"]
          status?: Database["public"]["Enums"]["expense_status"]
          updated_at?: string
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
      adjust_inventory_stock: {
        Args: {
          p_branch_id: string
          p_notes: string
          p_product_id: string
          p_quantity_delta: number
        }
        Returns: Json
      }
      agenda_reconciliation: {
        Args: { p_branch_id: string; p_from: string; p_to: string }
        Returns: Json
      }
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
      close_cash_session: {
        Args: {
          p_breakdown?: Json
          p_cash_session_id: string
          p_counted_cash: number
          p_float_left?: number
          p_reserve_amount?: number
          p_withdrawal_delivered_to?: string
        }
        Returns: Json
      }
      confirm_sale: {
        Args: {
          p_appointment_id?: string
          p_branch_id: string
          p_client_id?: string
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
      get_settlement_receipt: {
        Args: { p_settlement_id: string }
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
      login_attempt_succeeded: { Args: never; Returns: undefined }
      mark_pin_reset: {
        Args: {
          p_actor_user_id: string
          p_business_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      my_account_status: { Args: never; Returns: Json }
      open_cash_session: {
        Args: { p_branch_id: string; p_opening_cash: number }
        Returns: Json
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
      reverse_sale: {
        Args: { p_reason: string; p_sale_id: string }
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
      set_account_active: {
        Args: { p_active: boolean; p_business_id: string; p_user_id: string }
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
      set_commission_defaults: {
        Args: {
          p_business_id: string
          p_product_pct: number
          p_service_pct: number
        }
        Returns: Json
      }
      set_employee_schedule: {
        Args: { p_days: Json; p_employee_id: string }
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
