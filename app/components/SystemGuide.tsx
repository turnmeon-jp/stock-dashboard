export default function SystemGuide() {
  return (
    <div className="space-y-6 pb-8 text-sm text-slate-800">

      {/* ---- 概要 ---- */}
      <section>
        <h2 className="mb-2 text-base font-bold text-slate-900">システム概要</h2>
        <p className="text-slate-600 leading-relaxed">
          全上場株（約3,756銘柄・10年分）のバックテストで統計的優位性を確認した条件に
          絞って毎日スクリーニングし、注文計画を自動生成するシステムです。
          日次自動更新（毎日19:00）し、翌営業日の発注候補を表示します。
        </p>
      </section>

      {/* ---- バックテスト結果 ---- */}
      <details className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <summary className="cursor-pointer select-none text-base font-bold text-emerald-900">バックテスト結果</summary>
        <div className="mt-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "全銘柄E[R]", value: "+16.2%", note: "全候補銘柄の平均期待値" },
            { label: "95% CI下限", value: "+11.7%", note: "統計的優位性の根拠" },
            { label: "レジームon E[R]", value: "+23.9%", note: "breadth≥50%時" },
            { label: "N=50 勝率", value: "96%", note: "50銘柄分散時" },
          ].map((s) => (
            <div key={s.label} className="rounded border border-emerald-200 bg-white px-3 py-2">
              <div className="text-xs text-slate-500">{s.label}</div>
              <div className="mt-0.5 font-mono text-lg font-bold text-emerald-700">{s.value}</div>
              <div className="text-[10px] text-slate-400">{s.note}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          ※ E[R] は保有240日後の期待リターン（上位1%除外済み）。
          優位性は上位1%の外れ値に依存しているため集中投資は危険。N=50の分散が推奨。
        </p>
        </div>
      </details>

      {/* ---- 銘柄抽出ロジック ---- */}
      <details>
        <summary className="cursor-pointer select-none text-base font-bold text-slate-900">銘柄抽出ロジック（3条件のAND）</summary>
        <div className="mt-3 space-y-3">

          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="font-semibold text-slate-700">① 中型流動性フィルター</p>
            <p className="mt-1 text-slate-600 leading-relaxed">
              日次売買代金 <span className="font-mono font-semibold">1〜50億円</span>の銘柄に限定。
              大型株は動きが小さく個人では優位性が出にくい。小型株は流動性リスクが高く
              出来ない（スプレッド拡大・成行不成立）。中型帯がリスク／リターンのバランスが良い。
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="font-semibold text-slate-700">② 相対強度（RS）健全帯フィルター</p>
            <p className="mt-1 text-slate-600 leading-relaxed">
              120日相対強度 <span className="font-mono font-semibold">-4% 〜 +23%</span> に限定。
              RS120 = （当該株の120日騰落率 − 全市場中央値）。
              弱すぎる銘柄（RS &lt; -4%）は下落トレンド継続リスクが高く、
              強すぎる銘柄（RS &gt; +23%）は天井近くで買うリスクがある。
              健全な押し目を形成している銘柄を狙う。
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="font-semibold text-slate-700">③ 中期トレンドフォロー（SMA25乖離）</p>
            <p className="mt-1 text-slate-600 leading-relaxed">
              25日移動平均からの乖離率 <span className="font-mono font-semibold">-8% 〜 +12%</span>。
              上昇トレンド中の押し目（SMA25付近まで戻った局面）でエントリー。
              大きく乖離している場合は追いかけ買いや過熱圏でのエントリーを避ける。
            </p>
          </div>
        </div>
      </details>

      {/* ---- レジームフィルター ---- */}
      <details className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <summary className="cursor-pointer select-none text-base font-bold text-blue-900">レジームフィルター（市場環境判定・2階建て）</summary>
        <p className="text-slate-700 leading-relaxed mb-3 mt-2">
          大型株の地合い（Layer0-A）と グロース市場の地合い（Layer0-B）を独立に計算し、
          <span className="font-semibold">より保守的な方を最終レジームとして採用</span>します。
          どちらか一方でも崩れていれば新規エントリーを抑制します。
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div className="rounded border border-blue-200 bg-white px-3 py-2 text-xs">
            <p className="font-semibold text-blue-800 mb-1">Layer0-A: 大型株ブレッドス</p>
            <p className="text-slate-600">売買代金上位500銘柄のうち、<span className="font-mono">SMA200を上回る比率</span>。</p>
            <p className="text-slate-500 mt-1">≥ 50% → risk_on　/ ≥ 40% → neutral　/ &lt; 40% → risk_off</p>
          </div>
          <div className="rounded border border-blue-200 bg-white px-3 py-2 text-xs">
            <p className="font-semibold text-blue-800 mb-1">Layer0-B: グロース市場ブレッドス</p>
            <p className="text-slate-600">東証グロース市場（601銘柄）のうち、<span className="font-mono">SMA75を上回る比率</span>。</p>
            <p className="text-slate-500 mt-1">≥ 45% → risk_on　/ ≥ 35% → neutral　/ &lt; 35% → risk_off</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "risk_on（緑）", cond: "両方 risk_on", note: "新規エントリー上限2件/日", color: "text-emerald-700" },
            { label: "neutral（橙）", cond: "どちらかが neutral", note: "新規1件/日・サイズ60%", color: "text-amber-600" },
            { label: "risk_off（赤）", cond: "どちらかが risk_off", note: "新規エントリー停止", color: "text-rose-600" },
          ].map((s) => (
            <div key={s.label} className="rounded border border-blue-200 bg-white px-2 py-2 text-xs">
              <p className={`font-semibold ${s.color}`}>{s.label}</p>
              <p className="text-slate-500 mt-0.5">{s.cond}</p>
              <p className="text-slate-600 mt-0.5">{s.note}</p>
            </div>
          ))}
        </div>
      </details>

      {/* ---- 注文計画 ---- */}
      <details>
        <summary className="cursor-pointer select-none text-base font-bold text-slate-900">注文計画の計算方法（R=1%ルール）</summary>
        <p className="text-slate-600 mb-3 mt-2 leading-relaxed">
          1トレードのリスク（損切幅×株数）を資産の <span className="font-mono font-semibold">1%（1R = 約3万円）</span> に固定します。
          これにより10連敗しても資産は10%減にとどまります。
          レジームが neutral のときはサイズを60%に縮小（0.6R/トレード）します。
        </p>
        <div className="rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs leading-relaxed text-slate-700">
          <p>エントリー価格 = trigger_price（SMA25付近の指値）</p>
          <p>損切価格    = stop_loss（直近安値 − ATR×0.5 か エントリー − ATR×2 の低い方）</p>
          <p>株数        = floor(1R ÷ (trigger_price − stop_loss) × レジーム係数)  ← 100株単位</p>
          <p>利確目安    = trigger_price + (trigger_price − stop_loss) × 1.5  ← 1.5R</p>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          ※ 実際の注文はIFDOCO（指値エントリー → 約定後に逆指値損切と指値利確をOCO発注）で
          執行することで、エントリー後の監視を最小化できます。
        </p>
      </details>

      {/* ---- 撤収戦略 ---- */}
      <details className="rounded-lg border border-violet-200 bg-violet-50 p-4">
        <summary className="cursor-pointer select-none text-base font-bold text-violet-900">撤収戦略（いつ・どう手仕舞うか）</summary>

        <p className="text-slate-700 leading-relaxed mb-4 mt-2">
          撤収は3層で管理します。①個別銘柄の出口、②ポートフォリオ全体のリスク制御、
          ③相場環境の悪化による活動停止です。
        </p>

        {/* 個別出口 */}
        <div className="mb-4">
          <p className="text-xs font-bold text-violet-800 uppercase tracking-wide mb-2">① 個別銘柄の出口（自動）</p>
          <div className="space-y-2">
            {[
              {
                label: "損切",
                badge: "bg-rose-100 text-rose-700",
                desc: "翌日始値がstop_loss以下になった場合は始値で即撤収。ギャップダウンは始値で成行。含み損を引きずらないための絶対ルール。",
              },
              {
                label: "半利確（1.5R）",
                badge: "bg-amber-100 text-amber-700",
                desc: "高値がtp_first（1.5R相当）を超えたら保有株の半数を売却。利益を確定しつつ残り半数でトレンドを追う。",
              },
              {
                label: "SMA75トレイル",
                badge: "bg-blue-100 text-blue-700",
                desc: "半利確後、終値がSMA75（約75日移動平均）を下抜けたら残り全量を撤収。トレンドの終わりを客観的に判定する。",
              },
              {
                label: "時間切れ（480日）",
                badge: "bg-slate-100 text-slate-600",
                desc: "エントリーから480日（約2年）経過した場合は強制撤収。長期塩漬けを防ぐ。",
              },
            ].map((rule) => (
              <div key={rule.label} className="rounded border border-violet-100 bg-white p-3 flex gap-3">
                <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold h-fit ${rule.badge}`}>
                  {rule.label}
                </span>
                <p className="text-slate-600 text-xs leading-relaxed">{rule.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ポートフォリオ制御 */}
        <div className="mb-4">
          <p className="text-xs font-bold text-violet-800 uppercase tracking-wide mb-2">② ポートフォリオ全体の制御（自動）</p>
          <div className="space-y-2">
            {[
              {
                label: "Rキャップ",
                badge: "bg-indigo-100 text-indigo-700",
                desc: "全建玉の合計リスクがrisk_on=5R・neutral=3R・risk_off=1Rを超える場合は新規エントリーを停止。リスク過多を防ぐ。",
              },
              {
                label: "現金リザーブ",
                badge: "bg-indigo-100 text-indigo-700",
                desc: "総資産の20%（約60万円）は常に現金で保持。急落局面での追加買いや手数料・税金に備える。",
              },
            ].map((rule) => (
              <div key={rule.label} className="rounded border border-violet-100 bg-white p-3 flex gap-3">
                <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold h-fit ${rule.badge}`}>
                  {rule.label}
                </span>
                <p className="text-slate-600 text-xs leading-relaxed">{rule.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* DDストップ */}
        <div>
          <p className="text-xs font-bold text-violet-800 uppercase tracking-wide mb-2">③ ドローダウン停止（自動 / 一部手動）</p>
          <div className="space-y-2">
            {[
              {
                label: "月次DDストップ",
                badge: "bg-rose-100 text-rose-700",
                desc: "月初からの資産下落が −8% に達したら新規エントリーを全停止。翌月レジームが neutral 以上に戻れば自動再開。",
              },
              {
                label: "累計DDストップ",
                badge: "bg-rose-200 text-rose-800",
                desc: "高値からの累計下落が −15% に達したら全停止。この場合は自動再開しない。状況を確認してから手動で再開する。",
              },
            ].map((rule) => (
              <div key={rule.label} className="rounded border border-violet-100 bg-white p-3 flex gap-3">
                <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold h-fit ${rule.badge}`}>
                  {rule.label}
                </span>
                <p className="text-slate-600 text-xs leading-relaxed">{rule.desc}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            ※ 既存ポジションはDDストップ後も撤収しません。個別出口ルール（SL・トレイル）に従って自然に手仕舞います。
          </p>
        </div>
      </details>

      {/* ---- IFDOCO説明 ---- */}
      <details className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <summary className="cursor-pointer select-none text-base font-bold text-amber-900">IFDOCO注文について</summary>
        <p className="text-slate-700 leading-relaxed mt-2">
          <span className="font-semibold">IFD</span>（If Done）= 第1注文が約定したら第2注文を発動。
          <span className="font-semibold ml-2">OCO</span>（One Cancels Other）= 2つの注文のどちらかが約定したら
          もう一方をキャンセル。IFDOCOはこの2つを組み合わせた3本足の注文です。
        </p>
        <div className="mt-3 font-mono text-xs text-slate-700 leading-relaxed bg-white rounded border border-amber-200 px-3 py-2">
          <p>① 指値買い @ trigger_price（エントリー）</p>
          <p className="ml-4">↓ 約定後に自動で ②を発注</p>
          <p>② 逆指値売り @ stop_loss（損切）</p>
          <p className="ml-2">OR 指値売り @ tp_first（利確）</p>
          <p className="ml-4">どちらか先に約定した方が勝ち、もう一方はキャンセル</p>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          ※ 約定後は一切監視不要。ただし1.5R利確後のトレイル（SMA75追尾）は手動管理が必要です。
        </p>
      </details>

      {/* ---- ウォッチ登録 ---- */}
      <details className="rounded-lg border border-teal-200 bg-teal-50 p-4">
        <summary className="cursor-pointer select-none text-base font-bold text-teal-900">ウォッチ登録</summary>
        <p className="text-slate-700 leading-relaxed mt-2">
          「発掘」「気になる銘柄」タブの銘柄カードにある<span className="font-semibold">「ウォッチに追加」</span>ボタンから
          登録すると、「ウォッチ」タブで継続監視できます。手動で追加した銘柄には
          <span className="font-semibold">「手動」バッジ</span>が付き、いつでも削除できます。
          登録銘柄の価格・シグナルは日次バッチで自動更新されます。
        </p>
      </details>

      {/* ---- 信用残の需給タグ ---- */}
      <details className="rounded-lg border border-cyan-200 bg-cyan-50 p-4">
        <summary className="cursor-pointer select-none text-base font-bold text-cyan-900">
          需給タグ（<span className="font-mono">需給◎</span> / <span className="font-mono">需給重</span>）
        </summary>
        <p className="text-slate-700 leading-relaxed mt-2">
          候補・ウォッチの銘柄名の隣に付く信用残タグです。10年分の edge_aligned トレードを
          <span className="font-semibold">信用倍率（買い残÷売り残）</span>と
          <span className="font-semibold">買い残の対出来高比（買い残÷20日平均出来高）</span>で層別すると、
          OOS期間で <span className="font-mono font-semibold">+0.33R / +0.40R</span> の差（銘柄ブロックブートストラップ
          95%CI下限&gt;0）が確認できました。方向は「倍率が高い・買い残が厚いほど良い」で、
          売り残がゼロ（非貸借銘柄）の群が最も成績が良く、本質は買い残の厚さそのものより
          <span className="font-semibold">空売り圧力の不在</span>かもしれません。
        </p>
        <p className="mt-2 text-slate-700 leading-relaxed">
          <span className="font-semibold">需給◎</span> = 信用倍率が高い（またはshort_zero=売り残ゼロ）、
          <span className="font-semibold">需給重</span> = 信用倍率が低い（売り方比率が高め）。
        </p>
        <p className="mt-2 rounded bg-white border border-cyan-200 px-2 py-1 text-xs text-slate-600">
          ⚠️ 検証結果は2025年のデータに偏って牽引されている点に留意が必要です。そのため
          このタグは<span className="font-semibold">まだ機械的な絞り込み条件（フィルタ）にはしていません</span>。
          あくまで参考情報として表示しつつ、候補フォワード検証台帳（candidate_ledger）で
          継続的に成績を測定しています。
        </p>
      </details>

      {/* ---- アクティビスト大量保有検知 ---- */}
      <details className="rounded-lg border border-fuchsia-200 bg-fuchsia-50 p-4">
        <summary className="cursor-pointer select-none text-base font-bold text-fuchsia-900">
          アクティビスト大量保有検知（<span className="font-mono">🎯大量保有</span>バッジ）
        </summary>
        <p className="text-slate-700 leading-relaxed">
          既知アクティビスト（村上系・オアシス・エフィッシモ等）による新規5%大量保有報告（EDINET）を
          日次で検知するタグです。イベントスタディで発行体株の+60営業日超過リターンが
          <span className="font-semibold">中央値+2.69%・勝率55.6%</span>と事前固定の合格基準を満たしましたが、
          2条件のうち勝率側のみでの<span className="font-semibold">辛勝</span>（CI下限はわずかにマイナス、
          n=144と検出力も中程度）です。運用会社等・事業会社の大量保有報告は対照群として全ホライズンで
          中央値マイナスと逆効果であり、<span className="font-semibold">提出者の選別が全て</span>です。
        </p>
        <p className="mt-2 rounded bg-white border border-fuchsia-200 px-2 py-1 text-xs text-slate-600">
          ⚠️ そのため<span className="font-semibold">機械トリガー（自動売買判断）には使っていません</span>。
          「発掘」タブ・候補/ウォッチの銘柄バッジは<span className="font-semibold">注意喚起</span>であり、
          最終判断は個別精査で行ってください。TOB（公開買付）統制は未実装のため、買収プレミアムそのものを
          捉えている可能性も残ります。検出後の値動きは候補フォワード検証台帳
          （candidate_ledger system=lvh_activist）で継続測定しています。
        </p>
      </details>

      {/* ---- 投資ドシエ ---- */}
      <details className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
        <summary className="cursor-pointer select-none text-base font-bold text-indigo-900">投資ドシエ（深掘り調査）</summary>
        <p className="text-slate-700 leading-relaxed mt-2">
          「ウォッチ」「気になる銘柄」タブのカードから、Opus 4.8 がEDINET有価証券報告書とWeb一次情報を調査し
          投資ドシエを生成します。判定は
          <span className="font-semibold">「落選」「重大懸念」「懸念あり・監視」「落選事由なし」</span>
          の4段階で、<span className="font-semibold">買い推奨ではなく落選材料の検出</span>が目的です。
          銘柄選定は機械スクリーナ、エントリー/出口水準（ウォッチ・出口監視の計算値）は機械が担い、
          LLMは判定に関与しません。日次バッチでウォッチ銘柄のうち未生成分を上限2件/日で自動生成します。
        </p>
      </details>

      {/* ---- 用語ミニ辞典 ---- */}
      <details className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <summary className="cursor-pointer select-none text-base font-bold text-slate-900">用語ミニ辞典</summary>
        <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 text-xs">
          {[
            ["テーゼ", "持ち続けてよい理由（前提）。崩れたら手放す。"],
            ["反証条件（falsifier）", "前提が間違いだったと判断するチェック項目。"],
            ["テーゼ下書き", "AIが作った保有前提・崩れる条件の下書き。採用は人間が決める。"],
            ["ドシエ", "1銘柄の調査資料。有価証券報告書とWebから買わない理由を審査。"],
            ["落選判定", "「買うべき」ではなく「買ってはいけない理由がないか」の審査結果。"],
            ["需給", "買いたい人と売りたい人のバランス。"],
            ["信用買い残", "借金（信用取引）で買っている人の残高。"],
            ["空売り残", "株を借りて売っている大口の残高（0.5%以上のみ報告）。"],
            ["レジーム", "市場全体の地合い。攻めてよい時期かの判定。"],
            ["R", "1回の取引で許す損失額を1とする単位（例: R=3万円なら+2Rは+6万円）。"],
            ["edge_aligned", "優位性の条件を全て満たした候補。"],
            ["押し目", "上昇トレンド中の一時的な下げ＝買い場候補。"],
            ["寄成上限", "寄付（9時最初の値段）での成行買いの上限価格。超えたら見送り。"],
            ["逆指値", "ここまで下がったら自動で売る予約注文。"],
            ["時間ストップ", "一定期間（60営業日）成果が出なければ見切る規律。"],
            ["部分利確", "大きく含み益が出たら一部だけ売って利益を確保すること。"],
            ["検証台帳 / verdict", "候補抽出方法の「その後の成績」を自動追跡する判定の仕組み。"],
            ["p値", "偶然でもこの成績が出る確率。小さいほど本物らしい（5%以下が目安）。"],
            ["大量保有報告（LVH）", "5%以上株を買った人の届け出。追随買いの手がかり。"],
            ["アクティビスト", "経営に物申す投資家。大量保有報告の提出者の一種。"],
            ["希薄化", "新株が増えて1株あたりの価値が薄まること。"],
            ["押し目余地", "SMA25（25日移動平均線）までの距離。"],
            ["RS", "他の銘柄と比べた強さ（相対強度）。"],
          ].map(([term, desc]) => (
            <div key={term} className="rounded border border-slate-200 bg-white px-2 py-1.5">
              <dt className="font-semibold text-slate-700">{term}</dt>
              <dd className="mt-0.5 text-slate-500 leading-relaxed">{desc}</dd>
            </div>
          ))}
        </dl>
      </details>

      {/* ---- 注意事項 ---- */}
      <p className="text-xs text-slate-400 leading-relaxed border-t border-slate-200 pt-4">
        本システムは個人の自己運用補助ツールです。過去のバックテスト結果は将来の利益を保証しません。
        投資判断はすべて自己責任で行ってください。
      </p>
    </div>
  );
}
