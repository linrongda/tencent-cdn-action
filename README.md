# Tencent Cloud CDN & EdgeOne Action

GitHub Action for refreshing and preheating **Tencent Cloud CDN & EdgeOne** cache.
Supports **refreshing directories**, **refreshing URLs**, and **preheating URLs**.

---

## ⚠️ Migration (breaking change)

This action no longer accepts the previous JSON-style inputs (`cdn-paths`, `eo-paths`, `eo-zoneid`).
You must now provide targets using the multiline `paths` input. Each line contains one or more tokens separated by whitespace. Lines starting with a Zone ID (`zone-...`) are treated as EdgeOne zone entries; other tokens are treated as CDN paths.

Example migration:

Old (JSON inputs):

```yaml
with:
  cdn-paths: '["https://example.com/"]'
  eo-zoneid: 'zone-XXXX'
  eo-paths: '["https://example.com/"]'
```

New (`paths`):

```yaml
with:
  paths: |
    https://example.com/
    zone-XXXX https://example.com/
```

The new `paths` format is simpler and supports multiple EO zones in the same input.

---

## ✨ Features

* ✅ **PurgePathCache**: Refresh directory cache (e.g. `https://example.com/`)
* ✅ **PurgeUrlsCache**: Refresh specific URLs (e.g. `https://example.com/index.html`)
* ✅ **PushUrlsCache**: Preheat specific URLs into CDN nodes

---

## 🚀 Usage

### 1. Add Secrets

In your GitHub repository, go to
`Settings → Secrets and variables → Actions` and add:

* `TENCENT_SECRET_ID`
* `TENCENT_SECRET_KEY`

You can get these like: [Create a sub-user to obtain Tencent Cloud API keys](https://ohttps.com/docs/cloud/tcloud/cdn) (You can select only `QcloudCDNFullAccess` or `QcloudTEOFullAccess` .)

**Attention**: Make sure the Tencent Cloud account you use has the `QcloudCDNFullAccess` or `QcloudTEOFullAccess` permissions!

---

### 2. Example Workflow

```yaml
name: Deploy Website

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      # ... Your build & deploy steps

      - name: Refresh CDN / EdgeOne cache
        uses: linrongda/tencent-cdn-action@v2
        with:
          secret_id: ${{ secrets.TENCENT_SECRET_ID }}
          secret_key: ${{ secrets.TENCENT_SECRET_KEY }}
          action: purgePath
          paths: |
            https://example.com/ https://www.example.com/
            zone-XXXX https://example.com/ https://eo.example.com/
```

---

### 3. Supported Inputs

| Name         | Required | Default     | Description                                            |
| ------------ | -------- | ----------- | ------------------------------------------------------ |
| `secret_id`  | ✅       | —           | Tencent Cloud API SecretId                             |
| `secret_key` | ✅       | —           | Tencent Cloud API SecretKey                            |
| `action`     | ✅       | `purgePath` | Operation type: `purgePath` / `purgeUrls` / `pushUrls` |
| `paths`      | ✅       | —           | Multiline plain text. Each line tokens separated by spaces. Lines starting with `zone-...` are treated as EdgeOne zone entries. |
---

### 4. Examples

#### Refresh whole directory

```yaml
- uses: linrongda/tencent-cdn-action@v2
  with:
    secret_id: ${{ secrets.TENCENT_SECRET_ID }}
    secret_key: ${{ secrets.TENCENT_SECRET_KEY }}
    action: purgePath
    paths: |
      https://example.com/ https://www.example.com/
      zone-XXXX https://example.com/ https://eo.example.com/
```

#### Refresh specific URLs

```yaml
- uses: linrongda/tencent-cdn-action@v2
  with:
    secret_id: ${{ secrets.TENCENT_SECRET_ID }}
    secret_key: ${{ secrets.TENCENT_SECRET_KEY }}
    action: purgeUrls
    paths: |
      https://example.com/index.html
      zone-XXXX https://example.com/style.css
```

#### Preheat URLs

```yaml
- uses: linrongda/tencent-cdn-action@v2
  with:
    secret_id: ${{ secrets.TENCENT_SECRET_ID }}
    secret_key: ${{ secrets.TENCENT_SECRET_KEY }}
    action: pushUrls
    paths: |
      https://example.com/index.html
      zone-XXXX https://example.com/style.css
```

---

### 5. Outputs

```yaml
🔧 Initializing CDN client
  Action type: purgePath
  Target cdn paths: ["https://example.com/"]

🚀 Executing CDN operation
  Selected operation: PurgePathCache (Directory refresh)
  Calling Tencent Cloud CDN API...
  CDN API call succeeded ✅

📦 API Response
  Full response JSON:
  {
    "TaskId": "123456789",
    "RequestId": "abcd-efgh-ijkl"
  }
  TaskId: 123456789
  RequestId: abcd-efgh-ijkl
```
