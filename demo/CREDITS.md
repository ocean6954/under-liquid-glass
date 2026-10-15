# デモ素材の出所

デモページの背景動画は Pixabay から取得したもの。Pixabay Content License に
基づき、帰属表示なしで商用利用・改変・再配布ができる（素材そのものを競合する
素材サイトで再配布することだけが禁止されている）。

| ファイル | 元ファイル名 | 内容 |
| --- | --- | --- |
| `backdrop.mp4` | `367164_medium.mp4` | 夕暮れの鉄橋と川。サイトとデモの既定 |
| `backdrop-stars.mp4` | `285663_medium.mp4` | 星空とログハウス |
| `backdrop-hills.mp4` | `367684_medium.mp4` | 山岳の空撮（横向き素材） |

いずれも `ffmpeg` で縮小・音声除去・faststart 化してある。元ファイルは
`assets/`（gitignore 済み、ローカルのみ）。

npm パッケージには含まれない（`files` は `dist` と `diag.html` のみ）。
公開されるのは GitHub リポジトリと GitHub Pages。
