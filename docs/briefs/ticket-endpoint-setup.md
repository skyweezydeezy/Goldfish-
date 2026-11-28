# One-time Google setup: tickets that reach you, for every visitor (T-120)

About 10 minutes. No Google Cloud project, no OAuth, no API key and **no secret in the app**. The only value you send back is the web app's public `/exec` URL.

## Why tickets only reached you when you were signed in
"Save to my Drive" (T-109 phase 2) asks the *visitor* to sign in with Google and uploads into the *visitor's own* Drive (scope `drive.file`, the visitor's token). A visitor's file lands in the visitor's Drive, so it only reached you when you were the one signed in. "Teach these cards" opens a pre-filled GitHub issue, which needs a GitHub account. Neither is a ticket box.

The fix: a Google Apps Script web app deployed as **Execute as: Me** and **Who has access: Anyone**. The script runs with *your* permissions on your Sheet and Drive; the visitor only sends it a plain web request.

## 1. The Sheet and the script
1. Go to https://sheets.google.com, signed in as the account that owns your ManaBox folder. Click **Blank spreadsheet**. Name it `ICEYfish tickets`.
2. In the Sheet: **Extensions → Apps Script**. A new tab opens.
3. Delete the sample code. Paste the whole of `tools/google/ticket-endpoint.gs` from the repo. Click **Save** (💾). Name the project `ICEYfish tickets`.

## 2. Optional settings (Script Properties)
4. In the Apps Script tab: **Project Settings** (⚙ in the left bar) → scroll to **Script Properties** → **Edit script properties** → **Add script property**. Add any of these, then **Save**:

| Property | Value | Effect if empty |
|---|---|---|
| `DRIVE_FOLDER_ID` | the ID of your ManaBox folder: open it in Drive, copy the end of the address after `/folders/` | decks are only recorded in the Sheet |
| `NOTIFY_EMAIL` | your email | no email |
| `GITHUB_REPO` | `skyweezydeezy/ICEYfish` | no GitHub issue |
| `GITHUB_TOKEN` | a fine-grained personal access token, see step 3 | no GitHub issue |

   The GitHub token lives only here, in Google's Script Properties. Never paste it into the app, a chat or the repo.

## 3. Optional: the GitHub token (so the hourly "Teach:" check sees Sheet tickets)
The hourly check reads GitHub issues titled `Teach:`. With a token the script opens that issue itself, in the same layout the app's GitHub form uses, label `unlearned`; the same cards sent again within 6 hours do not open a second issue.
5. GitHub → your avatar → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
6. Repository access: **Only select repositories** → `ICEYfish`. Permissions: **Issues: Read and write** (nothing else). Pick an expiry (e.g. 1 year; put a reminder in your calendar). Generate, copy it, paste it as `GITHUB_TOKEN` in step 4.

Without a token, tickets still land in the Sheet; MAIN's hourly check can also read the Sheet's `Tickets` tab (rows with Status `new`).

## 4. Grant permissions
7. In the code editor choose the function **`setup`** in the drop-down at the top and click **Run ▶**.
8. **Review permissions** → pick your account → "Google hasn't verified this app" → **Advanced → Go to ICEYfish tickets (unsafe)** → **Allow**. (It is your own script; it asks for Sheets, Drive, Mail and outside requests.) This creates the `Tickets` tab.

## 5. Deploy
9. **Deploy → New deployment**. Click ⚙ **Select type → Web app**.
10. Description: `tickets v1`. **Execute as: Me (your email)**. **Who has access: Anyone**. (Not "Anyone with Google account": that brings the sign-in back.) Click **Deploy**.
11. Copy the **Web app URL**. It looks like `https://script.google.com/macros/s/AKfycb…/exec`. It is public by design.
12. Test: open that URL in a private window. You should see `{"ok":true,"service":"ICEYfish tickets"}`.

## 6. Send the URL to me
13. Send the `/exec` URL to the Visuals session. It goes into `goldfish/static/ticket-config.js` (`endpoint: '…'`), the one line that switches the app from the GitHub link to the endpoint.

## After you edit the script
Saving does **not** change the live web app. Each time you change the code: **Deploy → Manage deployments → ✏ (edit) → Version: New version → Deploy**. The `/exec` URL stays the same. Choosing **New deployment** instead gives a *new* URL, which then must be sent to me again. Changed properties apply at once. A changed permission list (new service in the code) needs **Run ▶ setup** again.

## What the app sends, and the limits
- `Teach these cards`: card names, their Scryfall link, each unread rules line (up to 4 per card, 240 characters), the app version, where it was tapped, a random per-page client id. **Never the decklist.**
- `Send deck for teaching` (replaces "Save to my Drive" once the URL is set): the deck `.txt` (name and text), the unread cards and lines, the version.
- Limits in the script: 60 000-character request, 40 cards, 20 000-character deck, a hidden `hp` field that must stay empty (bots fill it: silently dropped), 20 tickets a minute overall and 3 a minute per page load (CacheService). Text starting with `=`, `+`, `-` or `@` is stored as text, never a formula.
- If the endpoint is down or refuses, the button says "Send failed" and the next tap opens the GitHub link; a failed deck send falls back to the device's share sheet / download.
- Apps Script free quota (about 20 000 web requests and 100 emails a day on a normal account) is far above any use here.
