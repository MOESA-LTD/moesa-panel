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
          operationName?: string
          query?: string
          variables?: Json
          extensions?: Json
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
      audit_log: {
        Row: {
          created_at: string
          id: number
          new_data: Json | null
          old_data: Json | null
          operation: string
          record_id: string | null
          table_name: string
          table_schema: string
          tenant_id: string | null
          transaction_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          new_data?: Json | null
          old_data?: Json | null
          operation: string
          record_id?: string | null
          table_name: string
          table_schema: string
          tenant_id?: string | null
          transaction_id: string
        }
        Update: {
          created_at?: string
          id?: number
          new_data?: Json | null
          old_data?: Json | null
          operation?: string
          record_id?: string | null
          table_name?: string
          table_schema?: string
          tenant_id?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "audit_transaction"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "dashboard_notification_feed"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_transaction: {
        Row: {
          actor_id: string | null
          actor_role: string
          created_at: string
          id: string
          operation: string
          record_id: string | null
          reverted_at: string | null
          reverted_by: string | null
          reverts_id: string | null
          table_name: string
          tenant_id: string | null
          actor: unknown | null
          reverter: unknown | null
        }
        Insert: {
          actor_id?: string | null
          actor_role: string
          created_at?: string
          id?: string
          operation: string
          record_id?: string | null
          reverted_at?: string | null
          reverted_by?: string | null
          reverts_id?: string | null
          table_name: string
          tenant_id?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_role?: string
          created_at?: string
          id?: string
          operation?: string
          record_id?: string | null
          reverted_at?: string | null
          reverted_by?: string | null
          reverts_id?: string | null
          table_name?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_transaction_reverts_id_fkey"
            columns: ["reverts_id"]
            isOneToOne: false
            referencedRelation: "audit_transaction"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_transaction_reverts_id_fkey"
            columns: ["reverts_id"]
            isOneToOne: false
            referencedRelation: "dashboard_notification_feed"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_transaction_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_transaction_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      module: {
        Row: {
          created_at: string | null
          id: string
          is_core: boolean
          position: number
        }
        Insert: {
          created_at?: string | null
          id: string
          is_core?: boolean
          position?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          is_core?: boolean
          position?: number
        }
        Relationships: []
      }
      permission: {
        Row: {
          bypass: boolean | null
          command: Database["public"]["Enums"]["type_permission_command"]
          condition: string | null
          created_at: string | null
          details: string | null
          error_message: string | null
          group_name: string | null
          id: string
          kind: Database["public"]["Enums"]["type_permission_kind"]
          resource_condition: string | null
          resource_name: string
          throws_error: boolean | null
        }
        Insert: {
          bypass?: boolean | null
          command: Database["public"]["Enums"]["type_permission_command"]
          condition?: string | null
          created_at?: string | null
          details?: string | null
          error_message?: string | null
          group_name?: string | null
          id?: string
          kind: Database["public"]["Enums"]["type_permission_kind"]
          resource_condition?: string | null
          resource_name: string
          throws_error?: boolean | null
        }
        Update: {
          bypass?: boolean | null
          command?: Database["public"]["Enums"]["type_permission_command"]
          condition?: string | null
          created_at?: string | null
          details?: string | null
          error_message?: string | null
          group_name?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["type_permission_kind"]
          resource_condition?: string | null
          resource_name?: string
          throws_error?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "permission_group_name_fkey"
            columns: ["group_name"]
            isOneToOne: false
            referencedRelation: "module"
            referencedColumns: ["id"]
          },
        ]
      }
      plan: {
        Row: {
          billing_period: string | null
          created_at: string | null
          currency: string | null
          description: string | null
          display_name: string
          id: string
          is_active: boolean
          is_default: boolean
          position: number
          price: number | null
          trial_days: number
        }
        Insert: {
          billing_period?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          position?: number
          price?: number | null
          trial_days?: number
        }
        Update: {
          billing_period?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          position?: number
          price?: number | null
          trial_days?: number
        }
        Relationships: []
      }
      plan_limit: {
        Row: {
          created_at: string | null
          limit_key: string
          plan_id: string
          value: number
        }
        Insert: {
          created_at?: string | null
          limit_key: string
          plan_id: string
          value: number
        }
        Update: {
          created_at?: string | null
          limit_key?: string
          plan_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_limit_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plan"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_module: {
        Row: {
          created_at: string | null
          module_id: string
          plan_id: string
        }
        Insert: {
          created_at?: string | null
          module_id: string
          plan_id: string
        }
        Update: {
          created_at?: string | null
          module_id?: string
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_module_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "module"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_module_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plan"
            referencedColumns: ["id"]
          },
        ]
      }
      role: {
        Row: {
          created_at: string | null
          display_name: string
          id: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string | null
          display_name: string
          id?: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string
          id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permission: {
        Row: {
          created_at: string | null
          id: string | null
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string | null
          id?: string | null
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permission_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permission"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permission_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "role"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription: {
        Row: {
          canceled_at: string | null
          created_at: string | null
          created_by: string | null
          ends_at: string | null
          id: string
          is_trial: boolean
          note: string | null
          plan_id: string
          starts_at: string
          tenant_id: string
          status: string | null
        }
        Insert: {
          canceled_at?: string | null
          created_at?: string | null
          created_by?: string | null
          ends_at?: string | null
          id?: string
          is_trial?: boolean
          note?: string | null
          plan_id: string
          starts_at?: string
          tenant_id: string
        }
        Update: {
          canceled_at?: string | null
          created_at?: string | null
          created_by?: string | null
          ends_at?: string | null
          id?: string
          is_trial?: boolean
          note?: string | null
          plan_id?: string
          starts_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant: {
        Row: {
          address: string | null
          city: string | null
          country: string | null
          created_at: string | null
          display_name: string
          district: string | null
          email: string | null
          id: string
          legal_name: string | null
          logo_path: string | null
          parent_id: string | null
          phone: string | null
          tax_number: string | null
          tax_office: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          display_name: string
          district?: string | null
          email?: string | null
          id?: string
          legal_name?: string | null
          logo_path?: string | null
          parent_id?: string | null
          phone?: string | null
          tax_number?: string | null
          tax_office?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          display_name?: string
          district?: string | null
          email?: string | null
          id?: string
          legal_name?: string | null
          logo_path?: string | null
          parent_id?: string | null
          phone?: string | null
          tax_number?: string | null
          tax_office?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_owner: {
        Row: {
          created_at: string | null
          id: string | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_owner_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_owner_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_owner_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_user: {
        Row: {
          created_at: string | null
          id: string | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_user_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_user_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_user_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      user: {
        Row: {
          created_at: string | null
          email: string
          id: string
          phone: string | null
          user_metadata: Json | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          phone?: string | null
          user_metadata?: Json | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          phone?: string | null
          user_metadata?: Json | null
        }
        Relationships: []
      }
      user_role: {
        Row: {
          created_at: string | null
          id: string | null
          role_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          role_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string | null
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_role_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "role"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_role_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      company_subscription: {
        Row: {
          branches: number | null
          canceled_at: string | null
          created_at: string | null
          display_name: string | null
          email: string | null
          ends_at: string | null
          id: string | null
          is_trial: boolean | null
          plan_id: string | null
          plan_name: string | null
          starts_at: string | null
          status: string | null
          subscription_id: string | null
          users: number | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plan"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_notification_feed: {
        Row: {
          activity: string | null
          created_at: string | null
          id: string | null
          new_data: Json | null
          old_data: Json | null
          operation: string | null
          resource_id: string | null
          since: string | null
          table_name: string | null
          tenant_id: string | null
          user_email: string | null
          user_id: string | null
          user_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_transaction_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_transaction_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_member: {
        Row: {
          branch_name: string | null
          created_at: string | null
          email: string | null
          id: string | null
          key: string | null
          owned_via: string[] | null
          phone: string | null
          tenant_id: string | null
          user_metadata: Json | null
        }
        Relationships: []
      }
    }
    Functions: {
      actor: {
        Args: {
          "": unknown
        }
        Returns: {
          created_at: string | null
          email: string
          id: string
          phone: string | null
          user_metadata: Json | null
        }[]
      }
      create_branch: {
        Args: {
          parent_id: string
          branch: Json
        }
        Returns: {
          address: string | null
          city: string | null
          country: string | null
          created_at: string | null
          display_name: string
          district: string | null
          email: string | null
          id: string
          legal_name: string | null
          logo_path: string | null
          parent_id: string | null
          phone: string | null
          tax_number: string | null
          tax_office: string | null
          website: string | null
        }
      }
      delete_branch: {
        Args: {
          branch_id: string
        }
        Returns: undefined
      }
      is_super_admin: {
        Args: {
          user_id: string
        }
        Returns: boolean
      }
      managed_in: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      my_access: {
        Args: {
          requested?: string
        }
        Returns: Json
      }
      owned_via: {
        Args: {
          "": unknown
        }
        Returns: string[]
      }
      register_tenant: {
        Args: {
          owner_id: string
          company: Json
        }
        Returns: {
          address: string | null
          city: string | null
          country: string | null
          created_at: string | null
          display_name: string
          district: string | null
          email: string | null
          id: string
          legal_name: string | null
          logo_path: string | null
          parent_id: string | null
          phone: string | null
          tax_number: string | null
          tax_office: string | null
          website: string | null
        }
      }
      revert_audit_transaction: {
        Args: {
          transaction_id: string
        }
        Returns: string[]
      }
      reverter: {
        Args: {
          "": unknown
        }
        Returns: {
          created_at: string | null
          email: string
          id: string
          phone: string | null
          user_metadata: Json | null
        }[]
      }
      save_plan: {
        Args: {
          plan_data: Json
          module_ids?: string[]
          limits?: Json
        }
        Returns: string
      }
      save_role: {
        Args: {
          role_data: Json
          permission_ids?: string[]
        }
        Returns: string
      }
      set_user_roles: {
        Args: {
          user_id: string
          role_ids?: string[]
        }
        Returns: undefined
      }
      status: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      throw_rls_policy_error: {
        Args: {
          message: string
        }
        Returns: boolean
      }
    }
    Enums: {
      type_permission_command: "select" | "insert" | "update" | "delete"
      type_permission_kind: "read" | "create" | "modify"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

