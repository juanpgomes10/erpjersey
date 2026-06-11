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
      campaigns: {
        Row: {
          created_at: string
          id: string
          message: string | null
          name: string
          recipient_count: number
          segment_filter: Json | null
          status: Database["public"]["Enums"]["campaign_status"]
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          name: string
          recipient_count?: number
          segment_filter?: Json | null
          status?: Database["public"]["Enums"]["campaign_status"]
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          name?: string
          recipient_count?: number
          segment_filter?: Json | null
          status?: Database["public"]["Enums"]["campaign_status"]
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          city: string | null
          created_at: string
          id: string
          instagram: string | null
          name: string
          notes: string | null
          phone: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          id?: string
          instagram?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          id?: string
          instagram?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      import_items: {
        Row: {
          id: string
          import_id: string
          product_name: string
          quantity: number
          unit_cost: number
        }
        Insert: {
          id?: string
          import_id: string
          product_name: string
          quantity: number
          unit_cost: number
        }
        Update: {
          id?: string
          import_id?: string
          product_name?: string
          quantity?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_items_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
        ]
      }
      imports: {
        Row: {
          carrier: string | null
          carrier_code: string | null
          country: string | null
          created_at: string
          customs_fee: number | null
          expected_delivery: string | null
          id: string
          last_tracking_update: string | null
          linked_order_ids: string[]
          notes: string | null
          order_numbers: number[]
          photos: string[]
          status: Database["public"]["Enums"]["import_status"]
          store_id: string
          supplier: string | null
          total_value: number
          tracking_code: string | null
          tracking_events: Json
          tracking_status_raw: string | null
          updated_at: string
          value_usd: number
        }
        Insert: {
          carrier?: string | null
          carrier_code?: string | null
          country?: string | null
          created_at?: string
          customs_fee?: number | null
          expected_delivery?: string | null
          id?: string
          last_tracking_update?: string | null
          linked_order_ids?: string[]
          notes?: string | null
          order_numbers?: number[]
          photos?: string[]
          status?: Database["public"]["Enums"]["import_status"]
          store_id: string
          supplier?: string | null
          total_value?: number
          tracking_code?: string | null
          tracking_events?: Json
          tracking_status_raw?: string | null
          updated_at?: string
          value_usd?: number
        }
        Update: {
          carrier?: string | null
          carrier_code?: string | null
          country?: string | null
          created_at?: string
          customs_fee?: number | null
          expected_delivery?: string | null
          id?: string
          last_tracking_update?: string | null
          linked_order_ids?: string[]
          notes?: string | null
          order_numbers?: number[]
          photos?: string[]
          status?: Database["public"]["Enums"]["import_status"]
          store_id?: string
          supplier?: string | null
          total_value?: number
          tracking_code?: string | null
          tracking_events?: Json
          tracking_status_raw?: string | null
          updated_at?: string
          value_usd?: number
        }
        Relationships: [
          {
            foreignKeyName: "imports_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          access_token: string | null
          created_at: string
          external_store_id: string | null
          id: string
          is_active: boolean
          last_synced_at: string | null
          platform: string
          store_id: string
          store_name: string | null
          store_url: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          external_store_id?: string | null
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          platform: string
          store_id: string
          store_name?: string | null
          store_url?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          created_at?: string
          external_store_id?: string | null
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          platform?: string
          store_id?: string
          store_name?: string | null
          store_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          contact: string | null
          created_at: string
          id: string
          interest: string | null
          last_contact: string | null
          name: string
          notes: string | null
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          contact?: string | null
          created_at?: string
          id?: string
          interest?: string | null
          last_contact?: string | null
          name: string
          notes?: string | null
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          contact?: string | null
          created_at?: string
          id?: string
          interest?: string | null
          last_contact?: string | null
          name?: string
          notes?: string | null
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          email_enabled: boolean
          financial_due: boolean
          financial_due_days: number
          id: string
          import_blocked: boolean
          import_delivered: boolean
          import_out_for_delivery: boolean
          import_taxed: boolean
          stock_minimum: boolean
          stock_zero: boolean
          store_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_enabled?: boolean
          financial_due?: boolean
          financial_due_days?: number
          id?: string
          import_blocked?: boolean
          import_delivered?: boolean
          import_out_for_delivery?: boolean
          import_taxed?: boolean
          stock_minimum?: boolean
          stock_zero?: boolean
          store_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_enabled?: boolean
          financial_due?: boolean
          financial_due_days?: number
          id?: string
          import_blocked?: boolean
          import_delivered?: boolean
          import_out_for_delivery?: boolean
          import_taxed?: boolean
          stock_minimum?: boolean
          stock_zero?: boolean
          store_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          related_import_id: string | null
          store_id: string
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          related_import_id?: string | null
          store_id: string
          title: string
          type?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          related_import_id?: string | null
          store_id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_related_import_id_fkey"
            columns: ["related_import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          product_id: string | null
          quantity: number
          size: Database["public"]["Enums"]["product_size"]
          unit_price: number
        }
        Insert: {
          id?: string
          order_id: string
          product_id?: string | null
          quantity: number
          size: Database["public"]["Enums"]["product_size"]
          unit_price: number
        }
        Update: {
          id?: string
          order_id?: string
          product_id?: string | null
          quantity?: number
          size?: Database["public"]["Enums"]["product_size"]
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cancelled_at: string | null
          created_at: string
          customer_id: string | null
          delivered_at: string | null
          discount: number
          external_id: string | null
          id: string
          notes: string | null
          order_number: number | null
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          shipped_at: string | null
          source: string | null
          status: Database["public"]["Enums"]["order_status"]
          store_id: string
          total_value: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          customer_id?: string | null
          delivered_at?: string | null
          discount?: number
          external_id?: string | null
          id?: string
          notes?: string | null
          order_number?: number | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          shipped_at?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          store_id: string
          total_value?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          customer_id?: string | null
          delivered_at?: string | null
          discount?: number
          external_id?: string | null
          id?: string
          notes?: string | null
          order_number?: number | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          shipped_at?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          store_id?: string
          total_value?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_sizes: {
        Row: {
          id: string
          product_id: string
          quantity: number
          size: Database["public"]["Enums"]["product_size"]
        }
        Insert: {
          id?: string
          product_id: string
          quantity?: number
          size: Database["public"]["Enums"]["product_size"]
        }
        Update: {
          id?: string
          product_id?: string
          quantity?: number
          size?: Database["public"]["Enums"]["product_size"]
        }
        Relationships: [
          {
            foreignKeyName: "product_sizes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          cost_price: number
          created_at: string
          gender: string | null
          id: string
          image_url: string | null
          min_stock: number
          model: string | null
          name: string
          notes: string | null
          sale_price: number
          season: string | null
          store_id: string
          supplier: string | null
          team: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          cost_price?: number
          created_at?: string
          gender?: string | null
          id?: string
          image_url?: string | null
          min_stock?: number
          model?: string | null
          name: string
          notes?: string | null
          sale_price?: number
          season?: string | null
          store_id: string
          supplier?: string | null
          team?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          cost_price?: number
          created_at?: string
          gender?: string | null
          id?: string
          image_url?: string | null
          min_stock?: number
          model?: string | null
          name?: string
          notes?: string | null
          sale_price?: number
          season?: string | null
          store_id?: string
          supplier?: string | null
          team?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          name: string
          position: string | null
          role: Database["public"]["Enums"]["app_role"]
          store_id: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          id: string
          name: string
          position?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          store_id: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          position?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          store_id?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          id: string
          product_id: string | null
          product_name_snapshot: string | null
          quantity: number
          sale_id: string
          size: Database["public"]["Enums"]["product_size"]
          unit_cost: number
          unit_price: number
        }
        Insert: {
          id?: string
          product_id?: string | null
          product_name_snapshot?: string | null
          quantity: number
          sale_id: string
          size: Database["public"]["Enums"]["product_size"]
          unit_cost?: number
          unit_price: number
        }
        Update: {
          id?: string
          product_id?: string | null
          product_name_snapshot?: string | null
          quantity?: number
          sale_id?: string
          size?: Database["public"]["Enums"]["product_size"]
          unit_cost?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          created_at: string
          customer_id: string | null
          customer_name_snapshot: string | null
          id: string
          net_value: number
          notes: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          profit: number
          source: Database["public"]["Enums"]["sale_source"]
          status: Database["public"]["Enums"]["sale_status"]
          store_id: string
          total_value: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          customer_name_snapshot?: string | null
          id?: string
          net_value?: number
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          profit?: number
          source?: Database["public"]["Enums"]["sale_source"]
          status?: Database["public"]["Enums"]["sale_status"]
          store_id: string
          total_value?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          customer_name_snapshot?: string | null
          id?: string
          net_value?: number
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          profit?: number
          source?: Database["public"]["Enums"]["sale_source"]
          status?: Database["public"]["Enums"]["sale_status"]
          store_id?: string
          total_value?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          city: string | null
          created_at: string
          description: string | null
          id: string
          instagram: string | null
          logo_url: string | null
          name: string
          segment: string | null
          state: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          description?: string | null
          id?: string
          instagram?: string | null
          logo_url?: string | null
          name: string
          segment?: string | null
          state?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          description?: string | null
          id?: string
          instagram?: string | null
          logo_url?: string | null
          name?: string
          segment?: string | null
          state?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          category: Database["public"]["Enums"]["transaction_category"]
          created_at: string
          description: string
          due_date: string | null
          id: string
          notes: string | null
          paid: boolean
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          recurring: boolean
          store_id: string
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
          value: number
        }
        Insert: {
          category?: Database["public"]["Enums"]["transaction_category"]
          created_at?: string
          description: string
          due_date?: string | null
          id?: string
          notes?: string | null
          paid?: boolean
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          recurring?: boolean
          store_id: string
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          value: number
        }
        Update: {
          category?: Database["public"]["Enums"]["transaction_category"]
          created_at?: string
          description?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          paid?: boolean
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          recurring?: boolean
          store_id?: string
          type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "transactions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_store_id: { Args: never; Returns: string }
      has_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "vendedor" | "financeiro"
      campaign_status: "rascunho" | "enviada"
      import_status:
        | "comprado"
        | "enviado"
        | "em_transito"
        | "chegou_brasil"
        | "aguardando_taxa"
        | "saiu_entrega"
        | "entregue"
        | "cancelado"
        | "barrado_alfandega"
      order_status: "pendente" | "pago" | "enviado" | "entregue" | "cancelado"
      payment_method:
        | "pix"
        | "dinheiro"
        | "cartao_credito"
        | "cartao_debito"
        | "fiado"
        | "transferencia"
        | "outro"
      product_size: "P" | "M" | "G" | "GG" | "XGG"
      sale_source: "estoque" | "drop" | "loja_parceira"
      sale_status: "concluida" | "cancelada"
      transaction_category:
        | "venda"
        | "fornecedor"
        | "taxa_importacao"
        | "frete"
        | "aluguel"
        | "marketing"
        | "outros"
      transaction_type: "entrada" | "saida"
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
      app_role: ["admin", "vendedor", "financeiro"],
      campaign_status: ["rascunho", "enviada"],
      import_status: [
        "comprado",
        "enviado",
        "em_transito",
        "chegou_brasil",
        "aguardando_taxa",
        "saiu_entrega",
        "entregue",
        "cancelado",
        "barrado_alfandega",
      ],
      order_status: ["pendente", "pago", "enviado", "entregue", "cancelado"],
      payment_method: [
        "pix",
        "dinheiro",
        "cartao_credito",
        "cartao_debito",
        "fiado",
        "transferencia",
        "outro",
      ],
      product_size: ["P", "M", "G", "GG", "XGG"],
      sale_source: ["estoque", "drop", "loja_parceira"],
      sale_status: ["concluida", "cancelada"],
      transaction_category: [
        "venda",
        "fornecedor",
        "taxa_importacao",
        "frete",
        "aluguel",
        "marketing",
        "outros",
      ],
      transaction_type: ["entrada", "saida"],
    },
  },
} as const
