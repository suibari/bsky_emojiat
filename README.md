# えもじあっと（EmojiAt）

文字を打つだけで、Nagi や AT Protocol のアプリで使えるカスタム絵文字を作れる Web アプリです。
[絵文字侍](https://zenn.dev/praha/articles/z-emoji-samurai) を強くリスペクトしています。

## できること

- 文字列から絵文字を生成（18書体、単色・グラデーション、縁取り、斜め、縦書き、行間、余白、背景）
- 画像から絵文字を生成（選択・ドロップ・貼り付け、全体／切り抜き、拡大縮小とドラッグでの位置合わせ、ふちとつながった背景の透過、形に沿った縁取り）。取り込んだ画像は長辺 1024px に縮めて作り方と一緒に履歴へ残す
- 静止画（PNG）とアニメーション（GIF）。エフェクトを重ねるとアニメになります（6カテゴリ・25種）
- 横長（1:1 / 2:1 / 3:1 / 4:1、高さ 128px 固定）
- ログインなしで作成・ダウンロード。ダウンロードや PDS 保存をした絵文字は、作り方ごとブラウザ（IndexedDB）の履歴に自動で残り、あとから作り直せる
- AT Protocol でログインすると PDS に保存・一覧・削除（PDS の絵文字は編集しない。下記）
- 日本語・英語表示（ヘッダーの言語セレクタで切り替え。初回はブラウザの言語に合わせ、選んだ言語はブラウザに記憶）

## 保存形式

PDS には [Bluemoji](https://github.com/aendra-rininsland/bluemoji) 形式の `blue.moji.collection.item` で保存します。
Nagi と同じ形式なので、保存した絵文字はそのまま Nagi の絵文字ピッカーに出ます。
画像は `formats_v0` の `png_128`（静止画）または `gif_128`（アニメ）に、256KB 以下の blob として入れます。

### PDS の絵文字を編集しない理由

Nagi は投稿本文やリアクションで、絵文字をレコードの URI だけでなく **CID** まで固定して参照します
（本文には公式の `blue.moji.richtext.facet` 用に画像 blob の CID も入ります）。Nagi の AppView は
CID が現在のレコードと一致しないと画像を返しません（404）。同じ rkey に上書きすると、その絵文字を使った
過去の投稿から絵文字が消えるため、PDS への保存は常に新規作成とし、上書きはしません。
OAuth でも `repo:blue.moji.collection.item?action=create&action=delete` だけを求めます。

作り方の設定（レシピ）は PDS に保存しません。ブラウザの履歴に残った絵文字は、どこからも参照されないので何度でも作り直せます。

## 開発

```sh
npm install          # .npmrc で legacy-peer-deps を有効にしています（npm 10.9 の peer 解決の不具合回避）
npm run dev          # http://127.0.0.1:5173 （OAuth のループバッククライアントのため 127.0.0.1 で開く）
npm test
npm run check
```

ローカルでは AT Protocol のループバッククライアント（`http://localhost?...`）としてログインします。
本番では `/oauth/client-metadata.json` をリクエストの origin から生成します。

## デプロイ

Cloudflare Pages（`@sveltejs/adapter-cloudflare`）。本番ドメインは `emojiat.suibari.com` を想定しています。

## 今後

- EmbeddingGemma による入力語からのエフェクト提案（調査メモ: [docs/embeddinggemma.md](docs/embeddinggemma.md)）
- Nagi からえもじあっとへの導線
