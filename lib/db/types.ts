/**
 * Supabase 生成类型占位
 * ------------------------------------------------------------
 * 待执行 `supabase gen types typescript` 后由生成器覆盖。
 * P0 阶段先给出最小手工类型，避免客户端泛型编译失败。
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/**
 * MVP 0.1 数据库结构（对应 supabase/migrations/0001_init_schema.sql）
 * 严格来源：交接单 §7.1
 */
export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          target_exam: string | null;
          preferences_json: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          target_exam?: string | null;
          preferences_json?: Json | null;
        };
        Update: Partial<{
          email: string;
          target_exam: string | null;
          preferences_json: Json | null;
        }>;
        Relationships: [];
      };
      learning_items: {
        Row: {
          id: string;
          item_type: "WORD" | "PHRASE" | "CHUNK";
          canonical_form: string;
          content_json: Json;
          topic_tags: string[] | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          item_type: "WORD" | "PHRASE" | "CHUNK";
          canonical_form: string;
          content_json: Json;
          topic_tags?: string[] | null;
        };
        Update: Partial<{
          item_type: "WORD" | "PHRASE" | "CHUNK";
          canonical_form: string;
          content_json: Json;
          topic_tags: string[] | null;
        }>;
        Relationships: [];
      };
      user_item_states: {
        Row: {
          user_id: string;
          item_id: string;
          recognition_level: number;
          recall_level: number;
          application_level: number;
          consecutive_correct: number;
          current_interval_days: number;
          next_review_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          item_id: string;
          recognition_level?: number;
          recall_level?: number;
          application_level?: number;
          consecutive_correct?: number;
          current_interval_days?: number;
          next_review_at?: string;
        };
        Update: Partial<{
          recognition_level: number;
          recall_level: number;
          application_level: number;
          consecutive_correct: number;
          current_interval_days: number;
          next_review_at: string;
        }>;
        Relationships: [];
      };
      learning_events: {
        Row: {
          id: string;
          user_id: string;
          item_id: string;
          event_type: "NEW" | "REVIEW";
          answer: string | null;
          correctness: "FAIL" | "HINTED" | "INDEPENDENT" | "SKIPPED";
          hint_level: number;
          result_json: Json;
          client_event_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          item_id: string;
          event_type: "NEW" | "REVIEW";
          answer?: string | null;
          correctness: "FAIL" | "HINTED" | "INDEPENDENT" | "SKIPPED";
          hint_level?: number;
          result_json?: Json;
          client_event_id: string;
        };
        Update: never;
        Relationships: [];
      };
      speaking_sessions: {
        Row: {
          id: string;
          user_id: string;
          part: "P1" | "P2" | "P3";
          topic: string;
          question: string;
          first_answer: string | null;
          main_issue: Json | null;
          second_answer: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          part: "P1" | "P2" | "P3";
          topic: string;
          question: string;
          first_answer?: string | null;
          main_issue?: Json | null;
          second_answer?: string | null;
        };
        Update: Partial<{
          first_answer: string | null;
          main_issue: Json | null;
          second_answer: string | null;
        }>;
        Relationships: [];
      };
      ability_observations: {
        Row: {
          id: string;
          user_id: string;
          dimension: string;
          evidence_status:
            | "SINGLE_OBSERVATION"
            | "REPEATED_PATTERN"
            | "IMPROVING"
            | "DISPUTED";
          source_type: "SPEAKING" | "REVIEW" | "LEARNING";
          source_id: string;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          dimension: string;
          evidence_status:
            | "SINGLE_OBSERVATION"
            | "REPEATED_PATTERN"
            | "IMPROVING"
            | "DISPUTED";
          source_type: "SPEAKING" | "REVIEW" | "LEARNING";
          source_id: string;
          note?: string | null;
        };
        Update: Partial<{
          evidence_status:
            | "SINGLE_OBSERVATION"
            | "REPEATED_PATTERN"
            | "IMPROVING"
            | "DISPUTED";
          note: string | null;
        }>;
        Relationships: [];
      };
      recommendations: {
        Row: {
          id: string;
          user_id: string;
          task_type: string;
          reason: string;
          priority: "LOW" | "MEDIUM" | "HIGH";
          status: "PENDING" | "ACCEPTED" | "DISMISSED";
          payload_json: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          task_type: string;
          reason: string;
          priority?: "LOW" | "MEDIUM" | "HIGH";
          status?: "PENDING" | "ACCEPTED" | "DISMISSED";
          payload_json?: Json;
        };
        Update: Partial<{
          status: "PENDING" | "ACCEPTED" | "DISMISSED";
        }>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
  };
}
