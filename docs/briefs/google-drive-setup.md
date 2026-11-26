# One-time Google setup: "Save to my Drive" in ICEYfish

About 10 minutes. Nothing you create here is a password or secret. The three values you send back are public IDs, made to sit inside a web page.

## 1. Create a project
1. Open https://console.cloud.google.com/ and sign in with the Google account that owns your ManaBox folder.
2. At the top, click the project picker, then **New project**. Name it `ICEYfish` and click **Create**. Make sure it's selected at the top afterwards.

## 2. Turn on two APIs
3. Menu ☰ → **APIs & Services → Library**.
4. Search **Google Drive API**, open it, click **Enable**.
5. Go back, search **Google Picker API**, open it, click **Enable**.

## 3. Consent screen (who may sign in)
6. Menu ☰ → **APIs & Services → OAuth consent screen** (it may be called **Google Auth Platform**). Click **Get started**.
7. App name: `ICEYfish`. Support email: your email. Audience: **External**. Contact email: your email. Agree and click **Create**.
8. Under **Data access** (or **Scopes**), click **Add or remove scopes**, tick `.../auth/drive.file` ("See, edit, create and delete only the specific Google Drive files you use with this app") and save.
9. Under **Audience** (or **Test users**), click **Add users** and add your own Google email. Leave the app in **Testing**. That's fine for just you, and it needs no review by Google.

## 4. The sign-in ID
10. Menu ☰ → **APIs & Services → Credentials → Create credentials → OAuth client ID**.
11. Application type: **Web application**. Name: `ICEYfish web`.
12. Under **Authorized JavaScript origins**, click **Add URI** and enter exactly `https://skyweezydeezy.github.io`. Leave **Authorized redirect URIs** empty.
13. Click **Create**. Copy the **Client ID** (it ends in `.apps.googleusercontent.com`). Ignore the "client secret": don't copy or send it.

## 5. The picker key
14. Still in **Credentials**: **Create credentials → API key**. Copy the key.
15. Click the key to edit it:
    - **Application restrictions:** Websites, add `https://skyweezydeezy.github.io/*`.
    - **API restrictions:** Restrict key, choose **Google Picker API** only.
    - Click **Save**.

## 6. Project number
16. Menu ☰ → **IAM & Admin → Settings** (or the project's **Dashboard**). Copy the **Project number** (digits only).

## 7. Send these three to me
- Client ID: `…apps.googleusercontent.com`
- API key: `AIza…`
- Project number: `123456789012`

## What happens after that
I build a **"Save to my Drive"** button. The first time you tap it, you'll see:
- **Google sign-in.** Because the app is in Testing, Google shows an "unverified app" warning. Choose **Continue**; it's your own project.
- **The Drive access screen.** Allow it.
- **A folder picker.** Pick your **ManaBox** folder.

After that, one tap saves a pasted deck straight into that folder, and the hourly check teaches its cards. ICEYfish can only see the files it saves, not the rest of your Drive.
