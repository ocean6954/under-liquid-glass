# under-liquid-glass

iOS Safariでページをバー（ステータスバー/アドレスバー）の裏まで描く「中間ピン留め」パターンの、依存ゼロ・フレームワーク非依存ライブラリ。

## 設計原則

- CSSが真実の所在。 仕組みの適用条件は style.css の環境ゲートだけが持つ。JSは `--ulg-edge-space` を getComputedStyle で読み返すのみ。JSオプションは入力変数 `--ulg-edge-space-config` に書く（`--ulg-edge-space` を直接書かない。条件の二重化は「中間位置に居座ったまま普通のページ」という壊れ方をする）
- `position: fixed` はバー裏に描画されない（実機確認済み）。全画面層は `[data-ulg-overlay]`（surface基準のabsolute）で提供する
- メディアクエリ内で上書きしたプロパティを条件クラスで戻すときは、変えたもの全部を戻す（position だけ戻して height が残ってしまうなどのケース）
- 高さの単位はゲート内 `100svh` / ゲート外 `100dvh`。混ぜない。

## コマンド

- `npm run build` — tsup (esm+cjs+d.ts) + style.css コピー
- `npm test` / `npm run typecheck`

## 制約

- 実機（iPhone Safari）でしか最終検証できない。診断は同梱の `diag.html` を単体デプロイして行う
- リモートリポジトリ作成・npm publish はユーザーの明示指示があってから
