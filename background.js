const GOOGLE_CLIENT_ID = "829309790250-ht3k8mmqmdm9demc495s7l04tm7th54v.apps.googleusercontent.com";
const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await chrome.storage.sync.get({
    subjectTemplate: null,
    emailBody: null,
    useDrafts: null,
    setupComplete: false
  });

  if (!settings.subjectTemplate) {
    await chrome.storage.sync.set({ subjectTemplate: "Truck for {from} to {to}" });
  }

  if (!settings.emailBody) {
    await chrome.storage.sync.set({ emailBody: "MC 110082" });
  }

  if (settings.useDrafts === null) {
    await chrome.storage.sync.set({ useDrafts: true });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "open-options-page") {
    chrome.runtime.openOptionsPage();
  }

  if (message?.type === "gmail-account-detected" && message.email) {
    saveDetectedGmailAccount(message.email);
  }

  if (message?.type === "send-gmail-message") {
    sendGmailMessage(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || "Email failed to send." }));
    return true;
  }

  if (message?.type === "authorize-gmail-send") {
    authorizeGmailSend(message.email, { interactive: true })
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || "Gmail send authorization failed." }));
    return true;
  }

  if (message?.type === "get-gmail-send-redirect-uri") {
    sendResponse({ redirectUri: chrome.identity.getRedirectURL("gmail-send") });
  }
});

async function saveDetectedGmailAccount(rawEmail) {
  const email = rawEmail.trim().toLowerCase();
  const settings = await chrome.storage.sync.get({
    gmailAccounts: [],
    pendingGmailAccountSelection: false
  });

  if (!settings.pendingGmailAccountSelection || !email) return;

  const gmailAccounts = Array.isArray(settings.gmailAccounts)
    ? [...new Set([...settings.gmailAccounts, email])].sort()
    : [email];

  await chrome.storage.sync.set({
    gmailAccounts,
    selectedGmailEmail: email,
    pendingGmailAccountSelection: false,
    setupComplete: true
  });
}

function base64UrlEncode(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function buildRawEmail({ to, subject, body }) {
  const headers = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit"
  ];

  return base64UrlEncode(`${headers.join("\r\n")}\r\n\r\n${body}`);
}

function decodeJwtPayload(token) {
  const payload = token.split(".")[1];
  const paddedPayload = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "=");
  const json = atob(paddedPayload.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(json);
}

async function getGmailAccessToken(selectedGmailEmail, options = {}) {
  const interactive = options.interactive !== false;
  const redirectUri = chrome.identity.getRedirectURL("gmail-send");
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    response_type: "token id_token",
    redirect_uri: redirectUri,
    scope: `openid email profile ${GMAIL_SEND_SCOPE}`,
    include_granted_scopes: "true",
    prompt: "select_account consent",
    max_age: "0",
    nonce: crypto.randomUUID(),
    state: crypto.randomUUID()
  });

  if (selectedGmailEmail) {
    params.set("login_hint", selectedGmailEmail);
    params.set("authuser", selectedGmailEmail);
  }

  if (!interactive) {
    params.delete("prompt");
    params.delete("max_age");
  }

  const responseUrl = await chrome.identity.launchWebAuthFlow({
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    interactive
  });

  if (!responseUrl) {
    throw new Error("Google authorization was cancelled.");
  }

  const hashParams = new URLSearchParams(new URL(responseUrl).hash.slice(1));
  const accessToken = hashParams.get("access_token");
  const idToken = hashParams.get("id_token");

  if (!accessToken) {
    throw new Error("Google did not return a Gmail send token.");
  }

  if (!idToken) {
    throw new Error("Google did not return the selected account identity.");
  }

  const tokenEmail = (decodeJwtPayload(idToken).email || "").toLowerCase();
  const expectedEmail = selectedGmailEmail?.toLowerCase();

  if (!tokenEmail) {
    throw new Error("Google did not return the selected account email.");
  }

  if (expectedEmail && tokenEmail !== expectedEmail) {
    throw new Error(`Google authorized ${tokenEmail || "another account"}, but settings selected ${expectedEmail}.`);
  }

  return { accessToken, email: tokenEmail };
}

async function authorizeGmailSend(selectedGmailEmail, options = {}) {
  const authorization = await getGmailAccessToken(selectedGmailEmail, options);
  const email = authorization.email;

  const settings = await chrome.storage.sync.get({
    gmailAccounts: [],
    authorizedGmailSendAccounts: []
  });
  const gmailAccounts = Array.isArray(settings.gmailAccounts)
    ? [...new Set([...settings.gmailAccounts, email])].sort()
    : [email];
  const authorizedGmailSendAccounts = Array.isArray(settings.authorizedGmailSendAccounts)
    ? [...new Set([...settings.authorizedGmailSendAccounts, email])].sort()
    : [email];

  await chrome.storage.sync.set({
    gmailAccounts,
    selectedGmailEmail: email,
    authorizedGmailSendAccounts,
    setupComplete: true
  });

  return { email };
}

async function sendGmailMessage(payload) {
  if (!payload?.to || !payload?.subject || !payload?.body || !payload?.selectedGmailEmail) {
    throw new Error("Missing email details.");
  }

  let accessToken;

  try {
    accessToken = (await getGmailAccessToken(payload.selectedGmailEmail, { interactive: false })).accessToken;
  } catch {
    accessToken = (await getGmailAccessToken(payload.selectedGmailEmail, { interactive: true })).accessToken;
  }
  const response = await fetch(`https://www.googleapis.com/gmail/v1/users/${encodeURIComponent(payload.selectedGmailEmail)}/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      raw: buildRawEmail(payload)
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Gmail API returned ${response.status}.`);
  }

  return response.json();
}
