# 株式運用ダッシュボード

個人投資家が「5銘柄集中・手動執行」で運用するための補助ダッシュボード。
今日のエントリー候補と注文プランを確認して手動発注し、保有ポジションを管理する。

## 起動手順

```bash
cd dashboard
npm install   # 初回のみ
npm run dev
```

ブラウザで http://localhost:3000 を開く。

ビルド確認:

```bash
npm run build
npm run start   # 本番モードで起動
```

> Node は v26（`/opt/homebrew/bin/node`）を想定。PATH に無い場合:
> `export PATH="/opt/homebrew/bin:$PATH"`

## 画面

1. **今日のエントリー候補**
   `output/signals.json` をテーブル表示。各行をクリックで注文プランを展開。
   上位5件は背景色付き（= 5銘柄集中の対象）。
2. **ポートフォリオ**
   手動で建玉（コード・銘柄名・株数・取得単価・取得日・損切価格）を登録。
   `localStorage` に永続化。現在値を手入力すると評価額・損益・損切までの距離を表示。
   合計投資額・合計損益・現金余力（総資金300万 − 投資額）も表示。
3. ヘッダに `generated_at` / `as_of` / 総資金300万円 / 候補件数を表示。

## データソース

バックエンドが `../output/signals.json`（プロジェクト直上の `output/`）を生成する。
ダッシュボードはサーバー側（`app/lib/signals.ts`）で `fs` 読み込みする。
API Route `app/api/signals/route.ts` でも同じデータを JSON で返す（`GET /api/signals`）。
ファイル未存在時は空配列とメッセージを返す。

### signals.json の再生成

```bash
# プロジェクトルートで
python pipeline/daily_signals.py
```

### スキーマ

```jsonc
{
  "generated_at": "ISO",
  "as_of": "YYYY-MM-DD",
  "n_candidates": 6,
  "candidates": [
    {
      "code": "58030", "name": "フジクラ", "sector": "非鉄金属", "market": "プライム",
      "setup_type": "pullback", "as_of": "2026-03-27", "available_at": "2026-03-30",
      "trigger_price": 1234.5, "stop_loss": 1150.0, "tp_first": 1400.0,
      "trail_note": "...", "shares": 200, "invested": 246900, "risk_yen": 16900,
      "effective_r_pct": 0.56, "rsi14": 52.0, "atr14": 45.0, "dist_sma25_pct": -1.2,
      "turnover_oku": 140.0
    }
  ]
}
```

## 構成

- `app/page.tsx` — トップ（ヘッダ + タブ）
- `app/components/DashboardTabs.tsx` — タブ切替（候補 / ポートフォリオ）
- `app/components/CandidatesTable.tsx` — 候補テーブル + 注文プラン
- `app/components/Portfolio.tsx` — 建玉管理（localStorage）
- `app/api/signals/route.ts` — signals.json を返す API
- `app/lib/signals.ts` — signals.json のサーバー側読み込み
- `app/lib/types.ts` / `format.ts` / `constants.ts` — 型・整形・定数

## 免責

本ツールは自己運用の補助を目的としたものであり、投資助言ではありません。
投資判断は自己責任で行ってください。
