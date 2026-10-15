# under-liquid-glass

Safari の Liquid Glass バーの裏にも、任意のコンテンツを表示できるようにするライブラリ。

[English](./README.md) · 日本語

バー領域には、その座標にあるドキュメントの内容が映ります。普通のページではそれを選べません。スクロール途中なら現在位置の隣にあるものが偶然映り、上端・下端では映すものがありません。このライブラリはその領域の裁量を渡します。ドキュメントを常に自身の端から離れた位置に留めるので、どのスクロール位置でも、バー裏に置いたものがそのまま映ります。

依存ゼロ、フレームワーク非依存、JS 約2kB とスタイルシート1枚。iOS Safari でのみ有効になり、それ以外の環境では普通のページに畳まれます。

## 仕組み

ドキュメントの端の外側には、バーの裏になるものが存在しません。だからバーは自前の色で埋まります。はみ出し幅（`edgeSpace` オプション）とは、ドキュメントをビューポートよりどれだけ高くするかの値です。その半分ずつが上下にはみ出します。そこで：

1. `html` と `body` に `overflow: hidden` を当てる。ユーザーはドキュメントをスクロールできないが、スクリプトからはできる。`body` の既定の margin も外し、ドキュメントをスクローラーとぴったり同じ大きさにする
2. 内側のスクローラー（`[data-ulg-scroller]`、高さ `100svh + はみ出し幅 × 2`）がユーザーのスクロールをすべて受け取る
3. サーフェス（`[data-ulg-surface]`）がはみ出し幅1つ分のパディングでコンテンツを押し下げる。中身がバーの下から始まらずに済む
4. ランタイムがドキュメントを `scrollY = はみ出し幅` にピン留めし、そこに保ち続ける。ビューポートの上下には常にページの内容が存在することになり、それがバーに映る

仕組みが働くかどうかの判断はスタイルシートだけが持ちます。タッチ対応の WebKit でのみ有効になり、ランタイムは条件を再判定せず、解決された値を読み返すだけです。

## クイックスタート

```sh
npm install under-liquid-glass
```

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">

<body>
  <div data-ulg-scroller>
    <div data-ulg-backdrop><!-- ページの背景はここに --></div>
    <div data-ulg-surface>
      <!-- あなたのアプリ -->
    </div>
  </div>
</body>
```

```ts
import 'under-liquid-glass/style.css'
import { underLiquidGlass } from 'under-liquid-glass'

const glass = underLiquidGlass({
  edgeSpace: 140, // バーが覆う量を上回る必要がある。iPhone で 60〜120px
  onStateChange: (state) => console.log(state),
})
```

`viewport-fit=cover` は縦向きのバーには効きませんが、横向きでページをカメラハウジングの先まで届かせるのはこれです。入れておいてください。

`underLiquidGlass()` は DOM ができた後、かつ自分のコードがスクロール位置を読み書きするより前に呼びます。フレームワークでは単純に「最初の `onMounted`」ではありません（子は親より先に mount します）。問題になるのは自分のスクロール処理との順序です。

## レイアウトの補助

要素の役割に印を付ければ、寸法はスタイルシートが持ちます。どれも仕組みが無効な環境では妥当な形に畳まれます。

| 属性 | 役割 |
| --- | --- |
| `data-ulg-scroller` | ユーザーのスクロールを受け取る。必須。ルーターのスクロール復元や「トップへ戻る」は `window` ではなく `controller.scroller` へ |
| `data-ulg-surface` | コンテンツを持ち、はみ出し幅ぶん押し下げられる。必須。スクローラーの中に置く |
| `data-ulg-backdrop` | ページの背景。スクロールポートに対して sticky なので、どのスクロール位置でもバー領域を覆う。スクローラーの直下、サーフェスより前に置く |
| `data-ulg-overlay` | 手前に来る全画面レイヤー。同じ仕組み。スクローラーの直下、サーフェスより前に置く。スクロールロックは `overflow: hidden` ではなく `touch-action` で |

サーフェスの最初と最後の子は、自動的にバー領域まで伸びます。透明なボーダーが箱だけを広げ、中身は動きません。だから最初の画面の背景は、何も書かなくてもバーの裏に届きます。`background-origin` も同時に指定しているので、`background-image` もその帯まで届きます。ただし当たるのは直接の子だけです。`<main>` で包むなら、背景はその包みに置いてください。

### 塗るのは1箇所

ドキュメントの中身は全部バー裏に届きます。バーに映るのは、その座標にあるものです。

- ページの背景は `[data-ulg-backdrop]` に置くのを推奨します。単色でもグラデーションでも画像でも動画でも。必須ではありませんが、どの種類の背景も1箇所で扱えるので、あとで単色を動画に変えるときも置き場所を移さずに済みます
- `[data-ulg-surface]` には塗らないこと。塗ると backdrop を完全に覆います
- 止まった単色や画像なら `body` に置いても動きます。キャンバスになり、固定された文書の裏で動かずに、backdrop と同じようにバー裏へ届きます（iOS 26 で実測）。ただし要素や動画は置けません。backdrop と両方に塗ると、固定中は body 側が隠れて、端に着いたときやフォールバック時にだけ見えるので、バーの見え方がおかしいときに確認する場所が2つになります
- セクションごとの背景だけは例外です。ページ全体の層ではないので、セクションに置けばそのセクションが通過するときバー裏にも入ります

## 無効にする

`underLiquidGlass()` を呼ばないだけでは普通のページになりません。CSS が読まれた時点で `overflow: hidden` が効きます。`<html data-ulg-unlocked>` か `underLiquidGlass({ enabled: false })` を使ってください。属性を自分で書いた場合それはあなたのもので、ランタイムは自分が付けたものしか外しません。

## API

| メンバー | 説明 |
| --- | --- |
| `underLiquidGlass(options?)` | リスナーを登録し、ピン留めし、コントローラーを返す。ブラウザ外では無効なので SSR でも安全 |
| `options.edgeSpace` | はみ出し幅の px（既定 140）。バーが覆う量（iPhone で実測 60〜120px）を上回る必要がある。最初と最後の子の箱がこの分だけ大きくなるので、小さいほど `background-image` の切り取りは減る |
| `options.enabled` | `false` でページを普通のドキュメントのままにする |
| `options.settleDelayMs` | スクリプトからのスクロールが使えないと結論づけるまでの静止時間（既定 500） |
| `options.recoveryLimit` / `options.rangeRetryLimit` | 復帰を試みる回数と、スクロール範囲が狭すぎるときの再確認の回数（各既定 3） |
| `options.onStateChange` | `(state, controller)` — `'pinned'` / `'unlocked'`（畳まれた）/ `'inactive'`（ゲート不一致） |
| `controller.state` / `controller.edgeSpacePx` | 現在の状態と実効はみ出し幅 |
| `controller.scroller` | 実際にスクロールする要素。仕組みが効いていないときは `null`。`controller.scroller ?? window` と書くこと |
| `controller.scrollTo(target, options?)` | 要素を可視領域の上端まで送る。座標変換とはみ出し幅の減算は内側で行う |
| `controller.refresh()` / `controller.destroy()` | 再計測と再ピン留め、リスナーの解除と属性の復帰 |
| `attachDiagnostics(controller)` | `under-liquid-glass/debug` から。診断の節を参照 |
| `EDGE_SPACE_CHANGE_EVENT` | 実効はみ出し幅が切り替わったときに `document.documentElement` で発火 |

以下のカスタムプロパティは公開インターフェースです。仕組みの有効・無効にかかわらず正しい値に解決されます。

| プロパティ | 値 |
| --- | --- |
| `--ulg-edge-space` | 実効はみ出し幅。無効時と畳まれた状態では `0px`。読み取り専用で、書くのは `--ulg-edge-space-config` |
| `--ulg-viewport-height` | 仕組みの内側では `100svh`、外側では `100dvh`。バーに覆われては困るものに使う |
| `--ulg-visible-height` | バー領域を含む可視ウィンドウ。画面いっぱいのセクションはこの高さにする（`100svh` だとバーの被りぶん足りない）。仕組みの外では両方とも `100dvh` に落ち、ブラウザのクロームの伸縮で再レイアウトが走る。困る場合は `min(var(--ulg-viewport-height), 100svh)` で固定する |

## 落とし穴

- `window.scrollY` を動かさないこと。ページ内アンカー、`scrollIntoView`、フォーカス時の自動スクロールはドキュメントを動かし、ピン留めに打ち消されます。代わりに `controller.scrollTo()` を使ってください
- ドキュメントの `scroll-behavior: smooth` はピンを壊します。スクロールが非同期になり、ランタイムが「スクリプトからのスクロールが効かない環境」と判断するためです。ピン自体は CSS に関係なく即時に動き、警告も出しますが、あなた自身の `window.scrollTo` は途中で打ち消されます
- `position: fixed` はバー裏に合成されません。大きさをどう変えてもです。`data-ulg-overlay` か `data-ulg-backdrop` を使ってください。どちらもスクロールポートに対して sticky です
- 祖先の `overflow: hidden` はその sticky を殺します。`body { overflow-x: hidden }` が典型で、スクローラーをその方法でロックすると表示中のオーバーレイも崩れます
- サーフェスの最初または最後の子に `overflow: hidden` があると、バー領域に届くのはその要素の背景だけになります。クリップの境界はパディングボックスで、帯を作る透明ボーダーの内側だからです。色は届くのに絵が消えます。クリップは内側の要素へ移してください
- 最初または最後の子の高さを決めるときはボーダーを足します。`box-sizing: border-box` なら `min-height: calc(var(--ulg-visible-height) + var(--ulg-edge-space))`
- スムーススクロール系のライブラリにはスクローラーを渡します。`controller.scroller ?? window` を向けてください（Lenis なら `wrapper`。動いたという報告はありますが、このリポジトリでは未検証）。`window.scrollY` や `offsetTop` を読むコードは壊れるので、スクローラー基準の `getBoundingClientRect()` に書き換えてください
- ビューポート基準の座標ははみ出し幅ぶんずれます。`EDGE_SPACE_CHANGE_EVENT` を購読して `edgeSpacePx` でオフセットしてください
- 上側のバー領域は測定できません。`env(safe-area-inset-top)` は Safari の UI 下では 0 を返し、`100lvh − 100svh` が表すのはアドレスバーの展開ぶんだけです（ある iPhone で、バーの状態と配置により 40 / 94 / 199 と実測）。はみ出し幅が厳密ではなく余裕を持った値なのはこのためです。残る3辺のインセットは機能し、横向きでカメラハウジングを避けるのに使えます
- スタイルシートは仕組みであってテーマではありません。設定するのは寸法だけで、色は塗りません


## 動いているのに見えないとき

バーの透過はユーザー設定です。ある端末だけ不透明に見えるなら、透明度を下げる、コントラストを上げる、Liquid Glass の外観設定を確認してください。

## 診断

おかしいと感じたら、自分のページに診断を取り付けてください。

```ts
import { attachDiagnostics } from 'under-liquid-glass/debug'
if (import.meta.env.DEV) attachDiagnostics(glass)
```

端末の実測値を出すパネルが現れ、壊れてはいないのに壊れて見える条件を名指しします。スクローラーがスクロールコンテナでなくなっている、サーフェスが backdrop を覆っている、sticky な層が違う場所にある、といったものです。ライブラリが扱う要素に枠を引くほか、バー領域に読める文字を敷けます。ステータスバー越しに TOP と読めればコンテンツは届いていて、それでも地味に見えるなら原因は端末の透明度設定です。別エントリなので本番のバンドルには入りません。`attachDiagnostics` は取り外すための関数を返します。

端末上で自分のビルドを動かせない場合のために `diag.html` も同梱しています。`cp node_modules/under-liquid-glass/diag.html public/`

## トレードオフ

iOS Safari で画面の端まで届くビジュアルが手に入ります。引き換えに、縦向きではアドレスバーの自動折り畳みを失い、ページ全体が従うドキュメント構造を引き受け、どの iOS リリースでも変わりうる Safari の非公開の合成挙動に依存します。「バーが `body` の背景色を拾ってくれれば十分」なら、これは必要ありません。

## ライセンス

MIT
