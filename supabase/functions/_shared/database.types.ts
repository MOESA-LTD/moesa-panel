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
      change_request: {
        Row: {
          affected_document_id: string | null
          affected_gate_code: Database["public"]["Enums"]["gate_code"] | null
          change_kinds: Database["public"]["Enums"]["change_kind"][]
          closed_on: string | null
          code: string | null
          company_approved_by: string | null
          company_approved_on: string | null
          cost_impact: string | null
          cost_payer: Database["public"]["Enums"]["cost_payer"] | null
          created_at: string
          current_value: string
          customer_approval_document_id: string | null
          customer_approved_on: string | null
          customer_id: string
          decision_due_on: string | null
          decision_note: string | null
          delay_days: number | null
          id: string
          listing_impact: string | null
          other_documents: string | null
          project_id: string | null
          quality_impact: string | null
          reason: string
          requested_value: string
          result_document_id: string | null
          source: Database["public"]["Enums"]["change_request_source"]
          status: Database["public"]["Enums"]["change_request_status"]
          tenant_id: string
          title: string
          updated_at: string
          urgency: Database["public"]["Enums"]["change_request_urgency"]
        }
        Insert: {
          affected_document_id?: string | null
          affected_gate_code?: Database["public"]["Enums"]["gate_code"] | null
          change_kinds: Database["public"]["Enums"]["change_kind"][]
          closed_on?: string | null
          code?: string | null
          company_approved_by?: string | null
          company_approved_on?: string | null
          cost_impact?: string | null
          cost_payer?: Database["public"]["Enums"]["cost_payer"] | null
          created_at?: string
          current_value: string
          customer_approval_document_id?: string | null
          customer_approved_on?: string | null
          customer_id: string
          decision_due_on?: string | null
          decision_note?: string | null
          delay_days?: number | null
          id?: string
          listing_impact?: string | null
          other_documents?: string | null
          project_id?: string | null
          quality_impact?: string | null
          reason: string
          requested_value: string
          result_document_id?: string | null
          source: Database["public"]["Enums"]["change_request_source"]
          status?: Database["public"]["Enums"]["change_request_status"]
          tenant_id: string
          title: string
          updated_at?: string
          urgency?: Database["public"]["Enums"]["change_request_urgency"]
        }
        Update: {
          affected_document_id?: string | null
          affected_gate_code?: Database["public"]["Enums"]["gate_code"] | null
          change_kinds?: Database["public"]["Enums"]["change_kind"][]
          closed_on?: string | null
          code?: string | null
          company_approved_by?: string | null
          company_approved_on?: string | null
          cost_impact?: string | null
          cost_payer?: Database["public"]["Enums"]["cost_payer"] | null
          created_at?: string
          current_value?: string
          customer_approval_document_id?: string | null
          customer_approved_on?: string | null
          customer_id?: string
          decision_due_on?: string | null
          decision_note?: string | null
          delay_days?: number | null
          id?: string
          listing_impact?: string | null
          other_documents?: string | null
          project_id?: string | null
          quality_impact?: string | null
          reason?: string
          requested_value?: string
          result_document_id?: string | null
          source?: Database["public"]["Enums"]["change_request_source"]
          status?: Database["public"]["Enums"]["change_request_status"]
          tenant_id?: string
          title?: string
          updated_at?: string
          urgency?: Database["public"]["Enums"]["change_request_urgency"]
        }
        Relationships: [
          {
            foreignKeyName: "change_request_affected_document_fkey"
            columns: ["affected_document_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "change_request_approval_document_fkey"
            columns: ["customer_approval_document_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "change_request_approver_fkey"
            columns: ["company_approved_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_request_customer_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "change_request_project_fkey"
            columns: ["project_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_gate_pending"
            referencedColumns: ["project_id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "change_request_project_fkey"
            columns: ["project_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_task_due"
            referencedColumns: ["project_id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "change_request_project_fkey"
            columns: ["project_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "change_request_result_document_fkey"
            columns: ["result_document_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "change_request_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_request_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      change_request_product: {
        Row: {
          change_request_id: string
          created_at: string
          customer_id: string
          product_id: string
          tenant_id: string
        }
        Insert: {
          change_request_id: string
          created_at?: string
          customer_id: string
          product_id: string
          tenant_id: string
        }
        Update: {
          change_request_id?: string
          created_at?: string
          customer_id?: string
          product_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_request_product_cr_fkey"
            columns: ["change_request_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "change_request"
            referencedColumns: ["id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "change_request_product_cr_fkey"
            columns: ["change_request_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_change_request"
            referencedColumns: ["change_request_id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "change_request_product_product_fkey"
            columns: ["product_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "change_request_product_product_fkey"
            columns: ["product_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "product_evidence"
            referencedColumns: ["product_id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "change_request_product_product_fkey"
            columns: ["product_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "product_with_evidence"
            referencedColumns: ["id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "change_request_product_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_request_product_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      code_sequence: {
        Row: {
          kind: string
          last_no: number
          scope: string
          tenant_id: string
          year: number
        }
        Insert: {
          kind: string
          last_no?: number
          scope: string
          tenant_id: string
          year: number
        }
        Update: {
          kind?: string
          last_no?: number
          scope?: string
          tenant_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "code_sequence_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "code_sequence_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      customer: {
        Row: {
          code: string
          commercial_model: Database["public"]["Enums"]["commercial_model"]
          contract_accepted_on: string | null
          contract_document_id: string | null
          country: string | null
          created_at: string
          deposit_rate: number | null
          display_name: string
          eu_responsible_person: string | null
          extra_cost_rule: string | null
          id: string
          notes: string | null
          packages: string[]
          restricted_drive_url: string | null
          start_on: string | null
          status: Database["public"]["Enums"]["customer_status"]
          tenant_id: string
          updated_at: string
          website: string | null
        }
        Insert: {
          code: string
          commercial_model: Database["public"]["Enums"]["commercial_model"]
          contract_accepted_on?: string | null
          contract_document_id?: string | null
          country?: string | null
          created_at?: string
          deposit_rate?: number | null
          display_name: string
          eu_responsible_person?: string | null
          extra_cost_rule?: string | null
          id?: string
          notes?: string | null
          packages?: string[]
          restricted_drive_url?: string | null
          start_on?: string | null
          status?: Database["public"]["Enums"]["customer_status"]
          tenant_id: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          code?: string
          commercial_model?: Database["public"]["Enums"]["commercial_model"]
          contract_accepted_on?: string | null
          contract_document_id?: string | null
          country?: string | null
          created_at?: string
          deposit_rate?: number | null
          display_name?: string
          eu_responsible_person?: string | null
          extra_cost_rule?: string | null
          id?: string
          notes?: string | null
          packages?: string[]
          restricted_drive_url?: string | null
          start_on?: string | null
          status?: Database["public"]["Enums"]["customer_status"]
          tenant_id?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_contract_document_fkey"
            columns: ["contract_document_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "customer_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_brand: {
        Row: {
          brand_program_status: string | null
          customer_id: string
          gs1_prefix_owner: string | null
          id: string
          name: string
          registration_status: string | null
          tenant_id: string
        }
        Insert: {
          brand_program_status?: string | null
          customer_id: string
          gs1_prefix_owner?: string | null
          id?: string
          name: string
          registration_status?: string | null
          tenant_id: string
        }
        Update: {
          brand_program_status?: string | null
          customer_id?: string
          gs1_prefix_owner?: string | null
          id?: string
          name?: string
          registration_status?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_brand_customer_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "customer_brand_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_brand_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_contact: {
        Row: {
          can_approve: boolean
          customer_id: string
          email: string | null
          id: string
          name: string
          phone: string | null
          role: string | null
          tenant_id: string
        }
        Insert: {
          can_approve?: boolean
          customer_id: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          role?: string | null
          tenant_id: string
        }
        Update: {
          can_approve?: boolean
          customer_id?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          role?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_contact_customer_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "customer_contact_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_contact_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_platform_account: {
        Row: {
          access: Database["public"]["Enums"]["platform_access"]
          account_holder: string | null
          countries: string[]
          customer_id: string
          id: string
          notes: string | null
          platform_id: string
          tenant_id: string
        }
        Insert: {
          access?: Database["public"]["Enums"]["platform_access"]
          account_holder?: string | null
          countries?: string[]
          customer_id: string
          id?: string
          notes?: string | null
          platform_id: string
          tenant_id: string
        }
        Update: {
          access?: Database["public"]["Enums"]["platform_access"]
          account_holder?: string | null
          countries?: string[]
          customer_id?: string
          id?: string
          notes?: string | null
          platform_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_platform_account_customer_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "customer_platform_account_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "platform"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_platform_account_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_platform_account_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_warehouse: {
        Row: {
          address: string | null
          appointment_rule: string | null
          city: string | null
          country: string | null
          customer_id: string
          display_name: string
          dock_hours: string | null
          id: string
          is_default: boolean
          pallet_standard: string | null
          postal_code: string | null
          receiving_person: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["warehouse_type"]
        }
        Insert: {
          address?: string | null
          appointment_rule?: string | null
          city?: string | null
          country?: string | null
          customer_id: string
          display_name: string
          dock_hours?: string | null
          id?: string
          is_default?: boolean
          pallet_standard?: string | null
          postal_code?: string | null
          receiving_person?: string | null
          tenant_id: string
          type?: Database["public"]["Enums"]["warehouse_type"]
        }
        Update: {
          address?: string | null
          appointment_rule?: string | null
          city?: string | null
          country?: string | null
          customer_id?: string
          display_name?: string
          dock_hours?: string | null
          id?: string
          is_default?: boolean
          pallet_standard?: string | null
          postal_code?: string | null
          receiving_person?: string | null
          tenant_id?: string
          type?: Database["public"]["Enums"]["warehouse_type"]
        }
        Relationships: [
          {
            foreignKeyName: "customer_warehouse_customer_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "customer_warehouse_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_warehouse_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      document: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          entity_id: string
          entity_type: Database["public"]["Enums"]["document_entity"]
          file_name: string | null
          id: string
          is_signed: boolean
          is_stamped: boolean
          issued_on: string | null
          media_id: string | null
          notes: string | null
          sent_from_official_email: boolean
          status: Database["public"]["Enums"]["document_status"]
          tenant_id: string
          type: Database["public"]["Enums"]["document_type"]
          updated_at: string
          url: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          entity_id: string
          entity_type: Database["public"]["Enums"]["document_entity"]
          file_name?: string | null
          id?: string
          is_signed?: boolean
          is_stamped?: boolean
          issued_on?: string | null
          media_id?: string | null
          notes?: string | null
          sent_from_official_email?: boolean
          status?: Database["public"]["Enums"]["document_status"]
          tenant_id: string
          type: Database["public"]["Enums"]["document_type"]
          updated_at?: string
          url?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["document_entity"]
          file_name?: string | null
          id?: string
          is_signed?: boolean
          is_stamped?: boolean
          issued_on?: string | null
          media_id?: string | null
          notes?: string | null
          sent_from_official_email?: boolean
          status?: Database["public"]["Enums"]["document_status"]
          tenant_id?: string
          type?: Database["public"]["Enums"]["document_type"]
          updated_at?: string
          url?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_customer_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "document_media_fkey"
            columns: ["media_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "media"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "document_media_fkey"
            columns: ["media_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "media_library"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "document_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      incident: {
        Row: {
          affected_parties: Database["public"]["Enums"]["incident_party"][]
          closed_by: string | null
          closed_on: string | null
          code: string | null
          created_at: string
          current_state: string | null
          customer_closure_notified_on: string | null
          customer_id: string
          customer_notice_due_at: string | null
          customer_notified_at: string | null
          entity_id: string | null
          entity_type: Database["public"]["Enums"]["document_entity"] | null
          family: Database["public"]["Enums"]["incident_family"]
          id: string
          immediate_action: string | null
          impact_note: string | null
          incident_type: string | null
          lessons: string | null
          management_notified_at: string | null
          opened_at: string
          outcome: Database["public"]["Enums"]["incident_outcome"] | null
          owner_id: string | null
          preventive_action: string | null
          reported_by: string | null
          root_cause: Database["public"]["Enums"]["incident_root_cause"] | null
          root_cause_note: string | null
          severity: Database["public"]["Enums"]["incident_severity"]
          status: Database["public"]["Enums"]["incident_status"]
          tenant_id: string
          title: string
          updated_at: string
          what_happened: string
        }
        Insert: {
          affected_parties?: Database["public"]["Enums"]["incident_party"][]
          closed_by?: string | null
          closed_on?: string | null
          code?: string | null
          created_at?: string
          current_state?: string | null
          customer_closure_notified_on?: string | null
          customer_id: string
          customer_notice_due_at?: string | null
          customer_notified_at?: string | null
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["document_entity"] | null
          family: Database["public"]["Enums"]["incident_family"]
          id?: string
          immediate_action?: string | null
          impact_note?: string | null
          incident_type?: string | null
          lessons?: string | null
          management_notified_at?: string | null
          opened_at?: string
          outcome?: Database["public"]["Enums"]["incident_outcome"] | null
          owner_id?: string | null
          preventive_action?: string | null
          reported_by?: string | null
          root_cause?: Database["public"]["Enums"]["incident_root_cause"] | null
          root_cause_note?: string | null
          severity: Database["public"]["Enums"]["incident_severity"]
          status?: Database["public"]["Enums"]["incident_status"]
          tenant_id: string
          title: string
          updated_at?: string
          what_happened: string
        }
        Update: {
          affected_parties?: Database["public"]["Enums"]["incident_party"][]
          closed_by?: string | null
          closed_on?: string | null
          code?: string | null
          created_at?: string
          current_state?: string | null
          customer_closure_notified_on?: string | null
          customer_id?: string
          customer_notice_due_at?: string | null
          customer_notified_at?: string | null
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["document_entity"] | null
          family?: Database["public"]["Enums"]["incident_family"]
          id?: string
          immediate_action?: string | null
          impact_note?: string | null
          incident_type?: string | null
          lessons?: string | null
          management_notified_at?: string | null
          opened_at?: string
          outcome?: Database["public"]["Enums"]["incident_outcome"] | null
          owner_id?: string | null
          preventive_action?: string | null
          reported_by?: string | null
          root_cause?: Database["public"]["Enums"]["incident_root_cause"] | null
          root_cause_note?: string | null
          severity?: Database["public"]["Enums"]["incident_severity"]
          status?: Database["public"]["Enums"]["incident_status"]
          tenant_id?: string
          title?: string
          updated_at?: string
          what_happened?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_customer_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "incident_owner_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_deadline: {
        Row: {
          created_at: string
          due_at: string
          id: string
          incident_id: string
          kind: Database["public"]["Enums"]["incident_deadline_kind"]
          label: string | null
          met_at: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          due_at: string
          id?: string
          incident_id: string
          kind: Database["public"]["Enums"]["incident_deadline_kind"]
          label?: string | null
          met_at?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          due_at?: string
          id?: string
          incident_id?: string
          kind?: Database["public"]["Enums"]["incident_deadline_kind"]
          label?: string | null
          met_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_deadline_incident_fkey"
            columns: ["incident_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_incident"
            referencedColumns: ["incident_id", "tenant_id"]
          },
          {
            foreignKeyName: "incident_deadline_incident_fkey"
            columns: ["incident_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "incident"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "incident_deadline_incident_fkey"
            columns: ["incident_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "incident_overview"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "incident_deadline_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_deadline_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_log: {
        Row: {
          author_id: string | null
          cost_amount: number | null
          cost_currency: string | null
          cost_payer: Database["public"]["Enums"]["cost_payer"] | null
          counterparty: string | null
          created_at: string
          customer_approved: boolean
          decision: string | null
          id: string
          incident_id: string
          logged_at: string
          note: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          cost_amount?: number | null
          cost_currency?: string | null
          cost_payer?: Database["public"]["Enums"]["cost_payer"] | null
          counterparty?: string | null
          created_at?: string
          customer_approved?: boolean
          decision?: string | null
          id?: string
          incident_id: string
          logged_at?: string
          note: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          cost_amount?: number | null
          cost_currency?: string | null
          cost_payer?: Database["public"]["Enums"]["cost_payer"] | null
          counterparty?: string | null
          created_at?: string
          customer_approved?: boolean
          decision?: string | null
          id?: string
          incident_id?: string
          logged_at?: string
          note?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_log_author_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_log_incident_fkey"
            columns: ["incident_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_incident"
            referencedColumns: ["incident_id", "tenant_id"]
          },
          {
            foreignKeyName: "incident_log_incident_fkey"
            columns: ["incident_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "incident"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "incident_log_incident_fkey"
            columns: ["incident_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "incident_overview"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "incident_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      market_cell: {
        Row: {
          compliance: Database["public"]["Enums"]["market_compliance"]
          compliance_note: string | null
          content_status: Database["public"]["Enums"]["content_status"]
          country: string
          created_at: string
          currency: string | null
          customer_id: string
          id: string
          last_checked_on: string | null
          launched_on: string | null
          notes: string | null
          open_issue: string | null
          platform_id: string
          platform_product_id: string | null
          platform_sku: string | null
          price: number | null
          priority: number
          product_id: string
          project_id: string | null
          status: Database["public"]["Enums"]["market_cell_status"]
          stock_source: Database["public"]["Enums"]["stock_source"] | null
          target_launch_on: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          compliance?: Database["public"]["Enums"]["market_compliance"]
          compliance_note?: string | null
          content_status?: Database["public"]["Enums"]["content_status"]
          country: string
          created_at?: string
          currency?: string | null
          customer_id: string
          id?: string
          last_checked_on?: string | null
          launched_on?: string | null
          notes?: string | null
          open_issue?: string | null
          platform_id: string
          platform_product_id?: string | null
          platform_sku?: string | null
          price?: number | null
          priority?: number
          product_id: string
          project_id?: string | null
          status?: Database["public"]["Enums"]["market_cell_status"]
          stock_source?: Database["public"]["Enums"]["stock_source"] | null
          target_launch_on?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          compliance?: Database["public"]["Enums"]["market_compliance"]
          compliance_note?: string | null
          content_status?: Database["public"]["Enums"]["content_status"]
          country?: string
          created_at?: string
          currency?: string | null
          customer_id?: string
          id?: string
          last_checked_on?: string | null
          launched_on?: string | null
          notes?: string | null
          open_issue?: string | null
          platform_id?: string
          platform_product_id?: string | null
          platform_sku?: string | null
          price?: number | null
          priority?: number
          product_id?: string
          project_id?: string | null
          status?: Database["public"]["Enums"]["market_cell_status"]
          stock_source?: Database["public"]["Enums"]["stock_source"] | null
          target_launch_on?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_cell_platform_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "platform"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_cell_product_fkey"
            columns: ["product_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "market_cell_product_fkey"
            columns: ["product_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "product_evidence"
            referencedColumns: ["product_id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "market_cell_product_fkey"
            columns: ["product_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "product_with_evidence"
            referencedColumns: ["id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "market_cell_project_fkey"
            columns: ["project_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_gate_pending"
            referencedColumns: ["project_id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "market_cell_project_fkey"
            columns: ["project_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_task_due"
            referencedColumns: ["project_id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "market_cell_project_fkey"
            columns: ["project_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "market_cell_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_cell_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      media: {
        Row: {
          alt_text: string | null
          created_at: string
          customer_id: string | null
          file_name: string
          height: number | null
          id: string
          mime_type: string
          size_bytes: number
          storage_path: string
          tags: string[]
          tenant_id: string
          thumbnail_path: string | null
          title: string | null
          updated_at: string
          uploaded_by: string | null
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          customer_id?: string | null
          file_name: string
          height?: number | null
          id?: string
          mime_type: string
          size_bytes: number
          storage_path: string
          tags?: string[]
          tenant_id: string
          thumbnail_path?: string | null
          title?: string | null
          updated_at?: string
          uploaded_by?: string | null
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          customer_id?: string | null
          file_name?: string
          height?: number | null
          id?: string
          mime_type?: string
          size_bytes?: number
          storage_path?: string
          tags?: string[]
          tenant_id?: string
          thumbnail_path?: string | null
          title?: string | null
          updated_at?: string
          uploaded_by?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_customer_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "media_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      media_link: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["document_entity"]
          id: string
          media_id: string
          position: number
          role: Database["public"]["Enums"]["media_role"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["document_entity"]
          id?: string
          media_id: string
          position?: number
          role?: Database["public"]["Enums"]["media_role"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["document_entity"]
          id?: string
          media_id?: string
          position?: number
          role?: Database["public"]["Enums"]["media_role"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_link_media_fkey"
            columns: ["media_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "media"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "media_link_media_fkey"
            columns: ["media_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "media_library"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "media_link_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_link_tenant_id_fkey"
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
      platform: {
        Row: {
          countries: string[]
          created_at: string | null
          display_name: string
          id: string
          position: number
          product_id_label: string | null
        }
        Insert: {
          countries?: string[]
          created_at?: string | null
          display_name: string
          id: string
          position?: number
          product_id_label?: string | null
        }
        Update: {
          countries?: string[]
          created_at?: string | null
          display_name?: string
          id?: string
          position?: number
          product_id_label?: string | null
        }
        Relationships: []
      }
      product: {
        Row: {
          brand: string | null
          carton_dims_mm: string | null
          carton_gross_kg: number | null
          carton_net_kg: number | null
          carton_pack_qty: number | null
          category: string | null
          compliance_status: Database["public"]["Enums"]["compliance_status"]
          created_at: string
          customer_id: string
          display_name: string | null
          eu_responsible_person: string | null
          golden_sample_locations: string | null
          golden_sample_on: string | null
          gs1_prefix_owner: string | null
          gtin: string | null
          hs_code: string | null
          id: string
          is_hazmat: boolean
          landed_cost_eur: number | null
          landed_cost_on: string | null
          lot_rule: string | null
          manufacturer_art_no: string | null
          moesa_price_eur: number | null
          notes: string | null
          origin_country: string | null
          pack_dims_mm: string | null
          pack_gross_g: number | null
          pack_qty: number | null
          pallet_carton_qty: number | null
          pallet_type: string | null
          parent_id: string | null
          price_list_version: string | null
          purchase_currency: string | null
          purchase_incoterm: string | null
          purchase_price: number | null
          sku: string
          status: Database["public"]["Enums"]["product_status"]
          supplier_id: string | null
          supplier_product_code: string | null
          target_price_eur: number | null
          tenant_id: string
          unit_dims_mm: string | null
          unit_net_g: number | null
          updated_at: string
          variant_label: string | null
        }
        Insert: {
          brand?: string | null
          carton_dims_mm?: string | null
          carton_gross_kg?: number | null
          carton_net_kg?: number | null
          carton_pack_qty?: number | null
          category?: string | null
          compliance_status?: Database["public"]["Enums"]["compliance_status"]
          created_at?: string
          customer_id: string
          display_name?: string | null
          eu_responsible_person?: string | null
          golden_sample_locations?: string | null
          golden_sample_on?: string | null
          gs1_prefix_owner?: string | null
          gtin?: string | null
          hs_code?: string | null
          id?: string
          is_hazmat?: boolean
          landed_cost_eur?: number | null
          landed_cost_on?: string | null
          lot_rule?: string | null
          manufacturer_art_no?: string | null
          moesa_price_eur?: number | null
          notes?: string | null
          origin_country?: string | null
          pack_dims_mm?: string | null
          pack_gross_g?: number | null
          pack_qty?: number | null
          pallet_carton_qty?: number | null
          pallet_type?: string | null
          parent_id?: string | null
          price_list_version?: string | null
          purchase_currency?: string | null
          purchase_incoterm?: string | null
          purchase_price?: number | null
          sku: string
          status?: Database["public"]["Enums"]["product_status"]
          supplier_id?: string | null
          supplier_product_code?: string | null
          target_price_eur?: number | null
          tenant_id: string
          unit_dims_mm?: string | null
          unit_net_g?: number | null
          updated_at?: string
          variant_label?: string | null
        }
        Update: {
          brand?: string | null
          carton_dims_mm?: string | null
          carton_gross_kg?: number | null
          carton_net_kg?: number | null
          carton_pack_qty?: number | null
          category?: string | null
          compliance_status?: Database["public"]["Enums"]["compliance_status"]
          created_at?: string
          customer_id?: string
          display_name?: string | null
          eu_responsible_person?: string | null
          golden_sample_locations?: string | null
          golden_sample_on?: string | null
          gs1_prefix_owner?: string | null
          gtin?: string | null
          hs_code?: string | null
          id?: string
          is_hazmat?: boolean
          landed_cost_eur?: number | null
          landed_cost_on?: string | null
          lot_rule?: string | null
          manufacturer_art_no?: string | null
          moesa_price_eur?: number | null
          notes?: string | null
          origin_country?: string | null
          pack_dims_mm?: string | null
          pack_gross_g?: number | null
          pack_qty?: number | null
          pallet_carton_qty?: number | null
          pallet_type?: string | null
          parent_id?: string | null
          price_list_version?: string | null
          purchase_currency?: string | null
          purchase_incoterm?: string | null
          purchase_price?: number | null
          sku?: string
          status?: Database["public"]["Enums"]["product_status"]
          supplier_id?: string | null
          supplier_product_code?: string | null
          target_price_eur?: number | null
          tenant_id?: string
          unit_dims_mm?: string | null
          unit_net_g?: number | null
          updated_at?: string
          variant_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_customer_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "product_parent_fkey"
            columns: ["parent_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "product_parent_fkey"
            columns: ["parent_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "product_evidence"
            referencedColumns: ["product_id", "tenant_id"]
          },
          {
            foreignKeyName: "product_parent_fkey"
            columns: ["parent_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "product_with_evidence"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "product_supplier_fkey"
            columns: ["supplier_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "supplier"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "product_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      project: {
        Row: {
          code: string | null
          coordinator_id: string | null
          created_at: string
          current_phase: Database["public"]["Enums"]["project_phase"]
          customer_id: string
          display_name: string
          id: string
          notes: string | null
          packages: string[]
          path: Database["public"]["Enums"]["project_path"] | null
          status: Database["public"]["Enums"]["project_status"]
          target_delivery_on: string | null
          target_live_on: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["project_type"]
          updated_at: string
        }
        Insert: {
          code?: string | null
          coordinator_id?: string | null
          created_at?: string
          current_phase?: Database["public"]["Enums"]["project_phase"]
          customer_id: string
          display_name: string
          id?: string
          notes?: string | null
          packages?: string[]
          path?: Database["public"]["Enums"]["project_path"] | null
          status?: Database["public"]["Enums"]["project_status"]
          target_delivery_on?: string | null
          target_live_on?: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["project_type"]
          updated_at?: string
        }
        Update: {
          code?: string | null
          coordinator_id?: string | null
          created_at?: string
          current_phase?: Database["public"]["Enums"]["project_phase"]
          customer_id?: string
          display_name?: string
          id?: string
          notes?: string | null
          packages?: string[]
          path?: Database["public"]["Enums"]["project_path"] | null
          status?: Database["public"]["Enums"]["project_status"]
          target_delivery_on?: string | null
          target_live_on?: string | null
          tenant_id?: string
          type?: Database["public"]["Enums"]["project_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_coordinator_id_fkey"
            columns: ["coordinator_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_customer_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      project_gate: {
        Row: {
          approval_document_id: string | null
          code: Database["public"]["Enums"]["gate_code"]
          created_at: string
          customer_approved_on: string | null
          decided_by_role: string | null
          evidence_document_ids: string[]
          id: string
          needs_customer_approval: boolean
          note: string | null
          passed_at: string | null
          position: number
          project_id: string
          rolled_back_incident_id: string | null
          rolled_back_reason: string | null
          status: Database["public"]["Enums"]["gate_status"]
          tenant_id: string
        }
        Insert: {
          approval_document_id?: string | null
          code: Database["public"]["Enums"]["gate_code"]
          created_at?: string
          customer_approved_on?: string | null
          decided_by_role?: string | null
          evidence_document_ids?: string[]
          id?: string
          needs_customer_approval: boolean
          note?: string | null
          passed_at?: string | null
          position: number
          project_id: string
          rolled_back_incident_id?: string | null
          rolled_back_reason?: string | null
          status?: Database["public"]["Enums"]["gate_status"]
          tenant_id: string
        }
        Update: {
          approval_document_id?: string | null
          code?: Database["public"]["Enums"]["gate_code"]
          created_at?: string
          customer_approved_on?: string | null
          decided_by_role?: string | null
          evidence_document_ids?: string[]
          id?: string
          needs_customer_approval?: boolean
          note?: string | null
          passed_at?: string | null
          position?: number
          project_id?: string
          rolled_back_incident_id?: string | null
          rolled_back_reason?: string | null
          status?: Database["public"]["Enums"]["gate_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_gate_approval_document_fkey"
            columns: ["approval_document_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_gate_project_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_gate_pending"
            referencedColumns: ["project_id", "tenant_id"]
          },
          {
            foreignKeyName: "project_gate_project_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_task_due"
            referencedColumns: ["project_id", "tenant_id"]
          },
          {
            foreignKeyName: "project_gate_project_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_gate_rollback_incident_fkey"
            columns: ["rolled_back_incident_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_incident"
            referencedColumns: ["incident_id", "tenant_id"]
          },
          {
            foreignKeyName: "project_gate_rollback_incident_fkey"
            columns: ["rolled_back_incident_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "incident"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_gate_rollback_incident_fkey"
            columns: ["rolled_back_incident_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "incident_overview"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_gate_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_gate_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      project_product: {
        Row: {
          created_at: string
          product_id: string
          project_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          product_id: string
          project_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          product_id?: string
          project_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_product_product_fkey"
            columns: ["product_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_product_product_fkey"
            columns: ["product_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "product_evidence"
            referencedColumns: ["product_id", "tenant_id"]
          },
          {
            foreignKeyName: "project_product_product_fkey"
            columns: ["product_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "product_with_evidence"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_product_project_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_gate_pending"
            referencedColumns: ["project_id", "tenant_id"]
          },
          {
            foreignKeyName: "project_product_project_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_task_due"
            referencedColumns: ["project_id", "tenant_id"]
          },
          {
            foreignKeyName: "project_product_project_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_product_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_product_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      project_task: {
        Row: {
          assignee_id: string | null
          blocks_gate: boolean
          created_at: string
          display_name: string
          due_on: string | null
          id: string
          phase: Database["public"]["Enums"]["project_phase"]
          position: number
          project_id: string
          role: string | null
          status: Database["public"]["Enums"]["task_status"]
          tenant_id: string
        }
        Insert: {
          assignee_id?: string | null
          blocks_gate?: boolean
          created_at?: string
          display_name: string
          due_on?: string | null
          id?: string
          phase: Database["public"]["Enums"]["project_phase"]
          position?: number
          project_id: string
          role?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          tenant_id: string
        }
        Update: {
          assignee_id?: string | null
          blocks_gate?: boolean
          created_at?: string
          display_name?: string
          due_on?: string | null
          id?: string
          phase?: Database["public"]["Enums"]["project_phase"]
          position?: number
          project_id?: string
          role?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_task_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_task_project_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_gate_pending"
            referencedColumns: ["project_id", "tenant_id"]
          },
          {
            foreignKeyName: "project_task_project_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_task_due"
            referencedColumns: ["project_id", "tenant_id"]
          },
          {
            foreignKeyName: "project_task_project_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_task_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_task_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order: {
        Row: {
          code: string | null
          created_at: string
          currency: string
          customer_id: string
          deposit_rate: number
          id: string
          incoterm: string
          incoterm_place: string | null
          notes: string | null
          packing_instruction_document_id: string | null
          penalty_rule: string | null
          pi_balance_amount: number | null
          pi_check: Json
          pi_checked_at: string | null
          pi_checked_by: string | null
          pi_deposit_amount: number | null
          pi_discount_amount: number
          pi_document_id: string | null
          pi_extra_amount: number
          pi_number: string | null
          pi_subtotal: number | null
          pi_total: number | null
          project_id: string | null
          ready_on: string | null
          status: Database["public"]["Enums"]["purchase_order_status"]
          supplier_id: string
          tenant_id: string
          tolerance_pct: number | null
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          currency: string
          customer_id: string
          deposit_rate: number
          id?: string
          incoterm: string
          incoterm_place?: string | null
          notes?: string | null
          packing_instruction_document_id?: string | null
          penalty_rule?: string | null
          pi_balance_amount?: number | null
          pi_check?: Json
          pi_checked_at?: string | null
          pi_checked_by?: string | null
          pi_deposit_amount?: number | null
          pi_discount_amount?: number
          pi_document_id?: string | null
          pi_extra_amount?: number
          pi_number?: string | null
          pi_subtotal?: number | null
          pi_total?: number | null
          project_id?: string | null
          ready_on?: string | null
          status?: Database["public"]["Enums"]["purchase_order_status"]
          supplier_id: string
          tenant_id: string
          tolerance_pct?: number | null
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          currency?: string
          customer_id?: string
          deposit_rate?: number
          id?: string
          incoterm?: string
          incoterm_place?: string | null
          notes?: string | null
          packing_instruction_document_id?: string | null
          penalty_rule?: string | null
          pi_balance_amount?: number | null
          pi_check?: Json
          pi_checked_at?: string | null
          pi_checked_by?: string | null
          pi_deposit_amount?: number | null
          pi_discount_amount?: number
          pi_document_id?: string | null
          pi_extra_amount?: number
          pi_number?: string | null
          pi_subtotal?: number | null
          pi_total?: number | null
          project_id?: string | null
          ready_on?: string | null
          status?: Database["public"]["Enums"]["purchase_order_status"]
          supplier_id?: string
          tenant_id?: string
          tolerance_pct?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_customer_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "purchase_order_packing_document_fkey"
            columns: ["packing_instruction_document_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "purchase_order_pi_checked_by_fkey"
            columns: ["pi_checked_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_pi_document_fkey"
            columns: ["pi_document_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "purchase_order_project_fkey"
            columns: ["project_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_gate_pending"
            referencedColumns: ["project_id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "purchase_order_project_fkey"
            columns: ["project_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_task_due"
            referencedColumns: ["project_id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "purchase_order_project_fkey"
            columns: ["project_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "purchase_order_supplier_fkey"
            columns: ["supplier_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "supplier"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "purchase_order_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_line: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          line_total: number | null
          notes: string | null
          pi_line_total: number | null
          position: number
          product_id: string
          purchase_order_id: string
          quantity: number
          spec_document_id: string | null
          tenant_id: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          line_total?: number | null
          notes?: string | null
          pi_line_total?: number | null
          position?: number
          product_id: string
          purchase_order_id: string
          quantity: number
          spec_document_id?: string | null
          tenant_id: string
          unit_price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          line_total?: number | null
          notes?: string | null
          pi_line_total?: number | null
          position?: number
          product_id?: string
          purchase_order_id?: string
          quantity?: number
          spec_document_id?: string | null
          tenant_id?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_line_po_fkey"
            columns: ["purchase_order_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_purchase_order"
            referencedColumns: ["purchase_order_id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "purchase_order_line_po_fkey"
            columns: ["purchase_order_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "purchase_order"
            referencedColumns: ["id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "purchase_order_line_po_fkey"
            columns: ["purchase_order_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_overview"
            referencedColumns: ["id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "purchase_order_line_product_fkey"
            columns: ["product_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "purchase_order_line_product_fkey"
            columns: ["product_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "product_evidence"
            referencedColumns: ["product_id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "purchase_order_line_product_fkey"
            columns: ["product_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "product_with_evidence"
            referencedColumns: ["id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "purchase_order_line_spec_fkey"
            columns: ["spec_document_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "purchase_order_line_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_line_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_payment: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          kind: Database["public"]["Enums"]["payment_kind"]
          notes: string | null
          paid_by: Database["public"]["Enums"]["payment_payer"]
          paid_on: string | null
          planned_on: string | null
          purchase_order_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency: string
          id?: string
          kind: Database["public"]["Enums"]["payment_kind"]
          notes?: string | null
          paid_by?: Database["public"]["Enums"]["payment_payer"]
          paid_on?: string | null
          planned_on?: string | null
          purchase_order_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          kind?: Database["public"]["Enums"]["payment_kind"]
          notes?: string | null
          paid_by?: Database["public"]["Enums"]["payment_payer"]
          paid_on?: string | null
          planned_on?: string | null
          purchase_order_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_payment_po_fkey"
            columns: ["purchase_order_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_purchase_order"
            referencedColumns: ["purchase_order_id", "tenant_id"]
          },
          {
            foreignKeyName: "purchase_order_payment_po_fkey"
            columns: ["purchase_order_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "purchase_order"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "purchase_order_payment_po_fkey"
            columns: ["purchase_order_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_overview"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "purchase_order_payment_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_payment_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_update: {
        Row: {
          created_at: string
          created_by: string | null
          happened_on: string
          id: string
          note: string
          purchase_order_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          happened_on?: string
          id?: string
          note: string
          purchase_order_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          happened_on?: string
          id?: string
          note?: string
          purchase_order_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_update_po_fkey"
            columns: ["purchase_order_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_purchase_order"
            referencedColumns: ["purchase_order_id", "tenant_id"]
          },
          {
            foreignKeyName: "purchase_order_update_po_fkey"
            columns: ["purchase_order_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "purchase_order"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "purchase_order_update_po_fkey"
            columns: ["purchase_order_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_overview"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "purchase_order_update_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_update_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
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
      setting: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          key: string
          source_question: string | null
          tenant_id: string
          value: Json
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          key: string
          source_question?: string | null
          tenant_id: string
          value: Json
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          key?: string
          source_question?: string | null
          tenant_id?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "setting_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setting_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment: {
        Row: {
          accepted_by: string | null
          accepted_on: string | null
          booking_confirmed_on: string | null
          carrier: string | null
          carton_count: number | null
          code: string | null
          container_no: string | null
          created_at: string
          customer_id: string
          customs_broker: string | null
          customs_cleared_on: string | null
          delivered_at: string | null
          delivery_warehouse_id: string
          demurrage_note: string | null
          dispute_deadline_at: string | null
          eta: string | null
          etd: string | null
          forwarder: string | null
          free_days_detention: number | null
          free_days_port: number | null
          gross_kg: number | null
          has_damage: boolean | null
          id: string
          incoterm_buy: string | null
          incoterm_sell: string | null
          is_insured: boolean
          mode: Database["public"]["Enums"]["shipment_mode"]
          notes: string | null
          pallet_count: number | null
          planned_delivery_on: string | null
          quantity_matches: boolean | null
          ready_on: string | null
          seal_no: string | null
          status: Database["public"]["Enums"]["shipment_status"]
          tenant_id: string
          updated_at: string
          volume_m3: number | null
        }
        Insert: {
          accepted_by?: string | null
          accepted_on?: string | null
          booking_confirmed_on?: string | null
          carrier?: string | null
          carton_count?: number | null
          code?: string | null
          container_no?: string | null
          created_at?: string
          customer_id: string
          customs_broker?: string | null
          customs_cleared_on?: string | null
          delivered_at?: string | null
          delivery_warehouse_id: string
          demurrage_note?: string | null
          dispute_deadline_at?: string | null
          eta?: string | null
          etd?: string | null
          forwarder?: string | null
          free_days_detention?: number | null
          free_days_port?: number | null
          gross_kg?: number | null
          has_damage?: boolean | null
          id?: string
          incoterm_buy?: string | null
          incoterm_sell?: string | null
          is_insured?: boolean
          mode: Database["public"]["Enums"]["shipment_mode"]
          notes?: string | null
          pallet_count?: number | null
          planned_delivery_on?: string | null
          quantity_matches?: boolean | null
          ready_on?: string | null
          seal_no?: string | null
          status?: Database["public"]["Enums"]["shipment_status"]
          tenant_id: string
          updated_at?: string
          volume_m3?: number | null
        }
        Update: {
          accepted_by?: string | null
          accepted_on?: string | null
          booking_confirmed_on?: string | null
          carrier?: string | null
          carton_count?: number | null
          code?: string | null
          container_no?: string | null
          created_at?: string
          customer_id?: string
          customs_broker?: string | null
          customs_cleared_on?: string | null
          delivered_at?: string | null
          delivery_warehouse_id?: string
          demurrage_note?: string | null
          dispute_deadline_at?: string | null
          eta?: string | null
          etd?: string | null
          forwarder?: string | null
          free_days_detention?: number | null
          free_days_port?: number | null
          gross_kg?: number | null
          has_damage?: boolean | null
          id?: string
          incoterm_buy?: string | null
          incoterm_sell?: string | null
          is_insured?: boolean
          mode?: Database["public"]["Enums"]["shipment_mode"]
          notes?: string | null
          pallet_count?: number | null
          planned_delivery_on?: string | null
          quantity_matches?: boolean | null
          ready_on?: string | null
          seal_no?: string | null
          status?: Database["public"]["Enums"]["shipment_status"]
          tenant_id?: string
          updated_at?: string
          volume_m3?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shipment_customer_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "shipment_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_warehouse_fkey"
            columns: ["delivery_warehouse_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customer_warehouse"
            referencedColumns: ["id", "customer_id", "tenant_id"]
          },
        ]
      }
      shipment_event: {
        Row: {
          channel: string | null
          created_at: string
          created_by: string | null
          from_party: string | null
          happened_at: string
          id: string
          note: string | null
          shipment_id: string
          step: number | null
          tenant_id: string
          to_party: string | null
          updated_at: string
        }
        Insert: {
          channel?: string | null
          created_at?: string
          created_by?: string | null
          from_party?: string | null
          happened_at?: string
          id?: string
          note?: string | null
          shipment_id: string
          step?: number | null
          tenant_id: string
          to_party?: string | null
          updated_at?: string
        }
        Update: {
          channel?: string | null
          created_at?: string
          created_by?: string | null
          from_party?: string | null
          happened_at?: string
          id?: string
          note?: string | null
          shipment_id?: string
          step?: number | null
          tenant_id?: string
          to_party?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_event_shipment_fkey"
            columns: ["shipment_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_shipment"
            referencedColumns: ["shipment_id", "tenant_id"]
          },
          {
            foreignKeyName: "shipment_event_shipment_fkey"
            columns: ["shipment_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "shipment"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "shipment_event_shipment_fkey"
            columns: ["shipment_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "shipment_overview"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "shipment_event_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_event_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_line: {
        Row: {
          carton_count: number | null
          created_at: string
          id: string
          purchase_order_id: string
          purchase_order_line_id: string
          quantity: number
          shipment_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          carton_count?: number | null
          created_at?: string
          id?: string
          purchase_order_id: string
          purchase_order_line_id: string
          quantity: number
          shipment_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          carton_count?: number | null
          created_at?: string
          id?: string
          purchase_order_id?: string
          purchase_order_line_id?: string
          quantity?: number
          shipment_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_line_link_fkey"
            columns: ["shipment_id", "purchase_order_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "shipment_purchase_order"
            referencedColumns: ["shipment_id", "purchase_order_id", "tenant_id"]
          },
          {
            foreignKeyName: "shipment_line_po_line_fkey"
            columns: [
              "purchase_order_line_id",
              "purchase_order_id",
              "tenant_id",
            ]
            isOneToOne: false
            referencedRelation: "purchase_order_line"
            referencedColumns: ["id", "purchase_order_id", "tenant_id"]
          },
          {
            foreignKeyName: "shipment_line_shipment_fkey"
            columns: ["shipment_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_shipment"
            referencedColumns: ["shipment_id", "tenant_id"]
          },
          {
            foreignKeyName: "shipment_line_shipment_fkey"
            columns: ["shipment_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "shipment"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "shipment_line_shipment_fkey"
            columns: ["shipment_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "shipment_overview"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "shipment_line_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_line_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_purchase_order: {
        Row: {
          created_at: string
          customer_id: string
          purchase_order_id: string
          shipment_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          purchase_order_id: string
          shipment_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          purchase_order_id?: string
          shipment_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_purchase_order_po_fkey"
            columns: ["purchase_order_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_purchase_order"
            referencedColumns: ["purchase_order_id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "shipment_purchase_order_po_fkey"
            columns: ["purchase_order_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "purchase_order"
            referencedColumns: ["id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "shipment_purchase_order_po_fkey"
            columns: ["purchase_order_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_overview"
            referencedColumns: ["id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "shipment_purchase_order_shipment_fkey"
            columns: ["shipment_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_shipment"
            referencedColumns: ["shipment_id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "shipment_purchase_order_shipment_fkey"
            columns: ["shipment_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "shipment"
            referencedColumns: ["id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "shipment_purchase_order_shipment_fkey"
            columns: ["shipment_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "shipment_overview"
            referencedColumns: ["id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "shipment_purchase_order_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_purchase_order_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
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
      supplier: {
        Row: {
          cancellation_rule: string | null
          capacity_note: string | null
          city: string | null
          code: string
          country: string
          created_at: string
          damage_notice_hours: number | null
          default_incoterm: string | null
          deposit_rate: number | null
          display_name: string
          id: string
          last_audit_on: string | null
          late_payment_penalty: string | null
          notes: string | null
          payment_terms: string | null
          product_groups: string[]
          rating: number | null
          status: Database["public"]["Enums"]["supplier_status"]
          storage_fee_rule: string | null
          tenant_id: string
          updated_at: string
          website: string | null
        }
        Insert: {
          cancellation_rule?: string | null
          capacity_note?: string | null
          city?: string | null
          code: string
          country: string
          created_at?: string
          damage_notice_hours?: number | null
          default_incoterm?: string | null
          deposit_rate?: number | null
          display_name: string
          id?: string
          last_audit_on?: string | null
          late_payment_penalty?: string | null
          notes?: string | null
          payment_terms?: string | null
          product_groups?: string[]
          rating?: number | null
          status?: Database["public"]["Enums"]["supplier_status"]
          storage_fee_rule?: string | null
          tenant_id: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          cancellation_rule?: string | null
          capacity_note?: string | null
          city?: string | null
          code?: string
          country?: string
          created_at?: string
          damage_notice_hours?: number | null
          default_incoterm?: string | null
          deposit_rate?: number | null
          display_name?: string
          id?: string
          last_audit_on?: string | null
          late_payment_penalty?: string | null
          notes?: string | null
          payment_terms?: string | null
          product_groups?: string[]
          rating?: number | null
          status?: Database["public"]["Enums"]["supplier_status"]
          storage_fee_rule?: string | null
          tenant_id?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_contact: {
        Row: {
          email: string | null
          id: string
          is_primary: boolean
          name: string
          phone: string | null
          role: string | null
          supplier_id: string
          tenant_id: string
        }
        Insert: {
          email?: string | null
          id?: string
          is_primary?: boolean
          name: string
          phone?: string | null
          role?: string | null
          supplier_id: string
          tenant_id: string
        }
        Update: {
          email?: string | null
          id?: string
          is_primary?: boolean
          name?: string
          phone?: string | null
          role?: string | null
          supplier_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_contact_supplier_fkey"
            columns: ["supplier_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "supplier"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_contact_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_contact_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      task_template: {
        Row: {
          blocks_gate: boolean
          created_at: string | null
          display_name: string
          id: string
          phase: Database["public"]["Enums"]["project_phase"]
          position: number
          role: string
        }
        Insert: {
          blocks_gate?: boolean
          created_at?: string | null
          display_name: string
          id?: string
          phase: Database["public"]["Enums"]["project_phase"]
          position?: number
          role: string
        }
        Update: {
          blocks_gate?: boolean
          created_at?: string | null
          display_name?: string
          id?: string
          phase?: Database["public"]["Enums"]["project_phase"]
          position?: number
          role?: string
        }
        Relationships: []
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
      transfer: {
        Row: {
          audit_transaction_ids: string[]
          created_at: string
          customer_id: string
          decisions: Json
          files: Json
          files_status: string
          id: string
          id_map: Json
          missing_files: string[]
          mode: string
          path: string
          product_ids: string[] | null
          report: Json
          source_tenant_id: string
          started_by: string
          target_customer_id: string | null
          tenant_id: string
          updated_at: string
          xact_id: unknown
        }
        Insert: {
          audit_transaction_ids?: string[]
          created_at?: string
          customer_id: string
          decisions?: Json
          files?: Json
          files_status?: string
          id?: string
          id_map?: Json
          missing_files?: string[]
          mode: string
          path: string
          product_ids?: string[] | null
          report: Json
          source_tenant_id: string
          started_by: string
          target_customer_id?: string | null
          tenant_id: string
          updated_at?: string
          xact_id?: unknown
        }
        Update: {
          audit_transaction_ids?: string[]
          created_at?: string
          customer_id?: string
          decisions?: Json
          files?: Json
          files_status?: string
          id?: string
          id_map?: Json
          missing_files?: string[]
          mode?: string
          path?: string
          product_ids?: string[] | null
          report?: Json
          source_tenant_id?: string
          started_by?: string
          target_customer_id?: string | null
          tenant_id?: string
          updated_at?: string
          xact_id?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "transfer_source_tenant_id_fkey"
            columns: ["source_tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_source_tenant_id_fkey"
            columns: ["source_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
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
      dashboard_change_request: {
        Row: {
          change_request_id: string | null
          code: string | null
          customer_code: string | null
          customer_id: string | null
          decision_due_on: string | null
          overdue: boolean | null
          status: Database["public"]["Enums"]["change_request_status"] | null
          tenant_id: string | null
          title: string | null
          urgency: Database["public"]["Enums"]["change_request_urgency"] | null
        }
        Relationships: [
          {
            foreignKeyName: "change_request_customer_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "change_request_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_request_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_gate_pending: {
        Row: {
          customer_code: string | null
          customer_id: string | null
          gate_code: Database["public"]["Enums"]["gate_code"] | null
          gate_id: string | null
          needs_customer_approval: boolean | null
          needs_management: boolean | null
          owner_role: string | null
          position: number | null
          project_code: string | null
          project_display_name: string | null
          project_id: string | null
          tenant_id: string | null
          waiting_days: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_customer_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_incident: {
        Row: {
          code: string | null
          customer_code: string | null
          customer_id: string | null
          customer_notice_due_at: string | null
          customer_notice_late: boolean | null
          incident_id: string | null
          management_notice_missing: boolean | null
          next_deadline_at: string | null
          opened_at: string | null
          overdue_deadline_count: number | null
          severity: Database["public"]["Enums"]["incident_severity"] | null
          status: Database["public"]["Enums"]["incident_status"] | null
          tenant_id: string | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incident_customer_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "incident_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_market: {
        Row: {
          customer_code: string | null
          customer_id: string | null
          live_count: number | null
          preparing_count: number | null
          suppressed_count: number | null
          target_count: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "market_cell_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_cell_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
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
      dashboard_product_evidence: {
        Row: {
          active_sku_count: number | null
          compliance_complete_count: number | null
          customer_code: string | null
          customer_id: string | null
          signed_spec_count: number | null
          tenant_id: string | null
          unsigned_sku_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_customer_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "product_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_purchase_order: {
        Row: {
          balance_planned_on: string | null
          code: string | null
          currency: string | null
          customer_code: string | null
          customer_id: string | null
          days_to_ready: number | null
          deposit_planned_on: string | null
          purchase_order_id: string | null
          ready_on: string | null
          status: Database["public"]["Enums"]["purchase_order_status"] | null
          supplier_code: string | null
          system_total: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_customer_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "purchase_order_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_shipment: {
        Row: {
          code: string | null
          customer_code: string | null
          customer_id: string | null
          days_to_eta: number | null
          dispute_deadline_at: string | null
          eta: string | null
          etd: string | null
          mode: Database["public"]["Enums"]["shipment_mode"] | null
          overdue: boolean | null
          shipment_id: string | null
          status: Database["public"]["Enums"]["shipment_status"] | null
          tenant_id: string | null
          warehouse_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipment_customer_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "shipment_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_task_due: {
        Row: {
          blocks_gate: boolean | null
          customer_code: string | null
          customer_id: string | null
          days_left: number | null
          display_name: string | null
          due_on: string | null
          overdue: boolean | null
          phase: Database["public"]["Enums"]["project_phase"] | null
          project_code: string | null
          project_id: string | null
          role: string | null
          task_id: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_customer_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_overview: {
        Row: {
          affected_parties:
            | Database["public"]["Enums"]["incident_party"][]
            | null
          closed_by: string | null
          closed_on: string | null
          code: string | null
          created_at: string | null
          current_state: string | null
          customer_closure_notified_on: string | null
          customer_code: string | null
          customer_id: string | null
          customer_notice_due_at: string | null
          customer_notified_at: string | null
          entity_id: string | null
          entity_label: string | null
          entity_type: Database["public"]["Enums"]["document_entity"] | null
          family: Database["public"]["Enums"]["incident_family"] | null
          id: string | null
          immediate_action: string | null
          impact_note: string | null
          incident_type: string | null
          is_repeat: boolean | null
          lessons: string | null
          management_notified_at: string | null
          next_deadline_at: string | null
          opened_at: string | null
          outcome: Database["public"]["Enums"]["incident_outcome"] | null
          overdue_deadline_count: number | null
          owner_id: string | null
          preventive_action: string | null
          reported_by: string | null
          root_cause: Database["public"]["Enums"]["incident_root_cause"] | null
          root_cause_note: string | null
          severity: Database["public"]["Enums"]["incident_severity"] | null
          status: Database["public"]["Enums"]["incident_status"] | null
          tenant_id: string | null
          title: string | null
          updated_at: string | null
          what_happened: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incident_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_customer_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "incident_owner_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      market_cell_overview: {
        Row: {
          cell_key: string | null
          compliance: Database["public"]["Enums"]["market_compliance"] | null
          compliance_note: string | null
          content_status: Database["public"]["Enums"]["content_status"] | null
          country: string | null
          created_at: string | null
          currency: string | null
          customer_code: string | null
          customer_id: string | null
          gtin: string | null
          id: string | null
          last_checked_on: string | null
          launched_on: string | null
          notes: string | null
          open_issue: string | null
          platform_id: string | null
          platform_name: string | null
          platform_product_id: string | null
          platform_sku: string | null
          price: number | null
          priority: number | null
          product_id: string | null
          product_name: string | null
          project_code: string | null
          project_id: string | null
          sku: string | null
          status: Database["public"]["Enums"]["market_cell_status"] | null
          stock_source: Database["public"]["Enums"]["stock_source"] | null
          target_launch_on: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "market_cell_platform_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "platform"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_cell_product_fkey"
            columns: ["product_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "market_cell_product_fkey"
            columns: ["product_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "product_evidence"
            referencedColumns: ["product_id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "market_cell_product_fkey"
            columns: ["product_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "product_with_evidence"
            referencedColumns: ["id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "market_cell_project_fkey"
            columns: ["project_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_gate_pending"
            referencedColumns: ["project_id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "market_cell_project_fkey"
            columns: ["project_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_task_due"
            referencedColumns: ["project_id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "market_cell_project_fkey"
            columns: ["project_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "market_cell_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_cell_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      media_library: {
        Row: {
          alt_text: string | null
          created_at: string | null
          customer_id: string | null
          document_count: number | null
          file_name: string | null
          height: number | null
          id: string | null
          kind: string | null
          link_count: number | null
          linked_entities: string[] | null
          linked_types: Database["public"]["Enums"]["document_entity"][] | null
          mime_type: string | null
          size_bytes: number | null
          storage_path: string | null
          tags: string[] | null
          tenant_id: string | null
          thumbnail_path: string | null
          title: string | null
          updated_at: string | null
          uploaded_by: string | null
          width: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_customer_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "media_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      product_evidence: {
        Row: {
          compliance_complete: boolean | null
          compliance_status:
            | Database["public"]["Enums"]["compliance_status"]
            | null
          customer_id: string | null
          has_signed_spec: boolean | null
          last_po_code: string | null
          live_cell_count: number | null
          product_id: string | null
          sku: string | null
          spec_document_id: string | null
          spec_version: number | null
          status: Database["public"]["Enums"]["product_status"] | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_customer_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "product_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      product_with_evidence: {
        Row: {
          brand: string | null
          carton_dims_mm: string | null
          carton_gross_kg: number | null
          carton_net_kg: number | null
          carton_pack_qty: number | null
          category: string | null
          compliance_complete: boolean | null
          compliance_status:
            | Database["public"]["Enums"]["compliance_status"]
            | null
          created_at: string | null
          customer_id: string | null
          display_name: string | null
          eu_responsible_person: string | null
          golden_sample_locations: string | null
          golden_sample_on: string | null
          gs1_prefix_owner: string | null
          gtin: string | null
          has_signed_spec: boolean | null
          hs_code: string | null
          id: string | null
          is_hazmat: boolean | null
          landed_cost_eur: number | null
          landed_cost_on: string | null
          lot_rule: string | null
          manufacturer_art_no: string | null
          moesa_price_eur: number | null
          notes: string | null
          origin_country: string | null
          pack_dims_mm: string | null
          pack_gross_g: number | null
          pack_qty: number | null
          pallet_carton_qty: number | null
          pallet_type: string | null
          parent_id: string | null
          price_list_version: string | null
          primary_image_path: string | null
          purchase_currency: string | null
          purchase_incoterm: string | null
          purchase_price: number | null
          sku: string | null
          spec_version: number | null
          status: Database["public"]["Enums"]["product_status"] | null
          supplier_id: string | null
          supplier_product_code: string | null
          target_price_eur: number | null
          tenant_id: string | null
          unit_dims_mm: string | null
          unit_net_g: number | null
          updated_at: string | null
          variant_label: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_customer_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "product_parent_fkey"
            columns: ["parent_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "product"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "product_parent_fkey"
            columns: ["parent_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "product_evidence"
            referencedColumns: ["product_id", "tenant_id"]
          },
          {
            foreignKeyName: "product_parent_fkey"
            columns: ["parent_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "product_with_evidence"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "product_supplier_fkey"
            columns: ["supplier_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "supplier"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "product_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_overview: {
        Row: {
          balance_paid_on: string | null
          balance_planned_on: string | null
          code: string | null
          created_at: string | null
          currency: string | null
          customer_code: string | null
          customer_id: string | null
          deposit_paid_on: string | null
          deposit_planned_on: string | null
          deposit_rate: number | null
          has_approved_psi: boolean | null
          id: string | null
          incoterm: string | null
          incoterm_place: string | null
          line_count: number | null
          notes: string | null
          packing_instruction_document_id: string | null
          penalty_rule: string | null
          pi_balance_amount: number | null
          pi_check: Json | null
          pi_checked_at: string | null
          pi_checked_by: string | null
          pi_deposit_amount: number | null
          pi_discount_amount: number | null
          pi_document_id: string | null
          pi_extra_amount: number | null
          pi_number: string | null
          pi_subtotal: number | null
          pi_total: number | null
          product_ids: string[] | null
          project_code: string | null
          project_id: string | null
          ready_on: string | null
          spec_missing_line_ids: string[] | null
          status: Database["public"]["Enums"]["purchase_order_status"] | null
          supplier_code: string | null
          supplier_id: string | null
          system_balance: number | null
          system_deposit: number | null
          system_subtotal: number | null
          system_total: number | null
          tenant_id: string | null
          tolerance_pct: number | null
          total_quantity: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_customer_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "purchase_order_packing_document_fkey"
            columns: ["packing_instruction_document_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "purchase_order_pi_checked_by_fkey"
            columns: ["pi_checked_by"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_pi_document_fkey"
            columns: ["pi_document_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "purchase_order_project_fkey"
            columns: ["project_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_gate_pending"
            referencedColumns: ["project_id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "purchase_order_project_fkey"
            columns: ["project_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "dashboard_task_due"
            referencedColumns: ["project_id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "purchase_order_project_fkey"
            columns: ["project_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["id", "customer_id", "tenant_id"]
          },
          {
            foreignKeyName: "purchase_order_supplier_fkey"
            columns: ["supplier_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "supplier"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "purchase_order_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_overview: {
        Row: {
          accepted_by: string | null
          accepted_on: string | null
          booking_confirmed_on: string | null
          carrier: string | null
          carton_count: number | null
          code: string | null
          container_no: string | null
          created_at: string | null
          customer_code: string | null
          customer_id: string | null
          customs_broker: string | null
          customs_cleared_on: string | null
          delivered_at: string | null
          delivery_warehouse_id: string | null
          demurrage_note: string | null
          dispute_deadline_at: string | null
          eta: string | null
          etd: string | null
          forwarder: string | null
          free_days_detention: number | null
          free_days_port: number | null
          gross_kg: number | null
          has_damage: boolean | null
          id: string | null
          incoterm_buy: string | null
          incoterm_sell: string | null
          is_insured: boolean | null
          mode: Database["public"]["Enums"]["shipment_mode"] | null
          notes: string | null
          pallet_count: number | null
          planned_delivery_on: string | null
          product_ids: string[] | null
          psi_missing_po_codes: string[] | null
          purchase_order_codes: string[] | null
          purchase_order_ids: string[] | null
          quantity_matches: boolean | null
          ready_on: string | null
          seal_no: string | null
          status: Database["public"]["Enums"]["shipment_status"] | null
          tenant_id: string | null
          updated_at: string | null
          volume_m3: number | null
          warehouse_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipment_customer_fkey"
            columns: ["customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customer"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "shipment_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "company_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_warehouse_fkey"
            columns: ["delivery_warehouse_id", "customer_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "customer_warehouse"
            referencedColumns: ["id", "customer_id", "tenant_id"]
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
      add_business_days: {
        Args: {
          start_on: string
          days: number
        }
        Returns: string
      }
      audit_transfer_locked: {
        Args: {
          transaction_id: string
        }
        Returns: boolean
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
      gates_for: {
        Args: {
          type: Database["public"]["Enums"]["project_type"]
          path: Database["public"]["Enums"]["project_path"]
          packages: string[]
        }
        Returns: Database["public"]["Enums"]["gate_code"][]
      }
      import_products: {
        Args: {
          rows: Json
        }
        Returns: Json
      }
      initial_phase: {
        Args: {
          type: Database["public"]["Enums"]["project_type"]
          path: Database["public"]["Enums"]["project_path"]
          packages: string[]
        }
        Returns: Database["public"]["Enums"]["project_phase"]
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
      media_max_bytes: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      my_access: {
        Args: {
          requested?: string
        }
        Returns: Json
      }
      my_memberships: {
        Args: Record<PropertyKey, never>
        Returns: {
          tenant_id: string
          roles: string[]
        }[]
      }
      next_code: {
        Args: {
          kind: string
          scope: string
        }
        Returns: string
      }
      owned_via: {
        Args: {
          "": unknown
        }
        Returns: string[]
      }
      pass_gate: {
        Args: {
          gate_id: string
          note: string
          customer_approved_on?: string
          approval_document_id?: string
          evidence_document_ids?: string[]
        }
        Returns: {
          approval_document_id: string | null
          code: Database["public"]["Enums"]["gate_code"]
          created_at: string
          customer_approved_on: string | null
          decided_by_role: string | null
          evidence_document_ids: string[]
          id: string
          needs_customer_approval: boolean
          note: string | null
          passed_at: string | null
          position: number
          project_id: string
          rolled_back_incident_id: string | null
          rolled_back_reason: string | null
          status: Database["public"]["Enums"]["gate_status"]
          tenant_id: string
        }
      }
      phase_after: {
        Args: {
          code: Database["public"]["Enums"]["gate_code"]
          path: Database["public"]["Enums"]["project_path"]
          packages: string[]
        }
        Returns: Database["public"]["Enums"]["project_phase"]
      }
      phase_before: {
        Args: {
          code: Database["public"]["Enums"]["gate_code"]
        }
        Returns: Database["public"]["Enums"]["project_phase"]
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
      rollback_gate: {
        Args: {
          gate_id: string
          reason: string
          incident_id?: string
        }
        Returns: {
          approval_document_id: string | null
          code: Database["public"]["Enums"]["gate_code"]
          created_at: string
          customer_approved_on: string | null
          decided_by_role: string | null
          evidence_document_ids: string[]
          id: string
          needs_customer_approval: boolean
          note: string | null
          passed_at: string | null
          position: number
          project_id: string
          rolled_back_incident_id: string | null
          rolled_back_reason: string | null
          status: Database["public"]["Enums"]["gate_status"]
          tenant_id: string
        }
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
      set_primary_media: {
        Args: {
          link_id: string
        }
        Returns: {
          created_at: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["document_entity"]
          id: string
          media_id: string
          position: number
          role: Database["public"]["Enums"]["media_role"]
          tenant_id: string
          updated_at: string
        }
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
      transfer_check_files: {
        Args: {
          transfer_id: string
        }
        Returns: {
          audit_transaction_ids: string[]
          created_at: string
          customer_id: string
          decisions: Json
          files: Json
          files_status: string
          id: string
          id_map: Json
          missing_files: string[]
          mode: string
          path: string
          product_ids: string[] | null
          report: Json
          source_tenant_id: string
          started_by: string
          target_customer_id: string | null
          tenant_id: string
          updated_at: string
          xact_id: unknown
        }
      }
      transfer_customer: {
        Args: {
          source_tenant: string
          target_tenant: string
          customer_id: string
          mode: string
          decisions?: Json
          dry_run?: boolean
          report_hash?: string
          product_ids?: string[]
        }
        Returns: Json
      }
      transfer_options: {
        Args: {
          source_tenant: string
          customer_id?: string
        }
        Returns: Json
      }
    }
    Enums: {
      change_kind:
        | "spec"
        | "design"
        | "packaging"
        | "price"
        | "deadline"
        | "supplier"
        | "content"
      change_request_source: "customer" | "supplier" | "company" | "regulation"
      change_request_status: "open" | "approved" | "rejected" | "applied"
      change_request_urgency: "normal" | "urgent"
      commercial_model:
        | "trading_partner"
        | "commercial_representative"
        | "operations_partner"
      compliance_status: "none" | "partial" | "complete"
      content_status: "none" | "en_master" | "translated" | "approved"
      cost_payer: "company" | "customer" | "supplier" | "carrier_insurance"
      customer_status: "lead" | "onboarding" | "active" | "paused" | "closed"
      document_entity:
        | "customer"
        | "supplier"
        | "product"
        | "project"
        | "project_gate"
        | "purchase_order"
        | "shipment"
        | "incident"
        | "market_cell"
        | "change_request"
      document_status: "draft" | "signed" | "approved" | "superseded"
      document_type:
        | "spec_sheet"
        | "tech_pack"
        | "sample_report"
        | "pi"
        | "po"
        | "psi_report"
        | "test_report"
        | "sds"
        | "doc_of_conformity"
        | "technical_file"
        | "label_artwork"
        | "packing_list"
        | "commercial_invoice"
        | "bill_of_lading"
        | "customs"
        | "delivery_receipt"
        | "gate_approval"
        | "change_request"
        | "contract"
        | "certificate"
        | "other"
      gate_code:
        | "G1"
        | "G2"
        | "G3"
        | "G4"
        | "G5"
        | "PL_G1"
        | "PL_G2"
        | "PL_G3"
        | "PL_G4"
        | "L_G1"
        | "L_G2"
      gate_status: "pending" | "passed" | "rolled_back"
      incident_deadline_kind:
        | "supplier_damage"
        | "carrier_claim"
        | "demurrage"
        | "supplier_storage"
        | "platform_escalation"
        | "document_request"
        | "other"
      incident_family: "ol" | "oa" | "ou" | "ot" | "om"
      incident_outcome: "full_recovery" | "partial_recovery" | "loss"
      incident_party:
        | "customer"
        | "supplier"
        | "forwarder"
        | "platform"
        | "warehouse"
      incident_root_cause:
        | "human_error"
        | "document_data"
        | "communication"
        | "supplier"
        | "carrier"
        | "platform_regulation"
        | "customer"
      incident_severity: "s1" | "s2" | "s3"
      incident_status: "open" | "contained" | "closed"
      market_cell_status:
        | "candidate"
        | "planned"
        | "preparing"
        | "uploaded"
        | "live"
        | "suppressed"
        | "paused"
        | "stopped"
        | "removed"
      market_compliance: "green" | "yellow" | "red" | "pending"
      media_role: "primary_image" | "gallery" | "evidence_photo" | "attachment"
      payment_kind: "deposit" | "balance" | "other"
      payment_payer: "company" | "customer"
      platform_access: "authorized_user" | "none"
      product_status:
        | "concept"
        | "development"
        | "approved"
        | "ordering"
        | "on_sale"
        | "paused"
        | "archived"
      project_path: "a_sourcing" | "b_private_label"
      project_phase:
        | "P1"
        | "P2"
        | "PL1"
        | "PL2"
        | "PL3"
        | "PL4"
        | "PL5"
        | "PL6"
        | "PL7"
        | "P3"
        | "P4"
        | "P5"
        | "P6"
        | "L1"
        | "L2"
        | "L3"
        | "L4"
        | "L5"
        | "closed"
      project_status: "active" | "on_hold" | "closed" | "cancelled"
      project_type: "npi" | "variant" | "revision" | "reorder"
      purchase_order_status:
        | "draft"
        | "sent"
        | "pi_received"
        | "pi_approved"
        | "deposit_paid"
        | "in_production"
        | "ready"
        | "balance_paid"
        | "closed"
        | "cancelled"
      shipment_mode: "fcl20" | "fcl40" | "lcl" | "road" | "courier" | "air"
      shipment_status:
        | "planned"
        | "booked"
        | "loaded"
        | "in_transit"
        | "at_customs"
        | "delivered"
        | "accepted"
        | "disputed"
        | "cancelled"
      stock_source: "customer_warehouse" | "3pl" | "platform" | "pan_eu"
      supplier_status: "candidate" | "approved" | "suspended"
      task_status: "todo" | "doing" | "done" | "blocked"
      type_permission_command: "select" | "insert" | "update" | "delete"
      type_permission_kind: "read" | "create" | "modify"
      warehouse_type: "own" | "third_party" | "fba"
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

