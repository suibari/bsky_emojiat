# えもじあっと（EmojiAt）

文字を打つだけで、Nagi や AT Protocol のアプリで使えるカスタム絵文字を作れる Web アプリです。
[絵文字侍](https://zenn.dev/praha/articles/z-emoji-samurai) を強くリスペクトしています。

## できること

- 文字列から絵文字を生成（18書体、単色・グラデーション、縁取り、斜め、縦書き、行間、余白、背景）
- 静止画（PNG）とアニメーション（GIF）。エフェクトを重ねるとアニメになります（6カテゴリ・25種）
- 横長（1:1 / 2:1 / 3:1 / 4:1、高さ 128px 固定）
- ログインなしでダウンロード・ブラウザ（IndexedDB）への保存
- AT Protocol でログインすると PDS に保存・一覧・編集・削除

## 保存形式

PDS には [Bluemoji](https://github.com/aendra-rininsland/bluemoji) 形式の `blue.moji.collection.item` で保存します。
Nagi と同じ形式なので、保存した絵文字はそのまま Nagi の絵文字ピッカーに出ます。

| コレクション | 中身 |
| --- | --- |
| `blue.moji.collection.item` | 絵文字本体。`formats_v0` の `png_128` または `gif_128` に画像 blob（256KB 以下） |
| `com.suibari.emojiat.recipe` | 同じ rkey のサイドカー。編集用のレシピ（文字・書体・色・エフェクト） |

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
