// 棚卸し（WP-B）: ウォッチ登録理由・期限まわりの型と定数。
// node:fs 等サーバー専用importを一切持たないクライアントセーフなモジュール（watchlist.ts は
// readWatchlist 用に node:fs を読み込んでおり、"use client" コンポーネントがそこから値を
// importすると node:fs ごとクライアントバンドルへ引き込まれビルドが壊れるため分離している）。

// 棚卸し登録理由の固定5択（config.yaml側の定義と一致させる）。
// domain_screen は自動付与専用のためUIの選択肢には含めない。
export const WATCH_REASON_OPTIONS: { key: string; label: string }[] = [
  { key: "pullback_wait", label: "押し目待ち" },
  { key: "event_wait", label: "決算・イベント待ち" },
  { key: "theme_watch", label: "テーマ・思惑の観測" },
  { key: "value_rerate", label: "割安・再評価待ち" },
  { key: "other", label: "その他" },
];
export const WATCH_REASON_KEYS: readonly string[] = WATCH_REASON_OPTIONS.map((o) => o.key);
// 追加フォーム・route.tsのフォールバック既定値
export const DEFAULT_WATCH_REASON = "pullback_wait";

// いつまで見るかを明確化するためのメタ情報（pipeline/watchlist.py が watchlist.json に付与）。
export interface WatchMeta {
  reason: string | null;          // 登録理由キー（5択 or domain_screen）。null = 理由未設定（移行状態）
  reason_label: string | null;    // reason の日本語ラベル（バックエンドが解決済み。表示にそのまま使う）
  reason_note: string;            // 任意メモ
  event_date: string | null;      // reason=event_wait の時のイベント予定日（YYYY-MM-DD）
  added_at: string;               // ウォッチ登録日
  review_by: string | null;       // 棚卸し期限（YYYY-MM-DD）
  days_watched_bdays: number;     // 登録からの経過営業日数
  triage_due: boolean;            // 棚卸し（継続/除外の判断）が必要か
  triage_why: string | null;      // 棚卸し理由（"理由未設定" / "期限到来" / "見送り連続20営業日" / "イベント日通過"）
  dormant: boolean;               // 休眠（一覧から折りたたみ対象）
  miokuri_streak_bdays: number;   // 直近の連続「見送り」営業日数
}
