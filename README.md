# Load Gmail Draft Button

This Chrome or Edge extension adds a **Gmail draft** button next to visible contact email addresses on load detail pages.

The extension uses **Send email** as the main button:

- **Send email** sends the message directly through the Gmail API.
- **Gmail draft** opens Gmail compose in a new tab as the secondary option when drafts are enabled.

Both actions use:

- To: the contact email on the page
- Subject: your saved subject template, defaulting to `Truck for {from} to {to}`
- Body: your saved body template, defaulting to `MC 110082`

Subject and body templates support:

- `{from}` for the origin city, for example `Dover, FL`
- `{to}` for the destination city, for example `Sterling, IL`
- `{email}` for the broker contact email

For the screenshot example, the subject becomes:

```text
Truck for Dover, FL to Sterling, IL
```

## Install

1. Open `chrome://extensions` or `edge://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked**.
4. Select this folder: `gmail-load-draft-extension`.

## Settings

On first use, clicking either email button opens the extension settings page if setup is not complete.

Clicking the extension toolbar icon opens a small popup with:

- **Open settings**
- **Use drafts** toggle, which shows or hides the secondary **Gmail draft** button

### OAuth redirect setup

If **Send email** shows `redirect_uri_mismatch`, open extension settings and copy **Gmail send redirect URI**.

In Google Cloud Console, create or use a **Web application** OAuth client that allows that exact redirect URI. A **Chrome extension** OAuth client cannot be used for this redirect-based Gmail send flow.

For `chrome.identity.launchWebAuthFlow`, this URI looks like:

```text
https://<extension-id>.chromiumapp.org/gmail-send
```

The extension is hardcoded to use this Web application OAuth Client ID:

```text
829309790250-ht3k8mmqmdm9demc495s7l04tm7th54v.apps.googleusercontent.com
```

Click **Choose with Google** to choose a Google account, grant Gmail send permission, and save that Gmail account into the extension in one step.

Choose the account to use and edit the subject/body templates if needed. The extension opens Gmail with `authuser={selected email}`, so Gmail uses that account when it is already signed in.

After an account is selected, **Authorize send** can be used to re-authorize Gmail API sending for that account. This lets **Send email** try to send silently later instead of opening authorization every time.

You can change the selected account list and email body later from the extension details page by opening **Extension options**.

## Notes

- **Send email** requires Google authorization for the Gmail send permission. Use **Authorize send** in settings after configuring OAuth.
- The extension only asks for Gmail send access. It does not request Gmail read access.
- It runs on all pages so it can work on your load board regardless of its domain. You can narrow the `matches` value in `manifest.json` later if you want it limited to one site.
